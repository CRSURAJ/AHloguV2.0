import { randomUUID } from "crypto";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
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
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;
const WORK_LOGS_TABLE = process.env.WORK_LOGS_TABLE;
const WORKER_STATUS_TABLE = process.env.WORKER_STATUS_TABLE;
const SYNC_EVENTS_TABLE = process.env.SYNC_EVENTS_TABLE;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

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
    event.requestContext?.authorizer?.jwt?.claims || event.requestContext?.authorizer?.claims || {}
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

// Issue 8 — pagination helpers
function parsePaginationParams(event) {
  const qs = event.queryStringParameters || {};
  const limit = parseInt(qs.limit, 10);
  const nextToken = qs.nextToken || undefined;
  return {
    limit: Number.isFinite(limit) && limit > 0 && limit <= 1000 ? limit : undefined,
    exclusiveStartKey: nextToken
      ? JSON.parse(Buffer.from(nextToken, "base64").toString("utf8"))
      : undefined,
  };
}

function encodeNextToken(lastEvaluatedKey) {
  if (!lastEvaluatedKey) return undefined;
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString("base64");
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

function getUserPermissionLevel(user) {
  const permissionLevel = cleanString(user?.permissionLevel).toLowerCase();

  if (permissionLevel === "admin" || user?.isAdmin === true) {
    return "admin";
  }

  if (permissionLevel === "manager") {
    return "manager";
  }

  return "worker";
}

function isFullAdminUser(user) {
  return getUserPermissionLevel(user) === "admin";
}

function isManagementUser(user) {
  const permissionLevel = getUserPermissionLevel(user);
  return permissionLevel === "admin" || permissionLevel === "manager";
}

function normalizeRequestedPermissionLevel(value, isAdminFlag = false) {
  const permissionLevel = cleanString(value).toLowerCase();

  if (permissionLevel === "admin") return "admin";
  if (permissionLevel === "manager") return "manager";
  if (permissionLevel === "worker" || permissionLevel === "user") return "worker";

  return isAdminFlag === true ? "admin" : "worker";
}

async function requireAdminUser(event) {
  const profile = await getUserProfile(event);

  if (!profile.ok) {
    return profile;
  }

  if (!isManagementUser(profile.user)) {
    return {
      ok: false,
      response: json(403, {
        error: "Admin or Manager access required.",
      }),
    };
  }

  return profile;
}

async function requireFullAdminUser(event) {
  const profile = await getUserProfile(event);

  if (!profile.ok) {
    return profile;
  }

  if (!isFullAdminUser(profile.user)) {
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
    permissionLevel: getUserPermissionLevel(user),
    isAdmin: isFullAdminUser(user),
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

function cleanText(value, maxLength) {
  return cleanString(value).slice(0, maxLength);
}

const MAX_SHIFT_MINUTES = 24 * 60;

function clampNonNegativeInt(value, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  return Math.min(Math.max(0, Math.round(parsed)), max);
}

// Shared by single + bulk upload. Identity fields come from the
// authenticated profile (not the body), and minute totals are bounded by
// the shift's own timestamps so payroll data cannot be inflated.
function normalizeWorkLogInput(inputLog, profile, now) {
  const loguId = cleanText(inputLog.loguId, 120);
  // Idempotency: derive the key from uploader + client loguId so offline
  // retries of the same log map to the same record instead of duplicating it.
  const id = loguId ? `${profile.user.id}::${loguId}` : randomUUID();

  const startedAt = cleanText(inputLog.startedAt, 40);
  const stoppedAt = cleanText(inputLog.stoppedAt, 40);
  const startMs = Date.parse(startedAt);
  const stopMs = Date.parse(stoppedAt);
  const grossMinutes =
    Number.isFinite(startMs) && Number.isFinite(stopMs)
      ? Math.max(0, Math.round((stopMs - startMs) / 60_000))
      : MAX_SHIFT_MINUTES;
  const maxMinutes = Math.min(grossMinutes, MAX_SHIFT_MINUTES);

  return {
    id,
    loguId,
    ts: typeof inputLog.ts === "number" ? inputLog.ts : Date.now(),
    fullname:
      cleanText(profile.user.fullName, 120) ||
      cleanText(inputLog.fullname || inputLog.fullName, 120),
    jobId: cleanText(inputLog.jobId, 120),
    location: cleanText(inputLog.location, 300),
    role: normalizeUserRole(inputLog.role || profile.user.role),
    jobDocs: cleanText(inputLog.jobDocs, 2000),
    description: cleanText(inputLog.description, 2000),
    startedAt,
    stoppedAt,
    breakMinutes: clampNonNegativeInt(inputLog.breakMinutes, maxMinutes),
    workedMinutes: clampNonNegativeInt(inputLog.workedMinutes, maxMinutes),
    stickyNote: cleanText(inputLog.stickyNote, 2000),
    syncStatus: "synced",
    uploadedBy: profile.user.id,
    uploadedByEmail: profile.user.email || "",
    uploadedAt: now,
    syncedAt: now,
  };
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

// Issue 4 — add ProjectionExpression to only fetch the two fields needed
async function findDuplicateJobByJobId(tableName, jobId, ignoreJobRecordId = "") {
  const normalizedJobId = normalizeJobIdForCompare(jobId);

  if (!normalizedJobId) {
    return null;
  }

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      ProjectionExpression: "id, jobId",
    }),
  );

  return (
    (result.Items ?? []).find((job) => {
      if (ignoreJobRecordId && String(job.id || "") === ignoreJobRecordId) {
        return false;
      }

      return normalizeJobIdForCompare(job.jobId) === normalizedJobId;
    }) || null
  );
}

function getJobLabel(job) {
  return cleanString(job.jobName) || cleanString(job.jobId) || cleanString(job.caseNo) || "job";
}

// --- Project-management field sanitizers -----------------------------------
// The delivery-board workflow (stage, gates, trades, dates) is stored on the
// job record. Everything below is sanitized server-side before persistence so
// a malicious client cannot store arbitrary shapes.
const PROJECT_STAGE_KEYS = new Set([
  "handover",
  "procurement",
  "engineering",
  "build",
  "qa",
  "dispatch",
  "commissioning",
  "closed",
]);
const PROJECT_TRADE_STATES = new Set(["not_started", "in_progress", "complete", "signed_off"]);

function cleanProjectStage(value) {
  return PROJECT_STAGE_KEYS.has(value) ? value : "handover";
}

// Parses a human contract-value string ("$186k", "1.2M", "186,000") into
// whole dollars — mirrors parseMoney in lib/projectManagement.ts.
function parseProjectMoney(input) {
  if (typeof input !== "string") return null;

  const raw = input
    .trim()
    .toLowerCase()
    .replace(/aud/g, "")
    .replace(/[$,\s]/g, "");
  if (!raw) return null;

  const match = raw.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!match) return null;

  const multiplier = match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : 1;
  return Math.round(parseFloat(match[1]) * multiplier);
}

function cleanProjectValueAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function cleanProjectDepartment(value) {
  return value === "install" || value === "service" ? value : "install";
}

function cleanIsoDateOrNull(value) {
  const str = cleanString(value);
  if (!str) return null;

  return Number.isNaN(Date.parse(str)) ? null : str;
}

function cleanSignOff(value) {
  if (!value || typeof value !== "object") return null;

  const by = cleanText(value.by, 200);
  if (!by) return null;

  const at = cleanString(value.at);
  const signoff = {
    by,
    at: at && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString(),
    comment: cleanText(value.comment, 2000),
  };

  const documentUrl = cleanText(value.documentUrl, 2000);
  const documentTitle = cleanText(value.documentTitle, 300);
  if (documentUrl) signoff.documentUrl = documentUrl;
  if (documentTitle) signoff.documentTitle = documentTitle;

  return signoff;
}

function cleanProjectTrades(value) {
  if (!value || typeof value !== "object") return {};

  const out = {};

  for (const [key, trade] of Object.entries(value)) {
    if (!trade || typeof trade !== "object") continue;

    const cleanKey = cleanText(key, 60);
    if (!cleanKey) continue;

    const checklist = Array.isArray(trade.checklist)
      ? trade.checklist
          .slice(0, 50)
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;

            const label = cleanText(entry.label, 300);
            if (!label) return null;

            return { label, signoff: cleanSignOff(entry.signoff) };
          })
          .filter(Boolean)
      : [];

    out[cleanKey] = {
      state: PROJECT_TRADE_STATES.has(trade.state) ? trade.state : "not_started",
      blocked: trade.blocked === true,
      reason: cleanText(trade.reason, 500),
      checklist,
    };
  }

  return out;
}

function cleanProjectGates(value) {
  if (!value || typeof value !== "object") return {};

  const out = {};

  for (const [stageKey, criteria] of Object.entries(value)) {
    if (!PROJECT_STAGE_KEYS.has(stageKey) || !criteria || typeof criteria !== "object") continue;

    const stageGate = {};

    for (const [criterionId, signoff] of Object.entries(criteria)) {
      const id = cleanText(criterionId, 60);
      if (!id) continue;

      stageGate[id] = cleanSignOff(signoff);
    }

    out[stageKey] = stageGate;
  }

  return out;
}

function cleanProjectDateLog(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 200)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const field =
        entry.field === "delivery" ? "delivery" : entry.field === "target" ? "target" : null;
      const to = cleanIsoDateOrNull(entry.to);
      if (!field || !to) return null;

      const out = {
        field,
        from: cleanIsoDateOrNull(entry.from),
        to,
        at: cleanIsoDateOrNull(entry.at) || new Date().toISOString(),
        by: cleanText(entry.by, 200),
        reason: cleanText(entry.reason, 500),
      };

      if (PROJECT_STAGE_KEYS.has(entry.stage)) {
        out.stage = entry.stage;
      }

      return out;
    })
    .filter(Boolean);
}

const PROJECT_ACTIVITY_KINDS = new Set(["stage", "field", "blocked"]);

function cleanProjectActivityLog(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 500)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      if (!PROJECT_ACTIVITY_KINDS.has(entry.kind)) return null;

      return {
        kind: entry.kind,
        field: cleanText(entry.field, 100),
        from: cleanText(entry.from, 500),
        to: cleanText(entry.to, 500),
        at: cleanIsoDateOrNull(entry.at) || new Date().toISOString(),
        by: cleanText(entry.by, 200),
        note: cleanText(entry.note, 500),
      };
    })
    .filter(Boolean);
}

