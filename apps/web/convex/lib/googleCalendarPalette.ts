/**
 * Google Calendar's standard 11-color event palette.
 *
 * Each Google Calendar event has an optional `colorId` (string "1"–"11") that
 * a user sets via Google Calendar's "set color" feature. Companies commonly
 * use this to color-code events by lead quality, type, etc. We mirror those
 * exact colors so the closer's desktop calendar and the manager's web view
 * render identically to what's shown in Google Calendar itself — no parallel
 * color system on our side.
 *
 * Reference: https://developers.google.com/calendar/api/v3/reference/colors
 *
 * NOTE: Google's `event` colors are DIFFERENT from `calendar` colors. The
 * per-event override (`event.colorId`) is one of these 11. When unset, the
 * event falls back to the parent calendar's `backgroundColor`, which is a
 * different hex returned per-calendar by `calendarList.list()`.
 */
export const GOOGLE_EVENT_COLOR_PALETTE: Record<string, string> = {
  "1": "#7986CB", // Lavender
  "2": "#33B679", // Sage
  "3": "#8E24AA", // Grape
  "4": "#E67C73", // Flamingo
  "5": "#F6BF26", // Banana
  "6": "#F4511E", // Tangerine
  "7": "#039BE5", // Peacock
  "8": "#616161", // Graphite
  "9": "#3F51B5", // Blueberry
  "10": "#0B8043", // Basil
  "11": "#D50000", // Tomato
};

/**
 * Resolve the hex color to render an event with, mirroring Google's cascade:
 *   1. Event's per-event color override (colorId), if set and valid
 *   2. Calendar's background color, if known
 *   3. null — caller falls back to its own default (urgency colors on the
 *      desktop schedule, per-closer hashed colors on the web manager view)
 *
 * Stored on `calendarEvents.calendarColor` at sync time so renderers stay
 * dumb — they just consume a hex string.
 */
export function resolveEventColor(
  eventColorId: string | number | undefined | null,
  calendarBackgroundColor: string | undefined | null,
): string | null {
  if (eventColorId != null) {
    const key = String(eventColorId);
    if (GOOGLE_EVENT_COLOR_PALETTE[key]) {
      return GOOGLE_EVENT_COLOR_PALETTE[key];
    }
  }
  if (calendarBackgroundColor) {
    return calendarBackgroundColor;
  }
  return null;
}
