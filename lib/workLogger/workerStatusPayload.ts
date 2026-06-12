import type { CurrentUser, Job, LogItem, WorkerLiveStatus } from "@/types/work";

type BuildWorkerLiveStatusPayloadInput = {
  currentUser: CurrentUser;
  logs: LogItem[];
  availableJobs: Job[];
  jobId: string;
  location: string;
  isWorking: boolean;
  isOnBreak: boolean;
  startTime: string | null;
  breakStartTime: string | null;
  breakMinutes: number;
  failedCount: number;
};

export function buildWorkerLiveStatusPayload({
  currentUser,
  logs,
  availableJobs,
  jobId,
  location,
  isWorking,
  isOnBreak,
  startTime,
  breakStartTime,
  breakMinutes,
  failedCount,
}: BuildWorkerLiveStatusPayloadInput): WorkerLiveStatus {
  const pendingItems = logs.filter(
    (item) => item.syncStatus === "pending" || item.syncStatus === "failed",
  );

  const oldestPendingSyncAt = pendingItems
    .map((item) => item.stoppedAt || item.startedAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0];

  // Only an active job is live status; while idle, jobId/location are just
  // half-typed form input and must not feed the payload (or its signature,
  // which would otherwise trigger a network publish per keystroke).
  const trimmedJobId = isWorking ? jobId.trim() : "";
  const currentJob = availableJobs.find(
    (job) => job.jobId === trimmedJobId || job.id === trimmedJobId,
  );

  const nowIso = new Date().toISOString();

  return {
    userId: currentUser.id,
    fullName: currentUser.fullName,
    email: currentUser.username,
    role: currentUser.role,
    status: isWorking ? (isOnBreak ? "on_break" : "working") : "available",

    currentJobId: trimmedJobId || undefined,
    currentJobName: currentJob?.jobName || undefined,
    currentJobLocation: isWorking ? location.trim() || undefined : undefined,

    startedAt: isWorking && startTime ? startTime : undefined,
    breakStartedAt: isWorking && isOnBreak && breakStartTime ? breakStartTime : undefined,
    breakMinutes,

    pendingSyncCount: pendingItems.length,
    failedSyncCount: failedCount,
    oldestPendingSyncAt,

    lastSeenAt: nowIso,
    updatedAt: nowIso,
  };
}

export function getWorkerLiveStatusSignature(statusPayload: WorkerLiveStatus): string {
  return JSON.stringify({
    userId: statusPayload.userId,
    status: statusPayload.status,
    currentJobId: statusPayload.currentJobId,
    currentJobName: statusPayload.currentJobName,
    currentJobLocation: statusPayload.currentJobLocation,
    startedAt: statusPayload.startedAt,
    breakStartedAt: statusPayload.breakStartedAt,
    breakMinutes: statusPayload.breakMinutes,
    pendingSyncCount: statusPayload.pendingSyncCount,
    failedSyncCount: statusPayload.failedSyncCount,
    oldestPendingSyncAt: statusPayload.oldestPendingSyncAt,
  });
}