function cleanProjectStageTargets(value) {
  if (!value || typeof value !== "object") return {};

  const out = {};

  for (const [key, raw] of Object.entries(value)) {
    if (!PROJECT_STAGE_KEYS.has(key)) continue;
    out[key] = cleanIsoDateOrNull(raw);
  }

  return out;
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
  const requestedPermissionLevel = normalizeRequestedPermissionLevel(
    body.permissionLevel,
    body.isAdmin === true,
  );
  const isAdmin = requestedPermissionLevel === "admin";
  const temporaryPassword = cleanString(body.temporaryPassword || body.password);

  if (getUserPermissionLevel(profile.user) === "manager" && requestedPermissionLevel === "admin") {
    return json(403, {
      error: "Managers cannot create admin users.",
    });
  }

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

  let userSub;

  try {
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

    userSub = getCreatedUserSub(created.User);
  } catch (error) {
    if (error?.name !== "UsernameExistsException") {
      throw error;
    }

    // A previous attempt may have created the Cognito user and then died
    // before writing the DynamoDB profile. If the profile is missing,
    // backfill it instead of failing on every retry forever.
    const existing = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    );

    const existingSub =
      existing.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value || "";

    if (!existingSub) {
      return json(409, { error: "A user with this email already exists." });
    }

    const existingProfile = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: existingSub },
      }),
    );

    if (existingProfile.Item) {
      return json(409, { error: "A user with this email already exists." });
    }

    userSub = existingSub;
  }

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
    permissionLevel: requestedPermissionLevel,
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

// Issue 8 — listUsers with pagination
async function listUsers(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const actorPermissionLevel = getUserPermissionLevel(profile.user);
  const { limit, exclusiveStartKey } = parsePaginationParams(event);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      ...(limit && { Limit: limit }),
      ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
    }),
  );

  const users = (result.Items ?? [])
    .map((user) => ({
      id: String(user.id || ""),
      email: String(user.email || ""),
      username: String(user.email || user.username || ""),
      fullName: String(user.fullName || user.name || user.email || ""),
      role: String(user.role || "other"),
      permissionLevel: getUserPermissionLevel(user),
      isAdmin: isFullAdminUser(user),
      isActive: user.isActive !== false,
      createdAt: String(user.createdAt || ""),
      updatedAt: String(user.updatedAt || ""),
    }))
    .filter((user) => actorPermissionLevel === "admin" || user.permissionLevel !== "admin")
    .sort((a, b) => {
      const permissionRank = {
        admin: 0,
        manager: 1,
        worker: 2,
      };

      if (a.permissionLevel !== b.permissionLevel) {
        return permissionRank[a.permissionLevel] - permissionRank[b.permissionLevel];
      }

      return a.email.localeCompare(b.email);
    });

  return json(200, { items: users, nextToken: encodeNextToken(result.LastEvaluatedKey) });
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

  if (
    getUserPermissionLevel(profile.user) === "manager" &&
    getUserPermissionLevel(existingResult.Item) === "admin"
  ) {
    return json(403, {
      error: "Managers cannot activate or deactivate admin users.",
    });
  }

  const cognitoUsername = cleanString(existingResult.Item.email || existingResult.Item.username);

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
      permissionLevel: getUserPermissionLevel(user),
      isAdmin: isFullAdminUser(user),
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
  const id = decodeURIComponent(path.replace("/users/", "").replace("/reset-password", ""));
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

  if (
    getUserPermissionLevel(profile.user) === "manager" &&
    getUserPermissionLevel(existingResult.Item) === "admin"
  ) {
    return json(403, {
      error: "Managers cannot reset admin passwords.",
    });
  }

  const cognitoUsername = cleanString(existingResult.Item.email || existingResult.Item.username);

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
  const profile = await requireFullAdminUser(event);
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

  const cognitoUsername = cleanString(existingResult.Item.email || existingResult.Item.username);

  if (!cognitoUsername) {
    return json(400, {
      error: "User has no Cognito username/email saved.",
      id,
    });
  }

  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: cognitoUsername,
      }),
    );
  } catch (error) {
    if (error?.name !== "UserNotFoundException") {
      throw error;
    }
    // Already gone from Cognito — still remove the orphaned profile row.
  }

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

// Issue 8 — listJobs with pagination
async function listJobs(event) {
  const profile = await requireActiveUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("JOBS_TABLE", JOBS_TABLE);
  const { limit, exclusiveStartKey } = parsePaginationParams(event);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      ...(limit && { Limit: limit }),
      ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
    }),
  );

  const jobs = (result.Items ?? []).sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(
      String(a.updatedAt || a.createdAt || ""),
    ),
  );

  return json(200, { items: jobs, nextToken: encodeNextToken(result.LastEvaluatedKey) });
}

