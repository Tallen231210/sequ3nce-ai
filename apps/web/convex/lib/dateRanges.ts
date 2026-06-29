// Shared time-window helper used by analytics queries. Extracted so that
// `analytics.ts` and `analyticsRecommendations.ts` (and any future analytics
// query) speak the same date-range semantics without divergent copies.

export type DateRange =
  | "today"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "last_30_days"
  | "last_90_days"
  | "custom";

export function getDateRangeTimestamps(
  range: DateRange,
  customStart?: number,
  customEnd?: number,
): { start: number; end: number; prevStart: number; prevEnd: number } {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (range === "custom" && customStart != null && customEnd != null) {
    const duration = customEnd - customStart;
    return {
      start: customStart,
      end: customEnd,
      prevStart: customStart - duration,
      prevEnd: customStart,
    };
  }

  let start: number;
  let prevStart: number;

  switch (range) {
    case "today": {
      const d = new Date();
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      prevStart = start - day;
      break;
    }
    case "this_week": {
      const dayOfWeek = new Date().getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start = now - daysToMonday * day;
      start = new Date(start).setHours(0, 0, 0, 0);
      prevStart = start - 7 * day;
      break;
    }
    case "last_7_days":
      start = now - 7 * day;
      prevStart = start - 7 * day;
      break;
    case "this_month": {
      const date = new Date();
      start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      prevStart = new Date(date.getFullYear(), date.getMonth() - 1, 1).getTime();
      break;
    }
    case "last_30_days":
      start = now - 30 * day;
      prevStart = start - 30 * day;
      break;
    case "last_90_days":
      start = now - 90 * day;
      prevStart = start - 90 * day;
      break;
    default:
      start = now - 30 * day;
      prevStart = start - 30 * day;
  }

  return { start, end: now, prevStart, prevEnd: start };
}
