import type { Job, LogItem } from "@/types/work";

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
      },
      body:
        options.method === "GET" || options.payload === undefined
          ? undefined
          : JSON.stringify(options.payload),
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `AWS API request failed with status ${response.status}.`,
      };
    }

    return {
      ok: true,
      message: "AWS API request successful.",
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
        return [];
      }

      try {
        const response = await fetch(`${baseUrl}/jobs`, {
          method: "GET",
        });

        if (!response.ok) {
          return [];
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          return [];
        }

        return data as Job[];
      } catch {
        return [];
      }
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
