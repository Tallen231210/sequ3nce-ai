// ============================================================================
// The Setters page's words. One meaning each, enforced by import: the strip,
// the cards, the drawer and the setter-app prefill hints all read from here,
// so "connect" or "set" can never drift between two panels again.
// Section labels are team types with per-team overrides — never a person.
// ============================================================================

export type SetterTeamType = "dm" | "outbound" | "confirmation" | "unlabeled";

export const TEAM_ORDER: SetterTeamType[] = ["dm", "outbound", "confirmation", "unlabeled"];

export const DEFAULT_TEAM_LABELS: Record<SetterTeamType, string> = {
  dm: "DM setters",
  outbound: "Outbound setters",
  confirmation: "Confirmation setters",
  unlabeled: "Unlabeled",
};

export function teamLabelsFor(
  overrides: { dm?: string; outbound?: string; confirmation?: string; unlabeled?: string } | undefined,
): Record<SetterTeamType, string> {
  return {
    dm: overrides?.dm?.trim() || DEFAULT_TEAM_LABELS.dm,
    outbound: overrides?.outbound?.trim() || DEFAULT_TEAM_LABELS.outbound,
    confirmation: overrides?.confirmation?.trim() || DEFAULT_TEAM_LABELS.confirmation,
    unlabeled: overrides?.unlabeled?.trim() || DEFAULT_TEAM_LABELS.unlabeled,
  };
}

export const GLOSSARY = {
  sets: { label: "Sets", hint: "Sales bookings made in the range and credited to the setter — the initials on the booking, a DM link name, or a claim. A Close touch alone credits only when the team allows it." },
  unlabeled: { label: "Unlabeled", hint: "Bookings with no setter named on them: no initials, no DM link name, no claim. Listed under whoever on the roster touched them, so they can be claimed or assigned." },
  callsOnCalendar: { label: "Calls on calendar", hint: "Credited bookings whose call falls in the range." },
  shown: { label: "Shown", hint: "Of the calls on the calendar, the ones that showed: a closer's form, a recording with the prospect on it, or a colour change we watched." },
  dials: { label: "Dials", hint: "Outbound calls in Close, every attempt." },
  connects: { label: "Connects", hint: "Outbound calls answered and on the line at least the team's connect threshold. Their EOD calls this pick ups — tune the threshold until the two agree." },
  texts: { label: "Texts", hint: "Outbound texts sent in Close." },
  reached: { label: "Reached", hint: "A connect, or a text the lead answered — shown per lead in the drawer." },
  showRate: { label: "Show rate", hint: "Showed over showed plus no-show. Unknown outcomes are counted, not assumed." },
  closes: { label: "Closes", hint: "Taken calls a closer logged as closed, follow-up calls included." },
  cash: { label: "Cash", hint: "Cash collected on those closes." },
  speed: { label: "Speed to lead (working hours)", hint: "Time from arrival to the first touch by one of this team's setters, counting working hours only. Shown beside the same wait including nights and weekends. Automated texts and closers never stop the clock." },
  coverage: { label: "Coverage", hint: "Self-booked funnel calls contacted after the booking, over all self-booked funnel calls." },
  responseTime: { label: "Response time", hint: "Working hours from the self-booking to the first confirmation touch." },
} as const;
