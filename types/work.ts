export type BreakPeriod = {
  startAt: string;
  endAt?: string;
};

export type PendingActionType = "start" | "stop" | "break_start" | "break_end";

export type PendingAction = {
  id: string;
  type: PendingActionType;
  payload: {
    sessionId: string;
    plumber: string;
    jobId: string;
    location: string;
    description: string;
    note: string;
    ts: string;
  };
  status: "pending" | "synced";
};

export type WorkSession = {
  sessionId: string;
  plumber: string;
  jobId: string;
  location: string;
  description: string;
  note: string;
  startedAt: string;
  stoppedAt?: string;
  breaks: BreakPeriod[];
  syncState: "pending" | "partial" | "synced";
};

export type DemoState = {
  activeSession: WorkSession | null;
  sessions: WorkSession[];
  pendingQueue: PendingAction[];
};
