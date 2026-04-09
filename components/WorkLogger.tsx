"use client";

import { useWorkLogger } from "@/hooks/useWorkLogger";
import WorkLoggerView from "./WorkLoggerView";

export default function WorkLogger() {
  const workLogger = useWorkLogger();
  return <WorkLoggerView {...workLogger} />;
}
