import { randomUUID } from "crypto";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-southeast-4";

const USERS_TABLE = process.env.USERS_TABLE;
const JOBS_TABLE = process.env.JOBS_TABLE;
const WORK_LOGS_TABLE = process.env.WORK_LOGS_TABLE; const WORKER_STATUS_TABLE = process.env.WORKER_STATUS_TABLE;
const SYNC_EVENTS_TABLE = process.env.SYNC_EVENTS_TABLE;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  },
);

const cognito = new CognitoIdentityProviderClient({ region: REGION });

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
    body: JSON.stringify(body),
  };
}

function getRequest(event) {
  return {
    method: event.requestContext?.http?.method || event.httpMethod || "GET",
    path: event.rawPath || event.path || "/",
  };
}

function getClaims(event) {
  return (
    event.requestContext?.authorizer?.jwt?.claims ||
    event.requestContext?.authorizer?.claims ||
    {}
  );
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

async function getUserProfile(event) {
  const tableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const claims = getClaims(event);
  const sub = claims.sub;
  const email = claims.email;

  if (!sub) {
    return {
      ok: false,
      response: json(401, {
        error: "Missing Cognito user claims. Protect this route with a Cognito authorizer.",
      }),
    };
  }

  const result = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        id: sub,
      },
    }),
  );

  if (!result.Item) {
    return {
      ok: false,
      response: json(404, {
        error: "User profile not found in AHloguUsers",
        id: sub,
        email: email || "",
      }),
    };
  }

  if (result.Item.isActive === false) {
    return {
      ok: false,
      response: json(403, {
        error: "User is inactive",
      }),
    };
  }

  return {
    ok: true,
    user: {
      ...result.Item,
      email: result.Item.email || email || "",
    },
  };
}

async function requireActiveUser(event) {
  const profile = await getUserProfile(event);

  if (!profile.ok) {
    return profile;
  }

  return profile;
}

async function requireAdminUser(event) {
  const profile = await getUserProfile(event);

  if (!profile.ok) {
    return profile;
  }

  if (!profile.user.isAdmin) {
    return {
      ok: false,
      response: json(403, {
        error: "Admin access required.",
      }),
    };
  }

  return profile;
}

async function getMe(event) {
  const profile = await requireActiveUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const user = profile.user;

  return json(200, {
    id: user.id,
    email: user.email || "",
    fullName: user.fullName || "",
    role: user.role || "",
    isAdmin: Boolean(user.isAdmin),
    isActive: user.isActive !== false,
  });
}



const ALLOWED_USER_ROLES = new Set([
  "plumber",
  "electrician",
  "gas_fitter",
  "hvac_technician",
  "refrigeration_technician",
  "apprentice",
  "supervisor",
  "other",
]);

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserRole(value) {
  const role = cleanString(value).toLowerCase();

  if (ALLOWED_USER_ROLES.has(role)) {
    return role;
  }

  if (role === "hvac technician") {
    return "hvac_technician";
  }

  if (role === "refrigeration technician") {
    return "refrigeration_technician";
  }

  if (role === "gas fitter") {
    return "gas_fitter";
  }

  return "other";
}

function getCreatedUserSub(cognitoUser) {
  const attributes = cognitoUser?.Attributes ?? [];
  const subAttribute = attributes.find((attribute) => attribute.Name === "sub");

  return subAttribute?.Value || "";
}

function normalizeJobIdForCompare(value) {
  return cleanString(value).toLowerCase();
}

async function findDuplicateJobByJobId(tableName, jobId, ignoreJobRecordId = "") {
  const normalizedJobId = normalizeJobIdForCompare(jobId);

  if (!normalizedJobId) {
    return null;
  }

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
    }),
  );

  return (result.Items ?? []).find((job) => {
    if (ignoreJobRecordId && String(job.id || "") === ignoreJobRecordId) {
      return false;
    }

    return normalizeJobIdForCompare(job.jobId) === normalizedJobId;
  }) || null;
}

