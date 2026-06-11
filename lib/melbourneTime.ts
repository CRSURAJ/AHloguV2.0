export const MELBOURNE_TIME_ZONE = "Australia/Melbourne";

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
