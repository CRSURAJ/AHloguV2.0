export function minutesBetween(startIso: string, endIso: string): number {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

export function formatDateTime(iso: string): string {
  if (!iso) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function getWorkingStatusText(
  isWorking: boolean,
  isOnBreak: boolean
): string {
  if (isOnBreak) return "On break";
  if (isWorking) return "Working";
  return "Idle";
}