function getJobLabel(job) {
  return cleanString(job.jobName) || cleanString(job.jobId) || cleanString(job.caseNo) || "job";
}

async function createUser(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const userPoolId = requireEnv("COGNITO_USER_POOL_ID", COGNITO_USER_POOL_ID);
  const body = parseBody(event);

  const email = cleanString(body.email || body.username).toLowerCase();
  const fullName = cleanString(body.fullName || body.name);
  const role = normalizeUserRole(body.role);
  const permissionLevel = cleanString(body.permissionLevel).toLowerCase();
  const isAdmin = permissionLevel === "admin" || body.isAdmin === true;
  const temporaryPassword = cleanString(body.temporaryPassword || body.password);

  if (!email || !email.includes("@")) {
    return json(400, {
      error: "Valid email is required.",
    });
  }

  if (!fullName) {
    return json(400, {
      error: "Full name is required.",
    });
  }

  if (temporaryPassword.length < 8) {
    return json(400, {
      error: "Temporary password must be at least 8 characters.",
    });
  }

  const created = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      TemporaryPassword: temporaryPassword,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        {
          Name: "email",
          Value: email,
        },
        {
          Name: "email_verified",
          Value: "true",
        },
        {
          Name: "name",
          Value: fullName,
        },
      ],
    }),
  );

  const userSub = getCreatedUserSub(created.User);

  if (!userSub) {
    return json(500, {
      error: "Cognito user was created but no sub was returned.",
    });
  }

  const now = new Date().toISOString();

  const user = {
    id: userSub,
    email,
    username: email,
    fullName,
    role,
    permissionLevel: isAdmin ? "admin" : "user",
    isAdmin,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: profile.user.id,
    createdByEmail: profile.user.email || "",
  };

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: user,
    }),
  );

  await putSyncEvent({
    type: "user.create",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: userSub,
  });

  return json(201, {
    ok: true,
    cloudId: userSub,
    user,
  });
}

async function listUsers(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("USERS_TABLE", USERS_TABLE);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
    }),
  );

  const users = (result.Items ?? [])
    .map((user) => ({
      id: String(user.id || ""),
      email: String(user.email || ""),
      username: String(user.email || user.username || ""),
      fullName: String(user.fullName || user.name || user.email || ""),
      role: String(user.role || "other"),
      permissionLevel: user.isAdmin ? "admin" : "user",
      isAdmin: Boolean(user.isAdmin),
      isActive: user.isActive !== false,
      createdAt: String(user.createdAt || ""),
      updatedAt: String(user.updatedAt || ""),
    }))
    .sort((a, b) => {
      if (a.permissionLevel !== b.permissionLevel) {
        return a.permissionLevel === "admin" ? -1 : 1;
      }

      return a.email.localeCompare(b.email);
    });

  return json(200, users);
}

