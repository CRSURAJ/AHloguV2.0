import type { CloudProvider } from "./types";

export const noopCloudProvider: CloudProvider = {
  providerName: "noop",

  async healthCheck() {
    return {
      ok: true,
      provider: "noop",
      message: "Cloud provider not connected yet. Local/offline mode is active.",
    };
  },

  jobs: {
    async list() {
      return [];
    },

    async create() {
      return {
        ok: true,
        message: "No cloud provider connected. Job kept local only.",
      };
    },

    async update() {
      return {
        ok: true,
        message: "No cloud provider connected. Job update kept local only.",
      };
    },

    async delete() {
      return {
        ok: true,
        message: "No cloud provider connected. Job delete kept local only.",
      };
    },
  },

  workLogs: {
    async upload() {
      return {
        ok: true,
        message: "No cloud provider connected. Work log kept local only.",
      };
    },

    async uploadMany() {
      return {
        ok: true,
        message: "No cloud provider connected. Work logs kept local only.",
      };
    },
  },

  drawings: {
    async upload() {
      return {
        ok: true,
        message: "No cloud provider connected. Drawing kept local only.",
      };
    },
  },
};