// Issues 1, 2, 13 — explicit allowlist, server-side ID, server-side createdAt, ConditionExpression
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
  // Issue 2 — always generate ID server-side
  const id = randomUUID();

  // Issue 1 — explicit allowlist; Issue 13 — createdAt always server-side
  const job = {
    id,
    jobId,
    caseNo: cleanString(body.caseNo),
    orderNo: cleanString(body.orderNo),
    jobName: cleanString(body.jobName),
    customerName: cleanString(body.customerName),
    location: cleanString(body.location),
    description: cleanString(body.description),
    assignedRoles: Array.isArray(body.assignedRoles)
      ? body.assignedRoles.filter((r) => ALLOWED_USER_ROLES.has(String(r).toLowerCase()))
      : [],
    jobDocumentLinks: Array.isArray(body.jobDocumentLinks) ? body.jobDocumentLinks : [],
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    projectId: cleanText(body.projectId, 120),
    createdAt: now,
    updatedAt: now,
    createdBy: profile.user.id,
    createdByEmail: profile.user.email || "",
  };

  // Issue 2 — ConditionExpression prevents overwriting an existing record
  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: job,
      ConditionExpression: "attribute_not_exists(id)",
    }),
  );

  return json(201, {
    ok: true,
    cloudId: id,
    job,
  });
}