async function updateUserActive(event, path) {
  const profile = await requireAdminUser(event);
  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const userPoolId = requireEnv("COGNITO_USER_POOL_ID", COGNITO_USER_POOL_ID);
  const id = decodeURIComponent(path.replace("/users/", ""));
  const body = parseBody(event);

  if (!id) {
    return json(400, {
      error: "Missing user id.",
    });
  }

  if (typeof body.isActive !== "boolean") {
    return json(400, {
      error: "isActive boolean is required.",
    });
  }

  if (id === profile.user.id && body.isActive === false) {
    return json(400, {
      error: "You cannot deactivate your own admin account.",
    });
  }

  const existingResult = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        id,
      },
    }),
  );

  if (!existingResult.Item) {
    return json(404, {
      error: "User not found.",
      id,
    });
  }

  const cognitoUsername = cleanString(
    existingResult.Item.email || existingResult.Item.username,
  );

  if (!cognitoUsername) {
    return json(400, {
      error: "User has no Cognito username/email saved.",
      id,
    });
  }

  if (body.isActive) {
    await cognito.send(
      new AdminEnableUserCommand({
        UserPoolId: userPoolId,
        Username: cognitoUsername,
      }),
    );
  } else {
    await cognito.send(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: cognitoUsername,
      }),
    );
  }

  const now = new Date().toISOString();

  const updateResult = await dynamo.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        id,
      },
      UpdateExpression: "SET #isActive = :isActive, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#isActive": "isActive",
      },
      ExpressionAttributeValues: {
        ":isActive": body.isActive,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  // Important:
  // Clear stale live status whenever active state changes.
  // Otherwise an old "available" row can stay in WORKER_STATUS_TABLE.
  if (WORKER_STATUS_TABLE) {
    await dynamo.send(
      new DeleteCommand({
        TableName: WORKER_STATUS_TABLE,
        Key: {
          id,
        },
      }),
    );
  }

  const user = updateResult.Attributes || {
    ...existingResult.Item,
    isActive: body.isActive,
    updatedAt: now,
  };

  await putSyncEvent({
    type: body.isActive ? "user.activate" : "user.deactivate",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: id,
  });

  return json(200, {
    ok: true,
    cloudId: id,
    user: {
      id: String(user.id || ""),
      email: String(user.email || ""),
      username: String(user.email || user.username || ""),
      fullName: String(user.fullName || user.name || user.email || ""),
      role: String(user.role || "other"),
      permissionLevel: user.isAdmin ? "admin" : "user",
      isAdmin: Boolean(user.isAdmin),
      isActive: user.isActive !== false,
      createdAt: String(user.createdAt || ""),
      updatedAt: String(user.updatedAt || ""),
    },
  });
}


async function resetUserPassword(event, path) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const userPoolId = requireEnv("COGNITO_USER_POOL_ID", COGNITO_USER_POOL_ID);
  const id = decodeURIComponent(
    path.replace("/users/", "").replace("/reset-password", ""),
  );
  const body = parseBody(event);
  const temporaryPassword = cleanString(body.temporaryPassword || body.password);

  if (!id) {
    return json(400, {
      error: "Missing user id.",
    });
  }

  if (id === profile.user.id) {
    return json(400, {
      error: "You cannot reset your own admin password from User Management.",
    });
  }

  if (temporaryPassword.length < 8) {
    return json(400, {
      error: "Temporary password must be at least 8 characters.",
    });
  }

  const existingResult = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        id,
      },
    }),
  );

  if (!existingResult.Item) {
    return json(404, {
      error: "User not found.",
      id,
    });
  }

  const cognitoUsername = cleanString(
    existingResult.Item.email || existingResult.Item.username,
  );

  if (!cognitoUsername) {
    return json(400, {
      error: "User has no Cognito username/email saved.",
      id,
    });
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: cognitoUsername,
      Password: temporaryPassword,
      Permanent: false,
    }),
  );

  await putSyncEvent({
    type: "user.resetPassword",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: id,
  });

  return json(200, {
    ok: true,
    cloudId: id,
  });
}

async function deleteUser(event, path) {
  const profile = await requireAdminUser(event);
  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const userPoolId = requireEnv("COGNITO_USER_POOL_ID", COGNITO_USER_POOL_ID);
  const id = decodeURIComponent(path.replace("/users/", ""));

  if (!id) {
    return json(400, {
      error: "Missing user id.",
    });
  }

  if (id === profile.user.id) {
    return json(400, {
      error: "You cannot delete your own admin account.",
    });
  }

  const existingResult = await dynamo.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        id,
      },
    }),
  );

  if (!existingResult.Item) {
    return json(404, {
      error: "User not found.",
      id,
    });
  }

  const cognitoUsername = cleanString(
    existingResult.Item.email || existingResult.Item.username,
  );

  if (!cognitoUsername) {
    return json(400, {
      error: "User has no Cognito username/email saved.",
      id,
    });
  }

  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username: cognitoUsername,
    }),
  );

  await dynamo.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        id,
      },
    }),
  );

  // Important:
  // Deleted users must disappear from Worker Status completely.
  if (WORKER_STATUS_TABLE) {
    await dynamo.send(
      new DeleteCommand({
        TableName: WORKER_STATUS_TABLE,
        Key: {
          id,
        },
      }),
    );
  }

  await putSyncEvent({
    type: "user.delete",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: id,
  });

  return json(200, {
    ok: true,
    cloudId: id,
  });
}

