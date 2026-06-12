import { minutesBetween } from "@/lib/workUtils";
import type { CurrentUser, LogItem, WorkerRole } from "@/types/work";

type CreatePendingWorkLogInput = {
  currentUser: CurrentUser;
  jobId: string;
  location: string;
  role: WorkerRole;
  jobDocs: string;
  description: string;
  startTime: string;
  stopTime: string;
  breakMinutes: number;
};

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPendingWorkLog({
  currentUser,
  jobId,
  location,
  role,
  jobDocs,
  description,
  startTime,
  stopTime,
  breakMinutes,
}: CreatePendingWorkLogInput): LogItem {
  const totalMinutes = minutesBetween(startTime, stopTime);
  const workedMinutes = Math.max(0, totalMinutes - breakMinutes);

  return {
    id: makeUuid(),
    loguId: makeUuid(),
    ts: new Date(stopTime).getTime(),
    fullname: currentUser.fullName,
    jobId,
    location,
    role,
    jobDocs,
    description,
    startedAt: startTime,
    stoppedAt: stopTime,
    breakMinutes,
    workedMinutes,
    syncStatus: "pending",
    syncMessage: "Waiting to sync",
    stickyNote: "",
  };
}
