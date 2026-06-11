import type { ActiveSession, DraftState } from "@/types/work";

type CreateActiveSessionSnapshotInput = {
  isWorking: boolean;
  isOnBreak: boolean;
  startTime: string | null;
  breakStartTime: string | null;
  breakMinutes: number;
  jobId: string;
  location: string;
  role: string;
  jobDocs: string;
  description: string;
};

type CreateDraftSnapshotInput = {
  jobId: string;
  location: string;
  role: string;
  jobDocs: string;
  description: string;
};

export function createActiveSessionSnapshot({
  isWorking,
  isOnBreak,
  startTime,
  breakStartTime,
  breakMinutes,
  jobId,
  location,
  role,
  jobDocs,
  description,
}: CreateActiveSessionSnapshotInput): ActiveSession {
  return {
    isWorking,
    isOnBreak,
    startTime,
    breakStartTime,
    breakMinutes,
    jobId,
    location,
    role,
    jobDocs,
    description,
  };
}

export function createDraftSnapshot({
  jobId,
  location,
  role,
  jobDocs,
  description,
}: CreateDraftSnapshotInput): DraftState {
  return {
    jobId,
    location,
    role,
    jobDocs,
    description,
  };
}

export function hasMeaningfulDraft(draft: DraftState): boolean {
  return (
    draft.jobId.trim() !== "" ||
    draft.location.trim() !== "" ||
    draft.role.trim() !== "" ||
    draft.jobDocs.trim() !== "" ||
    draft.description.trim() !== ""
  );
}