async function listJobs(event) {
  const profile = await requireActiveUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("JOBS_TABLE", JOBS_TABLE);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
    }),
  );

  const jobs = (result.Items ?? []).sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")),
  );

  return json(200, jobs);
}

async function createJob(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("JOBS_TABLE", JOBS_TABLE);
  const body = parseBody(event);
  const jobId = cleanString(body.jobId);

  if (!jobId) {
    return json(400, {
      error: "Job ID is required.",
    });
  }

  const duplicateJob = await findDuplicateJobByJobId(tableName, jobId);

  if (duplicateJob) {
    return json(409, {
      error: `Job ID already exists on ${getJobLabel(duplicateJob)}. Use a unique Job ID.`,
    });
  }

  const now = new Date().toISOString();
  const id = body.id || randomUUID();

  const job = {
    ...body,
    id,
    jobId,
    createdAt: body.createdAt || now,
    updatedAt: now,
  };

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: job,
    }),
  );

  return json(201, {
    ok: true,
    cloudId: id,
    job,
  });
}

async function updateJob(event, path) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("JOBS_TABLE", JOBS_TABLE);
  const id = decodeURIComponent(path.replace("/jobs/", ""));
  const body = parseBody(event);
  const jobId = cleanString(body.jobId);

  if (!id) {
    return json(400, {
      error: "Missing job id.",
    });
  }

  if (!jobId) {
    return json(400, {
      error: "Job ID is required.",
    });
  }

  const duplicateJob = await findDuplicateJobByJobId(tableName, jobId, id);

  if (duplicateJob) {
    return json(409, {
      error: `Job ID already exists on ${getJobLabel(duplicateJob)}. Use a unique Job ID.`,
    });
  }

  const job = {
    ...body,
    id,
    jobId,
    updatedAt: new Date().toISOString(),
  };

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: job,
    }),
  );

  return json(200, {
    ok: true,
    cloudId: id,
    job,
  });
}

async function deleteJob(event, path) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("JOBS_TABLE", JOBS_TABLE);
  const id = decodeURIComponent(path.replace("/jobs/", ""));

  if (!id) {
    return json(400, {
      error: "Missing job id.",
    });
  }

  await dynamo.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        id,
      },
    }),
  );

  return json(200, {
    ok: true,
    cloudId: id,
  });
}

async function putSyncEvent(item) {
  if (!SYNC_EVENTS_TABLE) {
    return;
  }

  await dynamo.send(
    new PutCommand({
      TableName: SYNC_EVENTS_TABLE,
      Item: {
        id: randomUUID(),
        ...item,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

async function uploadWorkLog(event) {
  const profile = await requireActiveUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("WORK_LOGS_TABLE", WORK_LOGS_TABLE);
  const body = parseBody(event);
  const now = new Date().toISOString();
  const id = body.id || randomUUID();

  const log = {
    ...body,
    id,
    uploadedBy: profile.user.id,
    uploadedByEmail: profile.user.email || "",
    uploadedAt: now,
  };

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: log,
    }),
  );

  await putSyncEvent({
    type: "workLog.upload",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: id,
  });

  return json(201, {
    ok: true,
    cloudId: id,
  });
}

async function uploadWorkLogsBulk(event) {
  const profile = await requireActiveUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("WORK_LOGS_TABLE", WORK_LOGS_TABLE);
  const body = parseBody(event);
  const logs = Array.isArray(body.logs) ? body.logs : [];

  if (logs.length === 0) {
    return json(400, {
      error: "Missing logs array.",
    });
  }

  const now = new Date().toISOString();
  const savedIds = [];

  for (const inputLog of logs) {
    const id = inputLog.id || randomUUID();

    const log = {
      ...inputLog,
      id,
      uploadedBy: profile.user.id,
      uploadedByEmail: profile.user.email || "",
      uploadedAt: now,
    };

    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: log,
      }),
    );

    savedIds.push(id);
  }

  await putSyncEvent({
    type: "workLog.bulkUpload",
    userId: profile.user.id,
    email: profile.user.email || "",
    count: savedIds.length,
  });

  return json(201, {
    ok: true,
    count: savedIds.length,
    cloudIds: savedIds,
  });
}


