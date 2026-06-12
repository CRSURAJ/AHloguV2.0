import { getCurrentCognitoSession } from "@/lib/auth/cognitoClient";
import type { AdminWorkLog, Job, LogItem, WorkerLiveStatus } from "@/types/work";

import type { CloudProvider, CloudSyncResult } from "./types";

function getAwsApiBaseUrl() {
  return process.env.NEXT_PUBLIC_AHLOGU_API_URL?.replace(/\/$/, "") ?? "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown AWS cloud error";
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") {
    return {};
  }

  // getCurrentCognitoSession() refreshes expired tokens via the SDK, so
  // long-lived sessions keep working instead of sending a stale idToken.
  const session = await getCurrentCognitoSession();

  if (!session) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.getIdToken().getJwtToken()}`,
  };
}

export type AwsCurrentUserProfile = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissionLevel: string;
  isAdmin: boolean;
  isActive: boolean;
};

// List endpoints respond with either a bare array (legacy) or a paginated
// { items, nextToken } envelope — accept both.
function extractListItems(data: unknown): unknown[] | null {
  if (Array.isArray(data)) {
    return data;
  }

  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray((data as { items: unknown }).items)
  ) {
    return (data as { items: unknown[] }).items;
  }

  return null;
}

function isJobShape(x: unknown): x is Job {
  return typeof x === "object" && x !== null && "id" in x && "jobId" in x;
}

function isAdminWorkLogShape(x: unknown): x is AdminWorkLog {
  return typeof x === "object" && x !== null && "id" in x && "jobId" in x && "startedAt" in x;
}

function isWorkerLiveStatusShape(x: unknown): x is WorkerLiveStatus {
  return typeof x === "object" && x !== null && "userId" in x && "status" in x;
}

function isAwsCurrentUserProfileShape(x: unknown): x is AwsCurrentUserProfile {
  return typeof x === "object" && x !== null && "id" in x && "email" in x && "permissionLevel" in x;
}

export async function getAwsCurrentUser(): Promise<AwsCurrentUserProfile | null> {
  const baseUrl = getAwsApiBaseUrl();

  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/me`, {
      method: "GET",
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();
    if (!isAwsCurrentUserProfileShape(data)) return null;
    return data;
  } catch {
    return null;
  }
}

async function requestJson<TPayload>(
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    payload?: TPayload;
  },
): Promise<CloudSyncResult> {
  const baseUrl = getAwsApiBaseUrl();

  if (!baseUrl) {
    return {
      ok: false,
      message: "Missing NEXT_PUBLIC_AHLOGU_API_URL.",
    };
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...(await getAuthHeaders()),
      },
      body:
        options.method === "GET" || options.payload === undefined
          ? undefined
          : JSON.stringify(options.payload),
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : `AWS API request failed with status ${response.status}.`;

      return {
        ok: false,
        message,
      };
    }

    const cloudId =
      data && typeof data === "object" && "cloudId" in data && typeof data.cloudId === "string"
        ? data.cloudId
        : undefined;

    return {
      ok: true,
      message: "AWS API request successful.",
      cloudId,
    };
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error),
    };
  }
}

export const awsCloudProvider: CloudProvider = {
  providerName: "aws",

  async healthCheck() {
    const baseUrl = getAwsApiBaseUrl();

    if (!baseUrl) {
      return {
        ok: false,
        provider: "aws",
        message: "AWS provider selected, but NEXT_PUBLIC_AHLOGU_API_URL is missing.",
      };
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
      });

      return {
        ok: response.ok,
        provider: "aws",
        message: response.ok
          ? "AWS cloud API is reachable."
          : `AWS cloud API health check failed with status ${response.status}.`,
      };
    } catch (error) {
      return {
        ok: false,
        provider: "aws",
        message: getErrorMessage(error),
      };
    }
  },

  jobs: {
    async list() {
      const baseUrl = getAwsApiBaseUrl();

      if (!baseUrl) {
        throw new Error("Missing NEXT_PUBLIC_AHLOGU_API_URL.");
      }

      const response = await fetch(`${baseUrl}/jobs`, {
        method: "GET",
        headers: await getAuthHeaders(),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : `AWS jobs list failed with status ${response.status}.`;

        throw new Error(message);
      }

      const items = extractListItems(data);

      if (!items || !items.every(isJobShape)) {
        throw new Error("AWS jobs list returned an unexpected response shape.");
      }

      return items;
    },

    async create(job: Job) {
      return requestJson("/jobs", {
        method: "POST",
        payload: job,
      });
    },

    async update(job: Job) {
      return requestJson(`/jobs/${encodeURIComponent(job.id)}`, {
        method: "PUT",
        payload: job,
      });
    },

    async delete(jobId: string) {
      return requestJson(`/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
      });
    },

    async archive(jobId: string) {
      return requestJson(`/jobs/${encodeURIComponent(jobId)}/archive`, {
        method: "POST",
      });
    },
  },

  workLogs: {
    async list() {
      const baseUrl = getAwsApiBaseUrl();

      if (!baseUrl) {
        throw new Error("Missing NEXT_PUBLIC_AHLOGU_API_URL.");
      }

      const response = await fetch(`${baseUrl}/work-logs`, {
        method: "GET",
        headers: await getAuthHeaders(),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : `AWS work logs list failed with status ${response.status}.`;

        throw new Error(message);
      }

      const items = extractListItems(data);

      if (!items || !items.every(isAdminWorkLogShape)) {
        throw new Error("AWS work logs list returned an unexpected response shape.");
      }

      return items;
    },

    async update(log: AdminWorkLog) {
      return requestJson(`/work-logs/${encodeURIComponent(log.id)}`, {
        method: "PUT",
        payload: log,
      });
    },

    async delete(logId: string) {
      return requestJson(`/work-logs/${encodeURIComponent(logId)}`, {
        method: "DELETE",
      });
    },
    async upload(log: LogItem) {
      return requestJson("/work-logs", {
        method: "POST",
        payload: log,
      });
    },

    async uploadMany(logs: LogItem[]) {
      return requestJson("/work-logs/bulk", {
        method: "POST",
        payload: {
          logs,
        },
      });
    },
  },

  workerStatus: {
    async list() {
      const baseUrl = getAwsApiBaseUrl();

      if (!baseUrl) {
        throw new Error("Missing NEXT_PUBLIC_AHLOGU_API_URL.");
      }

      const response = await fetch(`${baseUrl}/worker-status`, {
        method: "GET",
        headers: await getAuthHeaders(),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : `AWS worker status list failed with status ${response.status}.`;

        throw new Error(message);
      }

      const items = extractListItems(data);

      if (!items || !items.every(isWorkerLiveStatusShape)) {
        throw new Error("AWS worker status list returned an unexpected response shape.");
      }

      return items;
    },

    async updateMine(status: WorkerLiveStatus) {
      return requestJson("/worker-status/me", {
        method: "PUT",
        payload: status,
      });
    },
  },
};
