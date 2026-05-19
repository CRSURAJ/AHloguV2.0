import type { Job, LogItem } from "@/types/work";

export type CloudSyncResult = {
  ok: boolean;
  message?: string;
  cloudId?: string;
};

export type CloudHealthResult = {
  ok: boolean;
  provider: string;
  message?: string;
};

export type CloudProvider = {
  providerName: string;

  healthCheck: () => Promise<CloudHealthResult>;

  jobs: {
    list: () => Promise<Job[]>;
    create: (job: Job) => Promise<CloudSyncResult>;
    update: (job: Job) => Promise<CloudSyncResult>;
    delete: (jobId: string) => Promise<CloudSyncResult>;
  };

  workLogs: {
    upload: (log: LogItem) => Promise<CloudSyncResult>;
    uploadMany: (logs: LogItem[]) => Promise<CloudSyncResult>;
  };

  drawings: {
    upload: (params: {
      jobId: string;
      fileName: string;
      file: File;
    }) => Promise<CloudSyncResult>;
  };
};