function normalizeWorkerStatus(body, profile) {
  const now = new Date().toISOString();
  const status = cleanString(body.status) || "online";

  const allowedStatuses = new Set([
    "online",
    "available",
    "working",
    "on_break",
    "offline",
  ]);

  return {
    userId: profile.user.id,
    fullName: cleanString(body.fullName) || cleanString(profile.user.fullName),
    email: cleanString(body.email) || cleanString(profile.user.email),
    role: normalizeUserRole(body.role || profile.user.role),
    status: allowedStatuses.has(status) ? status : "online",

    currentJobId: cleanString(body.currentJobId),
    currentJobName: cleanString(body.currentJobName),
    currentJobLocation: cleanString(body.currentJobLocation),

    startedAt: cleanString(body.startedAt),
    breakStartedAt: cleanString(body.breakStartedAt),
    breakMinutes: Number.isFinite(Number(body.breakMinutes))
      ? Number(body.breakMinutes)
      : 0,

    pendingSyncCount: Number.isFinite(Number(body.pendingSyncCount))
      ? Number(body.pendingSyncCount)
      : 0,
    failedSyncCount: Number.isFinite(Number(body.failedSyncCount))
      ? Number(body.failedSyncCount)
      : 0,
    oldestPendingSyncAt: cleanString(body.oldestPendingSyncAt),

    lastSeenAt: now,
    updatedAt: now,
  };
}

function isWorkerStatusVisibleUser(user) {
  const permissionLevel = cleanString(user.permissionLevel).toLowerCase();
  const permissionLevelSnake = cleanString(user.permission_level).toLowerCase();

  if (permissionLevel === "admin") return false;
  if (permissionLevelSnake === "admin") return false;
  if (user.isAdmin === true) return false;
  if (user.admin === true) return false;

  return true;
}

async function listWorkerStatus(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const usersTableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const workerStatusTableName = requireEnv(
    "WORKER_STATUS_TABLE",
    WORKER_STATUS_TABLE,
  );

  const [usersResult, statusResult] = await Promise.all([
    dynamo.send(
      new ScanCommand({
        TableName: usersTableName,
      }),
    ),
    dynamo.send(
      new ScanCommand({
        TableName: workerStatusTableName,
      }),
    ),
  ]);

  const nowMs = Date.now();
  const statusByUserId = new Map();

  for (const item of statusResult.Items ?? []) {
    const userId = cleanString(item.userId) || cleanString(item.id);

    if (!userId) continue;

    statusByUserId.set(userId, item);
  }

  const statuses = (usersResult.Items ?? [])
    .filter(isWorkerStatusVisibleUser)
    .map((user) => {
      const userId = cleanString(user.id) || cleanString(user.userId);
      const statusItem = statusByUserId.get(userId);

      const isDeactivated =
        user.isActive === false ||
        cleanString(user.status).toLowerCase() === "inactive" ||
        cleanString(user.status).toLowerCase() === "deactivated";

      const lastSeenAt = cleanString(statusItem?.lastSeenAt || statusItem?.updatedAt);
      const lastSeenMs = Date.parse(lastSeenAt);
      const isStale =
        !Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > 15 * 60 * 1000;

      const lastKnownStatus = cleanString(statusItem?.status) || "offline";

      const liveStatus = isDeactivated
        ? "deactivated"
        : statusItem
          ? isStale
            ? "offline"
            : lastKnownStatus || "online"
          : "offline";

      return {
        userId,
        fullName:
          cleanString(statusItem?.fullName) ||
          cleanString(user.fullName) ||
          cleanString(user.name),
        email:
          cleanString(statusItem?.email) ||
          cleanString(user.email) ||
          cleanString(user.username),
        role: cleanString(statusItem?.role) || cleanString(user.role) || "other",
        status: liveStatus,
        lastKnownStatus,

        currentJobId:
          isDeactivated || !statusItem ? "" : cleanString(statusItem.currentJobId),
        currentJobName:
          isDeactivated || !statusItem ? "" : cleanString(statusItem.currentJobName),
        currentJobLocation:
          isDeactivated || !statusItem
            ? ""
            : cleanString(statusItem.currentJobLocation),

        startedAt:
          isDeactivated || !statusItem ? "" : cleanString(statusItem.startedAt),
        breakStartedAt:
          isDeactivated || !statusItem
            ? ""
            : cleanString(statusItem.breakStartedAt),
        breakMinutes: isDeactivated ? 0 : Number(statusItem?.breakMinutes || 0),

        pendingSyncCount: isDeactivated
          ? 0
          : Number(statusItem?.pendingSyncCount || 0),
        failedSyncCount: isDeactivated
          ? 0
          : Number(statusItem?.failedSyncCount || 0),
        oldestPendingSyncAt: isDeactivated
          ? ""
          : cleanString(statusItem?.oldestPendingSyncAt),

        lastSeenAt,
        updatedAt: cleanString(statusItem?.updatedAt),
      };
    })
    .filter((status) => status.userId);

  statuses.sort((a, b) => {
    const nameA = a.fullName || a.email || a.userId;
    const nameB = b.fullName || b.email || b.userId;
    return nameA.localeCompare(nameB);
  });

  return json(200, statuses);
}

