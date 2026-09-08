// What every column on the closer scorecard counts, in one place.
//
// Zion reads "Gross $", "CDPBC" and "Live" without a shared definition, and
// the same words mean different things on other dashboards. The header
// tooltips and the legend under the table both read from this list, so they
// can't drift apart. Formulas match engine.ts; keep them in step.

export interface ColumnDefinition {
  key: string;
  label: string;
  definition: string;
}

export const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  {
    key: "booked",
    label: "Booked",
    definition:
      "Sales calls on the closer's calendar that day: an outside invitee, or a recording. Cancelled copies, blocks, standups, 1:1s and the team's own excluded titles don't count.",
  },
  {
    key: "live",
    label: "Live",
    definition:
      "Calls that actually happened: a recording with someone on it. An empty room, a call the closer logged as a no-show, or one marked \"not a sales call\" doesn't count.",
  },
  { key: "closes", label: "Closes", definition: "Calls with the outcome \"closed\"." },
  {
    key: "gross",
    label: "Gross $",
    definition:
      "Contract value summed across every call with an outcome, not only closes. Where the team has opted out of AI guesses, an AI-read value counts only after the closer confirms it.",
  },
  { key: "collected", label: "Collected $", definition: "Cash collected on closed calls." },
  { key: "fub", label: "FU bkd", definition: "Bookings whose title says \"follow up\"." },
  {
    key: "fus",
    label: "FU shown",
    definition: "Follow-up bookings whose recorded call shows the prospect joined.",
  },
  { key: "show", label: "Show", definition: "Live ÷ Booked." },
  { key: "liveClose", label: "Live close", definition: "Closes ÷ Live." },
  { key: "bkdClose", label: "Bkd close", definition: "Closes ÷ Booked." },
  { key: "aov", label: "AOV", definition: "Gross $ ÷ Closes." },
  { key: "collect", label: "Collect", definition: "Collected $ ÷ Gross $." },
  { key: "gdpbc", label: "GDPBC", definition: "Gross $ per booked call: Gross $ ÷ Booked." },
  {
    key: "cdpbc",
    label: "CDPBC",
    definition: "Collected $ per booked call: Collected $ ÷ Booked. The keystone number.",
  },
  {
    key: "cdplc",
    label: "CDPLC",
    definition: "Collected $ per live call: Collected $ ÷ Live. The bonus basis.",
  },
  {
    key: "roas",
    label: "ROAS",
    definition: "Collected $ ÷ (Booked × cost per booked call).",
  },
  { key: "fuShow", label: "FU show", definition: "FU shown ÷ FU bkd." },
  {
    key: "gap",
    label: "Gap $",
    definition:
      "(Target CDPBC − CDPBC) × Booked: what closing the gap to the target was worth this period.",
  },
];

const BY_KEY = new Map(COLUMN_DEFINITIONS.map((d) => [d.key, d]));

/** The tooltip text for a column, or an empty string when there is none. */
export function definitionFor(key: string): string {
  return BY_KEY.get(key)?.definition ?? "";
}