// Issues 1, 2 — explicit allowlist, server-side ID
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
      error: "Job not found.",
      id,
    });
  }

  if (existingResult.Item.isArchived === true || existingResult.Item.isArchived === "true") {
    return json(400, {
      error: "Archived jobs cannot be edited.",
    });
  }

  if (
    getUserPermissionLevel(profile.user) === "manager" &&
    (body.isArchived === true ||
      body.isArchived === "true" ||
      cleanString(body.archivedAt) ||
      cleanString(body.archivedBy))
  ) {
    return json(403, {
      error: "Managers cannot archive jobs.",
    });
  }

  const duplicateJob = await findDuplicateJobByJobId(tableName, jobId, id);

  if (duplicateJob) {
    return json(409, {
      error: `Job ID already exists on ${getJobLabel(duplicateJob)}. Use a unique Job ID.`,
    });
  }

  // Issue 1 — explicit allowlist; merge existing fields for fields not provided
  const existing = existingResult.Item;
  const job = {
    id,
    jobId,
    caseNo: body.caseNo !== undefined ? cleanString(body.caseNo) : cleanString(existing.caseNo),
    orderNo: body.orderNo !== undefined ? cleanString(body.orderNo) : cleanString(existing.orderNo),
    jobName: body.jobName !== undefined ? cleanString(body.jobName) : cleanString(existing.jobName),
    customerName:
      body.customerName !== undefined
        ? cleanString(body.customerName)
        : cleanString(existing.customerName),
    location:
      body.location !== undefined ? cleanString(body.location) : cleanString(existing.location),
    description:
      body.description !== undefined
        ? cleanString(body.description)
        : cleanString(existing.description),
    assignedRoles: Array.isArray(body.assignedRoles)
      ? body.assignedRoles.filter((r) => ALLOWED_USER_ROLES.has(String(r).toLowerCase()))
      : Array.isArray(existing.assignedRoles)
        ? existing.assignedRoles
        : [],
    jobDocumentLinks: Array.isArray(body.jobDocumentLinks)
      ? body.jobDocumentLinks
      : Array.isArray(existing.jobDocumentLinks)
        ? existing.jobDocumentLinks
        : [],
    isActive: typeof body.isActive === "boolean" ? body.isActive : existing.isActive !== false,
    projectId:
      body.projectId !== undefined
        ? cleanText(body.projectId, 120)
        : cleanText(existing.projectId, 120),
    isArchived: false,
    createdAt: cleanString(existing.createdAt),
    createdBy: cleanString(existing.createdBy),
    createdByEmail: cleanString(existing.createdByEmail),
    updatedAt: new Date().toISOString(),
    updatedBy: profile.user.id,
    updatedByEmail: profile.user.email || "",
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

// Issue 10 — cap parallel DynamoDB writes in batches of 25
async function archiveJob(event, path) {
  const profile = await requireFullAdminUser(event);
  if (!profile.ok) {
    return profile.response;
  }

  const jobsTableName = requireEnv("JOBS_TABLE", JOBS_TABLE);
  const workLogsTableName = requireEnv("WORK_LOGS_TABLE", WORK_LOGS_TABLE);
  const id = decodeURIComponent(path.replace("/jobs/", "").replace("/archive", ""));

  if (!id) {
    return json(400, { error: "Missing job id." });
  }

  const now = new Date().toISOString();
  const archivedBy = profile.user.email || profile.user.id || "";

  const updatedJob = await dynamo.send(
    new UpdateCommand({
      TableName: jobsTableName,
      Key: { id },
      UpdateExpression:
        "SET isArchived = :isArchived, isActive = :isActive, archivedAt = :archivedAt, archivedBy = :archivedBy, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":isArchived": true,
        ":isActive": false,
        ":archivedAt": now,
        ":archivedBy": archivedBy,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  const archivedJob = updatedJob.Attributes || null;
  const jobId = archivedJob?.jobId || "";

  let updatedLogCount = 0;

  if (jobId) {
    let ExclusiveStartKey;

    do {
      const scanResult = await dynamo.send(
        new ScanCommand({
          TableName: workLogsTableName,
          FilterExpression: "#jobId = :jobId",
          ExpressionAttributeNames: {
            "#jobId": "jobId",
          },
          ExpressionAttributeValues: {
            ":jobId": jobId,
          },
          ExclusiveStartKey,
        }),
      );

      const logs = scanResult.Items || [];
      const logsToUpdate = logs.filter((log) => log?.id);
      const UPDATE_BATCH_SIZE = 25;

      for (let i = 0; i < logsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        const batchSlice = logsToUpdate.slice(i, i + UPDATE_BATCH_SIZE);
        await Promise.all(
          batchSlice.map((log) =>
            dynamo.send(
              new UpdateCommand({
                TableName: workLogsTableName,
                Key: { id: log.id },
                UpdateExpression:
                  "SET isJobArchived = :isJobArchived, jobArchivedAt = :jobArchivedAt, jobArchivedBy = :jobArchivedBy, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                  ":isJobArchived": true,
                  ":jobArchivedAt": now,
                  ":jobArchivedBy": archivedBy,
                  ":updatedAt": now,
                },
              }),
            ),
          ),
        );
      }

      updatedLogCount += logsToUpdate.length;
      ExclusiveStartKey = scanResult.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }

  await putSyncEvent({
    type: "job.archive",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: id,
  });

  return json(200, {
    ok: true,
    cloudId: id,
    message: `Job archived. ${updatedLogCount} work log(s) moved to archived job logs.`,
  });
}

async function deleteJob(event, path) {
  const profile = await requireFullAdminUser(event);

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

// --- Projects ---------------------------------------------------------------
// A Project is the post-sale delivery pipeline entity (Handover → … → Closed)
// tracked on the delivery board. Jobs (worker work orders) are created under a
// project in the Build phase and link back via job.projectId.

async function findDuplicateProjectByRef(tableName, projectRef, ignoreRecordId = "") {
  const normalizedRef = normalizeJobIdForCompare(projectRef);

  if (!normalizedRef) {
    return null;
  }

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      ProjectionExpression: "id, projectRef",
    }),
  );

  return (
    (result.Items ?? []).find((project) => {
      if (ignoreRecordId && String(project.id || "") === ignoreRecordId) {
        return false;
      }

      return normalizeJobIdForCompare(project.projectRef) === normalizedRef;
    }) || null
  );
}

function getProjectLabel(project) {
  return cleanString(project.customerName) || cleanString(project.projectRef) || "project";
}

// Same allowlist + sanitize approach as jobs — a client cannot store
// arbitrary shapes in gates/trades/dateLog.
function buildProjectItem(body, existing = {}) {
  return {
    projectRef: cleanText(body.projectRef ?? existing.projectRef, 60),
    customerName: cleanText(body.customerName ?? existing.customerName, 300),
    location: cleanText(body.location ?? existing.location, 300),
    description: cleanText(body.description ?? existing.description, 2000),
    department:
      body.department !== undefined
        ? cleanProjectDepartment(body.department)
        : cleanProjectDepartment(existing.department),
    value: body.value !== undefined ? cleanText(body.value, 60) : cleanText(existing.value, 60),
    valueAmount:
      body.valueAmount !== undefined
        ? cleanProjectValueAmount(body.valueAmount)
        : body.value !== undefined
          ? parseProjectMoney(body.value)
          : (cleanProjectValueAmount(existing.valueAmount) ?? parseProjectMoney(existing.value)),
    stage:
      body.stage !== undefined ? cleanProjectStage(body.stage) : cleanProjectStage(existing.stage),
    gates:
      body.gates !== undefined ? cleanProjectGates(body.gates) : cleanProjectGates(existing.gates),
    trades:
      body.trades !== undefined
        ? cleanProjectTrades(body.trades)
        : cleanProjectTrades(existing.trades),
    blocked: body.blocked !== undefined ? body.blocked === true : existing.blocked === true,
    blockedReason:
      body.blockedReason !== undefined
        ? cleanText(body.blockedReason, 500)
        : cleanText(existing.blockedReason, 500),
    targetDate:
      body.targetDate !== undefined
        ? cleanIsoDateOrNull(body.targetDate)
        : cleanIsoDateOrNull(existing.targetDate),
    deliveryDate:
      body.deliveryDate !== undefined
        ? cleanIsoDateOrNull(body.deliveryDate)
        : cleanIsoDateOrNull(existing.deliveryDate),
    stageTargets:
      body.stageTargets !== undefined
        ? cleanProjectStageTargets(body.stageTargets)
        : cleanProjectStageTargets(existing.stageTargets),
    dateLog:
      body.dateLog !== undefined
        ? cleanProjectDateLog(body.dateLog)
        : cleanProjectDateLog(existing.dateLog),
    activityLog:
      body.activityLog !== undefined
        ? cleanProjectActivityLog(body.activityLog)
        : cleanProjectActivityLog(existing.activityLog),
  };
}

async function listProjects(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("PROJECTS_TABLE", PROJECTS_TABLE);
  const { limit, exclusiveStartKey } = parsePaginationParams(event);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      ...(limit && { Limit: limit }),
      ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
    }),
  );

  const projects = (result.Items ?? []).sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(
      String(a.updatedAt || a.createdAt || ""),
    ),
  );

  return json(200, { items: projects, nextToken: encodeNextToken(result.LastEvaluatedKey) });
}