async function updateMyWorkerStatus(event) {
  const profile = await requireActiveUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("WORKER_STATUS_TABLE", WORKER_STATUS_TABLE);
  const body = parseBody(event);
  const status = normalizeWorkerStatus(body, profile);

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        id: profile.user.id,
        ...status,
      },
    }),
  );

  return json(200, {
    ok: true,
    cloudId: profile.user.id,
    status,
  });
}

export const handler = async (event) => {
  try {
    const { method, path } = getRequest(event);

    if (method === "OPTIONS") {
      return json(204, {});
    }

    if (method === "GET" && path === "/health") {
      return json(200, {
        ok: true,
        service: "AHloguApi",
        time: new Date().toISOString(),
      });
    }

    if (method === "GET" && path === "/me") {
      return getMe(event);
    }

    if (method === "POST" && path === "/users") {
      return createUser(event);
    }

    if (method === "GET" && path === "/users") {
      return listUsers(event);
    }

    if (
      method === "POST" &&
      path.startsWith("/users/") &&
      path.endsWith("/reset-password")
    ) {
      return resetUserPassword(event, path);
    }

    if (method === "PUT" && path.startsWith("/users/")) {
      return updateUserActive(event, path);
    }

    if (method === "DELETE" && path.startsWith("/users/")) {
      return deleteUser(event, path);
    }

    if (method === "GET" && path === "/jobs") {
      return listJobs(event);
    }

    if (method === "POST" && path === "/jobs") {
      return createJob(event);
    }

    if (method === "PUT" && path.startsWith("/jobs/")) {
      return updateJob(event, path);
    }

    if (method === "DELETE" && path.startsWith("/jobs/")) {
      return deleteJob(event, path);
    }
    if (method === "GET" && path === "/worker-status") {
      return listWorkerStatus(event);
    }

    if (method === "PUT" && path === "/worker-status/me") {
      return updateMyWorkerStatus(event);
    }



    if (method === "POST" && path === "/work-logs") {
      return uploadWorkLog(event);
    }

    if (method === "POST" && path === "/work-logs/bulk") {
      return uploadWorkLogsBulk(event);
    }

    return json(404, {
      error: "Route not found",
      method,
      path,
    });
  } catch (error) {
    console.error("AHloguApi error:", error);

    return json(500, {
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
