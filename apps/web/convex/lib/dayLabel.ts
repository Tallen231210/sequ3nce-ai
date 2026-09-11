/**
 * One day-key label for the whole product: "Mon, Sep 7".
 *
 * A day key IS the day — no timezone maths here, or a Monday in New York
 * becomes a Sunday in the label. The dashboard and the Slack posts both read
 * this, so a date never appears two ways on the same screen.
 */
export function humanDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