async function createProject(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("PROJECTS_TABLE", PROJECTS_TABLE);
  const body = parseBody(event);
  const projectRef = cleanString(body.projectRef);

  if (!projectRef) {
    return json(400, {
      error: "Project reference is required.",
    });
  }

  if (!cleanString(body.customerName)) {
    return json(400, {
      error: "Customer / site is required.",
    });
  }

  const duplicate = await findDuplicateProjectByRef(tableName, projectRef);

  if (duplicate) {
    return json(409, {
      error: `Project reference already exists on ${getProjectLabel(duplicate)}. Use a unique reference.`,
    });
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const project = {
    id,
    ...buildProjectItem(body),
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    createdBy: profile.user.id,
    createdByEmail: profile.user.email || "",
  };

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: project,
      ConditionExpression: "attribute_not_exists(id)",
    }),
  );

  return json(201, {
    ok: true,
    cloudId: id,
    project,
  });
}

async function updateProject(event, path) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("PROJECTS_TABLE", PROJECTS_TABLE);
  const id = decodeURIComponent(path.replace("/projects/", ""));
  const body = parseBody(event);

  if (!id) {
    return json(400, {
      error: "Missing project id.",
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
      error: "Project not found.",
      id,
    });
  }

  const existing = existingResult.Item;
  const projectRef = cleanString(body.projectRef ?? existing.projectRef);

  if (!projectRef) {
    return json(400, {
      error: "Project reference is required.",
    });
  }

  const duplicate = await findDuplicateProjectByRef(tableName, projectRef, id);

  if (duplicate) {
    return json(409, {
      error: `Project reference already exists on ${getProjectLabel(duplicate)}. Use a unique reference.`,
    });
  }

  const project = {
    id,
    ...buildProjectItem(body, existing),
    isArchived: existing.isArchived === true || existing.isArchived === "true",
    createdAt: cleanString(existing.createdAt),
    createdBy: cleanString(existing.createdBy),
    createdByEmail: cleanString(existing.createdByEmail),
    updatedAt: new Date().toISOString(),
    updatedBy: profile.user.id,
    updatedByEmail: profile.user.email || "",
  };

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: project,
    }),
  );

  return json(200, {
    ok: true,
    cloudId: id,
    project,
  });
}

async function deleteProject(event, path) {
  const profile = await requireFullAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("PROJECTS_TABLE", PROJECTS_TABLE);
  const id = decodeURIComponent(path.replace("/projects/", ""));

  if (!id) {
    return json(400, {
      error: "Missing project id.",
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

function normalizeWorkLogForAdmin(item) {
  return {
    id: String(item.id || ""),
    uploadedAt: String(item.uploadedAt || item.syncedAt || item.ts || ""),
    syncedAt: String(item.uploadedAt || item.syncedAt || item.ts || ""),
    startedAt: String(item.startedAt || ""),
    stoppedAt: String(item.stoppedAt || ""),
    jobId: String(item.jobId || ""),
    fullname: String(item.fullname || item.fullName || ""),
    role: String(item.role || ""),
    description: String(item.description || ""),
    location: String(item.location || ""),
    workedMinutes: Number(item.workedMinutes || 0),
    breakMinutes: Number(item.breakMinutes || 0),
    stickyNote: String(item.stickyNote || ""),
    isJobArchived: item.isJobArchived === true || item.isJobArchived === "true",
    jobArchivedAt: cleanString(item.jobArchivedAt),
    jobArchivedBy: cleanString(item.jobArchivedBy),
    uploadedBy: String(item.uploadedBy || ""),
    uploadedByEmail: String(item.uploadedByEmail || ""),
    updatedAt: String(item.updatedAt || ""),
  };
}

// Issue 8 — listWorkLogs with pagination
async function listWorkLogs(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("WORK_LOGS_TABLE", WORK_LOGS_TABLE);
  const { limit, exclusiveStartKey } = parsePaginationParams(event);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      ...(limit && { Limit: limit }),
      ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
    }),
  );

  const canViewArchivedWorkLogs = isFullAdminUser(profile.user);

  const logs = (result.Items ?? [])
    .map(normalizeWorkLogForAdmin)
    .filter((log) => canViewArchivedWorkLogs || log.isJobArchived !== true)
    .sort((a, b) =>
      String(b.syncedAt || b.stoppedAt || b.startedAt).localeCompare(
        String(a.syncedAt || a.stoppedAt || a.startedAt),
      ),
    );

  return json(200, { items: logs, nextToken: encodeNextToken(result.LastEvaluatedKey) });
}

async function updateWorkLog(event, path) {
  const profile = await requireFullAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("WORK_LOGS_TABLE", WORK_LOGS_TABLE);
  const id = decodeURIComponent(path.replace("/work-logs/", ""));

  if (!id) {
    return json(400, { error: "Missing work log id." });
  }

  const body = parseBody(event);
  const now = new Date().toISOString();

  // Only the admin-editable fields — provenance attributes (uploadedBy,
  // uploadedByEmail, loguId, uploadedAt, syncedAt) must survive edits.
  const patch = {
    startedAt: cleanString(body.startedAt),
    stoppedAt: cleanString(body.stoppedAt),
    jobId: cleanString(body.jobId),
    description: cleanString(body.description),
    location: cleanString(body.location),
    workedMinutes: Number.isFinite(Number(body.workedMinutes)) ? Number(body.workedMinutes) : 0,
    breakMinutes: Number.isFinite(Number(body.breakMinutes)) ? Number(body.breakMinutes) : 0,
    stickyNote: cleanString(body.stickyNote),
    updatedAt: now,
    updatedBy: profile.user.id,
    updatedByEmail: profile.user.email || "",
  };

  const updateExpression = `SET ${Object.keys(patch)
    .map((field) => `#${field} = :${field}`)
    .join(", ")}`;

  let updated;
  try {
    updated = await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: Object.fromEntries(
          Object.keys(patch).map((field) => [`#${field}`, field]),
        ),
        ExpressionAttributeValues: Object.fromEntries(
          Object.entries(patch).map(([field, value]) => [`:${field}`, value]),
        ),
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW",
      }),
    );
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      return json(404, { error: "Work log not found.", id });
    }

    throw error;
  }

  await putSyncEvent({
    type: "workLog.update",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: id,
  });

  return json(200, {
    ok: true,
    cloudId: id,
    log: updated.Attributes,
  });
}

