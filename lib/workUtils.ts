import { formatMelbourneDateTime } from "@/lib/melbourneTime";

export function formatMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;

  return `${hours}h ${minutes}m`;
}

export function formatDateTime(iso: string): string {
  return formatMelbourneDateTime(iso);
}

export function minutesBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  return Math.max(0, Math.round((end - start) / 60_000));
}

export function getWorkingStatusText(
  isWorking: boolean,
  isOnBreak: boolean
): string {
  if (!isWorking) return "Ready";
  if (isOnBreak) return "On break";

  return "Working";
}
