"use client";

import { useEffect, useState } from "react";
const TB_URL = "https://ahconnect.automaticheating.com.au/api/v1/W3fZovDPT4Au9WuhnSar/telemetry";
export default function WorkLogger() {
  const [fullname, setfullname] = useState("Suraj");
  const [jobId, setJobId] = useState("JOB-1001");
  const [location, setLocation] = useState("Factory Bay 1");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
const [breakStartTime, setBreakStartTime] = useState<string | null>(null);
const [breakMinutes, setBreakMinutes] = useState(0);
const [logs, setLogs] = useState<any[]>([]);
async function sendToThingsBoard(
  eventType: "start" | "stop" | "break_start" | "break_end"
) {
  const payload = {
    ts: Date.now(),
    values: {
      eventType,
      fullname,
      jobId,
      location,
      description,
      note,
      isWorking,
      isOnBreak,
    },
  };

  const res = await fetch(TB_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Failed to send telemetry to ThingsBoard");
  }
}
useEffect(() => {
  const raw = localStorage.getItem("project_logu_logs");
  if (raw) {
    setLogs(JSON.parse(raw));
  }
}, []);

useEffect(() => {
  localStorage.setItem("project_logu_logs", JSON.stringify(logs));
}, [logs]);
 function handleStart() {
  const now = new Date().toISOString();
  setIsWorking(true);
  setIsOnBreak(false);
  setStartTime(now);
  setBreakStartTime(null);
  setBreakMinutes(0);
}
 function handleBreak() {
  if (!isWorking) return;

  const now = new Date();

  if (!isOnBreak) {
    setIsOnBreak(true);
    setBreakStartTime(now.toISOString());
    return;
  }

  if (breakStartTime) {
    const diffMs = now.getTime() - new Date(breakStartTime).getTime();
    const mins = Math.round(diffMs / 60000);
    setBreakMinutes((prev) => prev + Math.max(0, mins));
  }

  setIsOnBreak(false);
  setBreakStartTime(null);
}
 function handleStop() {
  if (!isWorking || !startTime) return;

  const stopTime = new Date().toISOString();

  let finalBreakMinutes = breakMinutes;

  if (isOnBreak && breakStartTime) {
    const diffMs = new Date(stopTime).getTime() - new Date(breakStartTime).getTime();
    finalBreakMinutes += Math.max(0, Math.round(diffMs / 60000));
  }

  const totalMinutes = Math.max(
    0,
    Math.round((new Date(stopTime).getTime() - new Date(startTime).getTime()) / 60000)
  );

  const workedMinutes = Math.max(0, totalMinutes - finalBreakMinutes);

  const logItem = {
    id: Date.now(),
    ts: new Date(stopTime).getTime(),
    fullname,
    jobId,
    location,
    description,
    note,
    startedAt: startTime,
    stoppedAt: stopTime,
    breakMinutes: finalBreakMinutes,
    workedMinutes,
    synced: false,
  };

  setLogs((prev) => [logItem, ...prev]);

  setIsWorking(false);
  setIsOnBreak(false);
  setStartTime(null);
  setBreakStartTime(null);
  setBreakMinutes(0);
}
async function handleSync() {
  const unsynced = logs.filter((item) => !item.synced);

  for (const item of unsynced) {
    const payload = {
      ts: item.ts,
      values: {
        fullname: item.fullname,
        jobId: item.jobId,
        location: item.location,
        description: item.description,
        note: item.note,
        startedAt: item.startedAt,
        stoppedAt: item.stoppedAt,
        breakMinutes: item.breakMinutes,
        workedMinutes: item.workedMinutes,
      },
    };

    const res = await fetch(
      "https://ahconnect.automaticheating.com.au/api/v1/W3fZovDPT4Au9WuhnSar/telemetry",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      throw new Error("Sync failed");
    }
  }

  setLogs((prev) =>
    prev.map((item) => ({
      ...item,
      synced: true,
    }))
  );
}
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1413",
        color: "white",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          background: "#12201e",
          border: "1px solid #223533",
          borderRadius: "20px",
          padding: "24px",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Project Logu</h1>
        <p style={{ color: "#b7c7c4" }}>Simple work logger demo</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px",
            marginTop: "20px",
          }}
        >
          <div>
            <label>Full Name</label>
            <input
              value={fullname}
              onChange={(e) => setfullname(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label>Job ID</label>
            <input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label>Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label>Short note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={textareaStyle}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "20px",
            flexWrap: "wrap",
          }}
        >
          <button onClick={handleStart} style={startButtonStyle}>
            Start
          </button>

          <button onClick={handleBreak} style={breakButtonStyle}>
            {isOnBreak ? "End break" : "Break"}
          </button>

          <button onClick={handleStop} style={stopButtonStyle}>
            Stop
          </button>
        <button onClick={handleSync} style={stopButtonStyle}>
  Sync
</button> 
       </div>

        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            borderRadius: "14px",
            background: "#0d1817",
            border: "1px solid #223533",
          }}
        >
          <strong>Status:</strong>{" "}
          {isOnBreak ? "On break" : isWorking ? "Working" : "Idle"}
          <div style={{ marginTop: "10px", color: "#b7c7c4" }}>
            {fullname} · {jobId} · {location}
          </div>
        </div>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "44px",
  marginTop: "6px",
  borderRadius: "12px",
  border: "1px solid #2a403d",
  background: "#0d1817",
  color: "white",
  padding: "0 12px",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "100px",
  marginTop: "6px",
  borderRadius: "12px",
  border: "1px solid #2a403d",
  background: "#0d1817",
  color: "white",
  padding: "12px",
  boxSizing: "border-box",
};

const startButtonStyle: React.CSSProperties = {
  height: "48px",
  padding: "0 18px",
  borderRadius: "12px",
  border: "none",
  background: "#53BC7B",
  color: "#081110",
  fontWeight: 700,
  cursor: "pointer",
};

const breakButtonStyle: React.CSSProperties = {
  height: "48px",
  padding: "0 18px",
  borderRadius: "12px",
  border: "none",
  background: "#f2d7a1",
  color: "#081110",
  fontWeight: 700,
  cursor: "pointer",
};

const stopButtonStyle: React.CSSProperties = {
  height: "48px",
  padding: "0 18px",
  borderRadius: "12px",
  border: "none",
  background: "#ffffff",
  color: "#081110",
  fontWeight: 700,
  cursor: "pointer",
};