async function deleteWorkLog(event, path) {
  const profile = await requireFullAdminUser(event);
  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("WORK_LOGS_TABLE", WORK_LOGS_TABLE);
  const id = decodeURIComponent(path.replace("/work-logs/", ""));

  if (!id) {
    return json(400, { error: "Missing work log id." });
  }

  await dynamo.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { id },
    }),
  );

  await putSyncEvent({
    type: "workLog.delete",
    userId: profile.user.id,
    email: profile.user.email || "",
    entityId: id,
  });

  return json(200, { ok: true, cloudId: id });
}

// Issues 1, 2 — explicit allowlist, server-side ID, ConditionExpression
async function uploadWorkLog(event) {
  const profile = await requireActiveUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const tableName = requireEnv("WORK_LOGS_TABLE", WORK_LOGS_TABLE);
  const body = parseBody(event);
  const now = new Date().toISOString();
  const log = normalizeWorkLogInput(body, profile, now);
  const id = log.id;

  try {
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: log,
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      // Same log already stored by an earlier attempt — idempotent success.
      return json(200, {
        ok: true,
        cloudId: id,
        duplicate: true,
      });
    }

    throw error;
  }

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

// Issues 1, 2, 3 — explicit allowlist, server-side IDs, 200-log cap, parallel batches of 25
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

  // Issue 3 — cap bulk uploads
  const MAX_BULK_LOGS = 200;
  if (logs.length > MAX_BULK_LOGS) {
    return json(400, { error: `Cannot upload more than ${MAX_BULK_LOGS} logs at once.` });
  }

  const now = new Date().toISOString();
  const BATCH_SIZE = 25;
  const savedIds = [];

  // Issue 3 — process in parallel batches of 25
  for (let i = 0; i < logs.length; i += BATCH_SIZE) {
    const batch = logs.slice(i, i + BATCH_SIZE);
    const batchIds = await Promise.all(
      batch.map(async (inputLog) => {
        const log = normalizeWorkLogInput(inputLog, profile, now);

        try {
          await dynamo.send(
            new PutCommand({
              TableName: tableName,
              Item: log,
              ConditionExpression: "attribute_not_exists(id)",
            }),
          );
        } catch (error) {
          if (error?.name !== "ConditionalCheckFailedException") {
            throw error;
          }
          // Already stored by an earlier attempt — idempotent success.
        }

        return log.id;
      }),
    );
    savedIds.push(...batchIds);
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

  const allowedStatuses = new Set(["online", "available", "working", "on_break", "offline"]);

  return {
    userId: profile.user.id,
    // Identity shown on the admin status board comes from the server-side
    // profile so a worker cannot impersonate someone else.
    fullName: cleanText(profile.user.fullName, 120) || cleanText(body.fullName, 120),
    email: cleanString(profile.user.email),
    role: normalizeUserRole(body.role || profile.user.role),
    status: allowedStatuses.has(status) ? status : "online",

    currentJobId: cleanText(body.currentJobId, 120),
    currentJobName: cleanText(body.currentJobName, 300),
    currentJobLocation: cleanText(body.currentJobLocation, 300),

    startedAt: cleanText(body.startedAt, 40),
    breakStartedAt: cleanText(body.breakStartedAt, 40),
    breakMinutes: clampNonNegativeInt(body.breakMinutes, MAX_SHIFT_MINUTES),

    pendingSyncCount: clampNonNegativeInt(body.pendingSyncCount, 100_000),
    failedSyncCount: clampNonNegativeInt(body.failedSyncCount, 100_000),
    oldestPendingSyncAt: cleanText(body.oldestPendingSyncAt, 40),

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

// Issue 8 — listWorkerStatus with pagination on both table scans
async function listWorkerStatus(event) {
  const profile = await requireAdminUser(event);

  if (!profile.ok) {
    return profile.response;
  }

  const usersTableName = requireEnv("USERS_TABLE", USERS_TABLE);
  const workerStatusTableName = requireEnv("WORKER_STATUS_TABLE", WORKER_STATUS_TABLE);
  const { limit, exclusiveStartKey } = parsePaginationParams(event);

  const [usersResult, statusResult] = await Promise.all([
    dynamo.send(
      new ScanCommand({
        TableName: usersTableName,
        ...(limit && { Limit: limit }),
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      }),
    ),
    dynamo.send(
      new ScanCommand({
        TableName: workerStatusTableName,
        ...(limit && { Limit: limit }),
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
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
    .filter((user) => getUserPermissionLevel(user) === "worker" && isWorkerStatusVisibleUser(user))
    .map((user) => {
      const userId = cleanString(user.id) || cleanString(user.userId);
      const statusItem = statusByUserId.get(userId);

      const isDeactivated =
        user.isActive === false ||
        cleanString(user.status).toLowerCase() === "inactive" ||
        cleanString(user.status).toLowerCase() === "deactivated";

      const lastSeenAt = cleanString(statusItem?.lastSeenAt || statusItem?.updatedAt);
      const lastSeenMs = Date.parse(lastSeenAt);
      const isStale = !Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > 15 * 60 * 1000;

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
          cleanString(statusItem?.fullName) || cleanString(user.fullName) || cleanString(user.name),
        email:
          cleanString(statusItem?.email) || cleanString(user.email) || cleanString(user.username),
        role: cleanString(statusItem?.role) || cleanString(user.role) || "other",
        status: liveStatus,
        lastKnownStatus,

        currentJobId: isDeactivated || !statusItem ? "" : cleanString(statusItem.currentJobId),
        currentJobName: isDeactivated || !statusItem ? "" : cleanString(statusItem.currentJobName),
        currentJobLocation:
          isDeactivated || !statusItem ? "" : cleanString(statusItem.currentJobLocation),

        startedAt: isDeactivated || !statusItem ? "" : cleanString(statusItem.startedAt),
        breakStartedAt: isDeactivated || !statusItem ? "" : cleanString(statusItem.breakStartedAt),
        breakMinutes: isDeactivated ? 0 : Number(statusItem?.breakMinutes || 0),

        pendingSyncCount: isDeactivated ? 0 : Number(statusItem?.pendingSyncCount || 0),
        failedSyncCount: isDeactivated ? 0 : Number(statusItem?.failedSyncCount || 0),
        oldestPendingSyncAt: isDeactivated ? "" : cleanString(statusItem?.oldestPendingSyncAt),

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

  if (getUserPermissionLevel(profile.user) !== "worker") {
    return json(403, {
      error: "Only worker users can publish worker status.",
    });
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

    if (method === "POST" && path.startsWith("/users/") && path.endsWith("/reset-password")) {
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
    if (method === "POST" && path.startsWith("/jobs/") && path.endsWith("/archive")) {
      return archiveJob(event, path);
    }

    if (method === "PUT" && path.startsWith("/jobs/")) {
      return updateJob(event, path);
    }

    if (method === "DELETE" && path.startsWith("/jobs/")) {
      return deleteJob(event, path);
    }

    if (method === "GET" && path === "/projects") {
      return listProjects(event);
    }

    if (method === "POST" && path === "/projects") {
      return createProject(event);
    }

    if (method === "PUT" && path.startsWith("/projects/")) {
      return updateProject(event, path);
    }

    if (method === "DELETE" && path.startsWith("/projects/")) {
      return deleteProject(event, path);
    }

    if (method === "GET" && path === "/worker-status") {
      return listWorkerStatus(event);
    }

    if (method === "PUT" && path === "/worker-status/me") {
      return updateMyWorkerStatus(event);
    }
    if (method === "GET" && path === "/work-logs") {
      return listWorkLogs(event);
    }

    if (method === "PUT" && path.startsWith("/work-logs/")) {
      return updateWorkLog(event, path);
    }

    if (method === "DELETE" && path.startsWith("/work-logs/")) {
      return deleteWorkLog(event, path);
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
    // Map known failures to real status codes so the offline client can tell
    // permanent errors (don't retry) from transient ones (retry later).
    if (error instanceof SyntaxError || error?.message === "Invalid JSON body.") {
      return json(400, { error: "Invalid request body." });
    }

    switch (error?.name) {
      case "UsernameExistsException":
        return json(409, { error: "A user with this email already exists." });
      case "InvalidPasswordException":
        return json(400, { error: "Password does not meet the password policy." });
      case "InvalidParameterException":
        return json(400, { error: "Invalid request parameters." });
      case "UserNotFoundException":
        return json(404, { error: "User not found." });
      case "ConditionalCheckFailedException":
        return json(409, { error: "The record was modified or does not exist." });
      case "LimitExceededException":
      case "TooManyRequestsException":
      case "ProvisionedThroughputExceededException":
        return json(429, { error: "Too many requests. Please try again shortly." });
    }

    // Log full error server-side, return no internal details to client
    console.error("AHloguApi unhandled error:", error);
    return json(500, { error: "Internal server error" });
  }
};
