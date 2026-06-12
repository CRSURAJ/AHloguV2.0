export const MELBOURNE_TIME_ZONE = "Australia/Melbourne";

function getMelbourneOffsetMs(atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MELBOURNE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(atMs));

  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  const wallAsUtcMs = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour") % 24,
    getPart("minute"),
    getPart("second"),
  );

  return wallAsUtcMs - atMs;
}

function melbourneWallComponentsToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
  millisecond = 0,
): number {
  const wallAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  // The instant is the wall time minus the zone offset; the offset depends on
  // the instant itself, so refine once to converge across DST transitions.
  let utcMs = wallAsUtcMs - getMelbourneOffsetMs(wallAsUtcMs);
  utcMs = wallAsUtcMs - getMelbourneOffsetMs(utcMs);

  return utcMs;
}

/** Parse a `datetime-local` value ("2026-06-12T08:30") as Melbourne wall time. */
export function melbourneDateTimeLocalToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);

  if (!match) return value;

  const [, year, month, day, hour, minute] = match.map(Number);

  return new Date(melbourneWallComponentsToUtcMs(year, month, day, hour, minute)).toISOString();
}

/** Epoch ms of the start or end of a Melbourne calendar day ("2026-06-12"). */
export function melbourneDayBoundaryMs(dateValue: string, boundary: "start" | "end"): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);

  if (!match) return NaN;

  const [, year, month, day] = match.map(Number);

  return boundary === "start"
    ? melbourneWallComponentsToUtcMs(year, month, day, 0, 0, 0, 0)
    : melbourneWallComponentsToUtcMs(year, month, day, 23, 59, 59, 999);
}

export function formatMelbourneDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-AU", {
    timeZone: MELBOURNE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
