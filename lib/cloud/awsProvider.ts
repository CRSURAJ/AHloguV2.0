import type { Job, LogItem, WorkerLiveStatus } from "@/types/work";

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

function getCognitoIdToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const tokenKey = Object.keys(window.localStorage).find(
    (key) =>
      key.includes("CognitoIdentityServiceProvider") &&
      key.endsWith(".idToken"),
  );

  if (!tokenKey) {
    return "";
  }

  return window.localStorage.getItem(tokenKey) ?? "";
}

function getAuthHeaders(): Record<string, string> {
  const token = getCognitoIdToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export type AwsCurrentUserProfile = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
};

export async function getAwsCurrentUser(): Promise<AwsCurrentUserProfile | null> {
  const baseUrl = getAwsApiBaseUrl();

  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/me`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AwsCurrentUserProfile;
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
        ...getAuthHeaders(),
      },
      body:
        options.method === "GET" || options.payload === undefined
          ? undefined
          : JSON.stringify(options.payload),
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : `AWS API request failed with status ${response.status}.`;

      return {
        ok: false,
        message,
      };
    }

    const cloudId =
      data &&
      typeof data === "object" &&
      "cloudId" in data &&
      typeof data.cloudId === "string"
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
        headers: getAuthHeaders(),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : `AWS jobs list failed with status ${response.status}.`;

        throw new Error(message);
      }

      if (!Array.isArray(data)) {
        throw new Error("AWS jobs list returned an invalid response.");
      }

      return data as Job[];
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
  },

  workLogs: {
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
        headers: getAuthHeaders(),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : `AWS worker status list failed with status ${response.status}.`;

        throw new Error(message);
      }

      if (!Array.isArray(data)) {
        throw new Error("AWS worker status list returned an invalid response.");
      }

      return data as WorkerLiveStatus[];
    },

    async updateMine(status: WorkerLiveStatus) {
      return requestJson("/worker-status/me", {
        method: "PUT",
        payload: status,
      });
    },
  },

  drawings: {
    async upload({ jobId, fileName, file }) {
      const baseUrl = getAwsApiBaseUrl();

      if (!baseUrl) {
        return {
          ok: false,
          message: "Missing NEXT_PUBLIC_AHLOGU_API_URL.",
        };
      }

      const formData = new FormData();
      formData.append("jobId", jobId);
      formData.append("fileName", fileName);
      formData.append("file", file);

      try {
        const response = await fetch(`${baseUrl}/drawings`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        });

        if (!response.ok) {
          return {
            ok: false,
            message: `Drawing upload failed with status ${response.status}.`,
          };
        }

        return {
          ok: true,
          message: "Drawing uploaded to AWS API.",
        };
      } catch (error) {
        return {
          ok: false,
          message: getErrorMessage(error),
        };
      }
    },
  },
};
