import type { CloudProvider } from "./types";

const NOOP_MESSAGE =
  "Cloud provider not connected yet. Local/offline mode is active.";

export const noopCloudProvider: CloudProvider = {
  providerName: "noop",

  async healthCheck() {
    return {
      ok: false,
      provider: "noop",
      message: NOOP_MESSAGE,
    };
  },

  jobs: {
    async list() {
      return [];
    },

    async create() {
      return {
        ok: false,
        message: NOOP_MESSAGE,
      };
    },

    async update() {
      return {
        ok: false,
        message: NOOP_MESSAGE,
      };
    },

    async delete() {
      return {
        ok: false,
        message: NOOP_MESSAGE,
      };
    },
  },

  workLogs: {
    async upload() {
      return {
        ok: false,
        message: NOOP_MESSAGE,
      };
    },

    async uploadMany() {
      return {
        ok: false,
        message: NOOP_MESSAGE,
      };
    },
  },

  drawings: {
    async upload() {
      return {
        ok: false,
        message: NOOP_MESSAGE,
      };
    },
  },
};
