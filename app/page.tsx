"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock3,
  CloudOff,
  Play,
  RefreshCcw,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const STORAGE_KEY = "project-logu-demo-v2";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString();
}

function minutesBetween(start: string, end: string) {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

type PendingAction = {
  id: string;
  type: "start" | "stop";
  payload: {
    sessionId: string;
    plumber: string;
    jobId: string;
    area: string;
    note: string;
    ts: string;
  };
  status: "pending" | "synced";
};

type WorkSession = {
  sessionId: string;
  plumber: string;
  jobId: string;
  area: string;
  note: string;
  startedAt: string;
  stoppedAt?: string;
  syncState: "pending" | "partial" | "synced";
};

type DemoState = {
  activeSession: WorkSession | null;
  sessions: WorkSession[];
  pendingQueue: PendingAction[];
};

const defaultState: DemoState = {
  activeSession: null,
  sessions: [],
  pendingQueue: [],
};

export default function ProjectLoguDemo() {
  const [plumber, setPlumber] = useState("Suraj");
  const [jobId, setJobId] = useState("JOB-1001");
  const [area, setArea] = useState("Factory Bay 1");
  const [note, setNote] = useState("");
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [state, setState] = useState<DemoState>(defaultState);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch (error) {
      console.error("Failed to load state", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const completed = state.sessions.filter((s) => s.stoppedAt);
    const totalMinutes = completed.reduce(
      (sum, s) => sum + minutesBetween(s.startedAt, s.stoppedAt!),
      0
    );

    return {
      totalSessions: state.sessions.length,
      pendingActions: state.pendingQueue.filter((p) => p.status === "pending").length,
      totalMinutes,
    };
  }, [state.sessions, state.pendingQueue]);

  async function fakeSyncToServer(action: PendingAction) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!online) throw new Error("Server offline");
    return { ok: true, actionId: action.id };
  }

  async function syncPending() {
    const pendingItems = state.pendingQueue.filter((item) => item.status === "pending");
    if (!pendingItems.length) {
      setToast("Nothing to sync");
      return;
    }

    setSaving(true);
    const syncedIds: string[] = [];

    for (const item of pendingItems) {
      try {
        await fakeSyncToServer(item);
        syncedIds.push(item.id);
      } catch {
        break;
      }
    }

    setState((current) => {
      const updatedQueue = current.pendingQueue.map((item) =>
        syncedIds.includes(item.id) ? { ...item, status: "synced" as const } : item
      );

      const updatedSessions = current.sessions.map((session) => {
        const hasPending = updatedQueue.some(
          (q) => q.payload.sessionId === session.sessionId && q.status === "pending"
        );

        if (hasPending) {
          const hasSyncedStart = updatedQueue.some(
            (q) => q.payload.sessionId === session.sessionId && q.type === "start" && q.status === "synced"
          );
          return { ...session, syncState: hasSyncedStart ? "partial" as const : "pending" as const };
        }

        return { ...session, syncState: "synced" as const };
      });

      return {
        activeSession: current.activeSession
          ? updatedSessions.find((s) => s.sessionId === current.activeSession?.sessionId) ?? current.activeSession
          : null,
        sessions: updatedSessions,
        pendingQueue: updatedQueue,
      };
    });

    setSaving(false);
    setToast(syncedIds.length ? `Synced ${syncedIds.length} action${syncedIds.length > 1 ? "s" : ""}` : "Sync failed");
  }

  function startWork() {
    if (state.activeSession) {
      setToast("Stop current work first");
      return;
    }

    if (!plumber.trim() || !jobId.trim()) {
      setToast("Enter plumber and job ID");
      return;
    }

    const startedAt = new Date().toISOString();
    const sessionId = uid();

    const session: WorkSession = {
      sessionId,
      plumber: plumber.trim(),
      jobId: jobId.trim(),
      area: area.trim(),
      note: note.trim(),
      startedAt,
      syncState: "pending",
    };

    const action: PendingAction = {
      id: uid(),
      type: "start",
      status: "pending",
      payload: {
        sessionId,
        plumber: plumber.trim(),
        jobId: jobId.trim(),
        area: area.trim(),
        note: note.trim(),
        ts: startedAt,
      },
    };

    setState((current) => ({
      activeSession: session,
      sessions: [session, ...current.sessions],
      pendingQueue: [action, ...current.pendingQueue],
    }));

    setNote("");
    setToast(online ? "Work started" : "Saved locally while offline");
  }

  function stopWork() {
    if (!state.activeSession) {
      setToast("No active work session");
      return;
    }

    const stoppedAt = new Date().toISOString();
    const active = state.activeSession;

    const action: PendingAction = {
      id: uid(),
      type: "stop",
      status: "pending",
      payload: {
        sessionId: active.sessionId,
        plumber: active.plumber,
        jobId: active.jobId,
        area: active.area,
        note: active.note,
        ts: stoppedAt,
      },
    };

    setState((current) => ({
      activeSession: null,
      sessions: current.sessions.map((session) =>
        session.sessionId === active.sessionId
          ? {
              ...session,
              stoppedAt,
              syncState: session.syncState === "synced" ? "partial" : "pending",
            }
          : session
      ),
      pendingQueue: [action, ...current.pendingQueue],
    }));

    setToast(online ? "Work stopped" : "Stop saved locally while offline");
  }

  function resetDemo() {
    setState(defaultState);
    localStorage.removeItem(STORAGE_KEY);
    setToast("Demo reset");
  }

  function syncBadge(syncState: WorkSession["syncState"]) {
    if (syncState === "synced") return <Badge className="rounded-full">Synced</Badge>;
    if (syncState === "partial") return <Badge variant="secondary" className="rounded-full">Partial</Badge>;
    return <Badge variant="outline" className="rounded-full">Pending</Badge>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#183a36_0%,#0a1514_35%,#060b0b_100%)] text-white">
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[32px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.45)] overflow-hidden"
        >
          <div className="border-b border-white/10 px-5 py-4 md:px-8 md:py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">Project Logu</div>
              <h1 className="text-2xl md:text-3xl font-semibold mt-1">Simple work logger</h1>
              <p className="text-sm text-white/60 mt-1">Fast start/stop logging with offline-safe queue.</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white">
                {online ? <Wifi className="mr-2 h-4 w-4" /> : <WifiOff className="mr-2 h-4 w-4" />}
                {online ? "Server online" : "Server offline"}
              </Badge>
              <Button
                variant="outline"
                className="rounded-full border-white/15 bg-white/5 hover:bg-white/10"
                onClick={() => setOnline((v) => !v)}
              >
                {online ? "Simulate outage" : "Bring server back"}
              </Button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-0">
            <div className="p-5 md:p-8 border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 grid gap-2">
                  <label className="text-sm text-white/70">Plumber name</label>
                  <Input
                    value={plumber}
                    onChange={(e) => setPlumber(e.target.value)}
                    className="h-12 rounded-2xl border-white/10 bg-black/20"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Job ID</label>
                  <Input
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="h-12 rounded-2xl border-white/10 bg-black/20"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Area</label>
                  <Input
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="h-12 rounded-2xl border-white/10 bg-black/20"
                  />
                </div>

                <div className="md:col-span-2 grid gap-2">
                  <label className="text-sm text-white/70">Note</label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional note"
                    className="min-h-[96px] rounded-2xl border-white/10 bg-black/20"
                  />
                </div>
              </div>

              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <Button
                  onClick={startWork}
                  className="h-16 rounded-2xl text-base font-medium bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  <Play className="mr-2 h-5 w-5" />
                  Start work
                </Button>
                <Button
                  onClick={stopWork}
                  className="h-16 rounded-2xl text-base font-medium bg-white text-black hover:bg-white/90"
                >
                  <Square className="mr-2 h-5 w-5" />
                  Stop work
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="rounded-full border-white/15 bg-white/5 hover:bg-white/10"
                  onClick={syncPending}
                  disabled={saving}
                >
                  <RefreshCcw className={`mr-2 h-4 w-4 ${saving ? "animate-spin" : ""}`} />
                  Sync pending
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-white/15 bg-white/5 hover:bg-white/10"
                  onClick={resetDemo}
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="p-5 md:p-8">
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <Card className="rounded-3xl border-white/10 bg-black/20">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/45">Sessions</div>
                    <div className="text-3xl font-semibold mt-2">{stats.totalSessions}</div>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border-white/10 bg-black/20">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/45">Pending</div>
                    <div className="text-3xl font-semibold mt-2">{stats.pendingActions}</div>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl border-white/10 bg-black/20">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/45">Minutes</div>
                    <div className="text-3xl font-semibold mt-2">{stats.totalMinutes}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/45">Current status</div>
                    <div className="text-lg font-medium mt-1">
                      {state.activeSession ? "Work running" : "Ready to start"}
                    </div>
                  </div>
                  {state.activeSession ? (
                    <Badge className="rounded-full bg-emerald-500 text-black hover:bg-emerald-500">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded-full">Idle</Badge>
                  )}
                </div>

                <div className="mt-4 text-sm text-white/70 grid gap-2">
                  {state.activeSession ? (
                    <>
                      <div><span className="text-white/45">Plumber:</span> {state.activeSession.plumber}</div>
                      <div><span className="text-white/45">Job ID:</span> {state.activeSession.jobId}</div>
                      <div><span className="text-white/45">Area:</span> {state.activeSession.area}</div>
                      <div><span className="text-white/45">Start:</span> {formatDateTime(state.activeSession.startedAt)}</div>
                    </>
                  ) : (
                    <div className="flex items-start gap-2 text-white/55">
                      <CloudOff className="h-4 w-4 mt-0.5" />
                      Start and stop events are saved locally first, then synced later.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 p-5 md:p-8 bg-black/10">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Recent work log</div>
                <div className="text-lg font-medium mt-1">Latest sessions</div>
              </div>
              <div className="text-sm text-white/45">Newest first</div>
            </div>

            <div className="grid gap-3">
              {state.sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-white/45">
                  No work sessions yet.
                </div>
              ) : (
                state.sessions.map((session) => (
                  <motion.div
                    key={session.sessionId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-base font-medium">{session.jobId} · {session.plumber}</div>
                        <div className="text-sm text-white/50 mt-1">{session.area}</div>
                        {session.note ? <div className="text-sm text-white/70 mt-2">{session.note}</div> : null}
                      </div>

                      <div className="text-sm text-white/65 grid gap-1 min-w-[240px]">
                        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Start: {formatDateTime(session.startedAt)}</div>
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Stop: {session.stoppedAt ? formatDateTime(session.stoppedAt) : "Still running"}</div>
                        <div>Duration: {session.stoppedAt ? `${minutesBetween(session.startedAt, session.stoppedAt)} min` : "—"}</div>
                      </div>

                      <div>{syncBadge(session.syncState)}</div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 rounded-full border border-white/10 bg-black/70 backdrop-blur px-4 py-2 text-sm shadow-2xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
