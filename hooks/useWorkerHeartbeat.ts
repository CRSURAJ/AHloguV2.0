"use client";

import { useCallback, useEffect, useRef } from "react";
import { getCloudProvider } from "@/lib/cloud/client";
import {
  buildWorkerLiveStatusPayload,
  getWorkerLiveStatusSignature,
} from "@/lib/workLogger/workerStatusPayload";
import type { CurrentUser, Job, LogItem } from "@/types/work";

export type UseWorkerHeartbeatParams = {
  isHydrated: boolean;
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

export function useWorkerHeartbeat({
  isHydrated,
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
}: UseWorkerHeartbeatParams): void {
  const lastWorkerStatusSignatureRef = useRef("");
  const workerStatusInFlightRef = useRef(false);
  const lastWorkerStatusSentAtRef = useRef(0);

  const publishWorkerStatus = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!isHydrated) return;

      const statusPayload = buildWorkerLiveStatusPayload({
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
      });

      const signature = getWorkerLiveStatusSignature(statusPayload);
      const nowMs = Date.now();

      if (
        !options.force &&
        signature === lastWorkerStatusSignatureRef.current &&
        nowMs - lastWorkerStatusSentAtRef.current < 10 * 60 * 1000
      ) {
        return;
      }

      if (workerStatusInFlightRef.current) return;
      workerStatusInFlightRef.current = true;

      try {
        const result = await getCloudProvider().workerStatus.updateMine(statusPayload);
        if (!result.ok) {
          console.warn("Worker live status update failed:", result.message);
          return;
        }
        lastWorkerStatusSignatureRef.current = signature;
        lastWorkerStatusSentAtRef.current = nowMs;
      } catch (error) {
        console.warn("Worker live status update failed:", error);
      } finally {
        workerStatusInFlightRef.current = false;
      }
    },
    [
      availableJobs,
      breakMinutes,
      breakStartTime,
      currentUser,
      failedCount,
      isHydrated,
      isOnBreak,
      isWorking,
      jobId,
      location,
      logs,
      startTime,
    ],
  );

  useEffect(() => {
    // Debounce change-triggered publishes so bursts of state updates
    // (e.g. while filling the form) collapse into one request.
    const timeoutId = window.setTimeout(() => {
      void publishWorkerStatus();
    }, 3_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [publishWorkerStatus]);

  useEffect(() => {
    if (!isHydrated) return;

    const sendHeartbeat = () => {
      void publishWorkerStatus({ force: true });
    };

    const intervalId = window.setInterval(sendHeartbeat, 10 * 60 * 1000);
    window.addEventListener("focus", sendHeartbeat);
    window.addEventListener("online", sendHeartbeat);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", sendHeartbeat);
      window.removeEventListener("online", sendHeartbeat);
    };
  }, [isHydrated, publishWorkerStatus]);
}
