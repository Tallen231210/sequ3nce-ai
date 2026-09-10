"use client";

import { flagPair, type CheckField, type CrossCheckFlag } from "../../../../../convex/lib/eodCrossCheck";
import type { CrossCheckData, RosterCheck } from "../lib/cards";
import { humanDay, int } from "../lib/format";

type Day = RosterCheck["days"][number];
type Column = { field: CheckField; label: string; measuredKey: keyof Day["measured"]; hint: string };

const BOOKING_COLUMNS: Column[] = [
  { field: "dials", label: "Dials", measuredKey: "dials", hint: "Filed: dials they typed. Measured: outbound calls in Close from their user that day, every attempt." },
  { field: "sets", label: "Sets", measuredKey: "sets", hint: "Filed: sets they typed. Measured: bookings made that day credited to them by initials or a Close touch." },
  { field: "callsOnCalendar", label: "On calendar", measuredKey: "callsOnCalendar", hint: "Filed: calls on the calendar they typed. Measured: credited bookings whose call was that day." },
  { field: "callsShown", label: "Shown", measuredKey: "callsShown", hint: "Filed: calls shown they typed. Measured: of those calls, the ones with a verified show. A '+N?' is calls with no verdict yet — they may still turn out to have shown." },
];
const CONFIRMATION_COLUMNS: Column[] = [
  { field: "newSelfBooked", label: "New self-books", measuredKey: "newSelfBooked", hint: "Filed: what she typed. Measured: self-booked funnel calls made that day." },
  { field: "contacted", label: "Contacted", measuredKey: "contacted", hint: "Filed: what she typed. Measured: of those, the ones she called, texted, or tagged after the booking." },
  { field: "reached", label: "Reached", measuredKey: "reached", hint: "Filed: what she typed. Measured: of those, a connect or a reply." },
  { field: "confirmedOnCalendar", label: "Confirmed on cal", measuredKey: "confirmedOnCalendar", hint: "Filed: what she typed. Measured: self-books whose call was that day and that she had contacted." },
  { field: "confirmedShowed", label: "Confirmed showed", measuredKey: "confirmedShowed", hint: "Filed: what she typed. Measured: of those, verified shows. '+N?' = no verdict yet." },
];

function GapBadge({ flag }: { flag: CrossCheckFlag }) {
  const gap = flag.gapPct === null ? `${flag.gap > 0 ? "+" : "−"}${Math.abs(flag.gap)}` : `${flag.gapPct > 0 ? "+" : "−"}${Math.abs(flag.gapPct)}%`;
  return (
    <span className="whitespace-nowrap rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800" title={`${flag.label}: ${flagPair(flag)} — outside the team's tolerance`}>
      {flagPair(flag)} ({gap})
    </span>
  );
}

function Cell({ filed, measured, flag, unknown }: { filed: number | null | undefined; measured: number | null; flag: CrossCheckFlag | undefined; unknown?: number | null }) {
  const f = filed === undefined || filed === null ? "—" : int(filed);
  if (measured === null) return <span>{f}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>
        {f}{" "}
        <span className={`text-[11px] ${flag ? "font-medium text-amber-700" : "text-muted-foreground"}`}>
          / {int(measured)}
          {unknown ? <span title="Calls that day with no show verdict yet"> +{unknown}?</span> : null}
        </span>
      </span>
      {flag && <GapBadge flag={flag} />}
    </span>
  );
}

/** Filed pick-ups beside answered calls in Close at each call length — the counted threshold in bold. */
function LadderCell({ filed, ladder, connectSec, flag }: { filed: number | null | undefined; ladder: Day["ladder"]; connectSec: number; flag: CrossCheckFlag | undefined }) {
  const f = filed === undefined || filed === null ? "—" : int(filed);
  if (!ladder) return <span>{f}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{f}</span>
      <span className="flex gap-x-2 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        {ladder.thresholds.map((t, i) => (
          <span key={t} className={t === connectSec ? `font-semibold ${flag ? "text-amber-700" : "text-foreground"}` : ""} title={`Answered calls in Close lasting ${t} seconds or more${t === connectSec ? " — the team's connect threshold, the number the cards and flags use" : ""}`}>
            {t}s+ {int(ladder.counts[i])}
          </span>
        ))}
      </span>
      {flag && <GapBadge flag={flag} />}
    </span>
  );
}

/** One setter's days: what they filed beside what Close and the calendar measured, flags with both numbers where they disagree. */
export function EodRows({ rosterId, checks }: { rosterId: string; checks: CrossCheckData | null | undefined }) {
  if (checks === undefined) return <p className="py-6 text-sm text-muted-foreground">Reading their days…</p>;
  const me = checks?.byRoster.find((r) => r.rosterId === rosterId);
  if (!checks || !me) return <p className="py-6 text-sm text-muted-foreground">Nothing to show.</p>;
  const confirmation = me.role === "confirmation";
  const columns = confirmation ? CONFIRMATION_COLUMNS : BOOKING_COLUMNS;
  const t = checks.tolerances;
  const th = "py-2 pr-3 text-right font-medium";
  return (
    <div className="overflow-x-auto text-sm">
      <div className="mb-3 space-y-1 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Filed</span> is what they typed on their EOD. <span className="font-medium text-foreground">Measured</span> (after the slash) is what we can count for the same day:{" "}
          {confirmation
            ? "self-books and calls from the calendar; contacted and reached from her own Close activity."
            : me.linked
              ? "dials and pick-ups from their own Close calls; sets, calls on the calendar and shows from the calendar."
              : "only the calendar — no Close user is linked to this roster row, so dials and pick-ups can't be counted."}
        </p>
        {!confirmation && me.linked && (
          <p>
            <span className="font-medium text-foreground">Pick-ups</span> show a ladder: answered calls in Close lasting at least 30, 45, 60 or 90 seconds. The bold step ({checks.connectSec}s+) is the team&apos;s
            connect threshold, the number the cards and the flags use. Close marks a dial &quot;answered&quot; whenever the line picked up, voicemail included, so the shorter steps include machines and hang-ups.
          </p>
        )}
        <p>
          An amber badge means the filed number sits outside the team&apos;s tolerance of the measured one: {t.dialsPct}% for dials, {t.pickUpsPct}% for pick-ups, {t.confirmationPct}% for confirmation fields (floor {t.minGap}); sets only when more are filed than credited; on calendar and shown allow a gap of 1. Tolerances are in settings.
          {checks.truncated.length > 0 ? ` Partial read (${checks.truncated.join(", ")}).` : ""}
        </p>
      </div>
      <table className="min-w-full tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Day</th>
            {!confirmation && (
              <>
                <th className={th} title={BOOKING_COLUMNS[0].hint}>Dials</th>
                <th className={`${th} min-w-[15rem]`} title="Filed: pick-ups they typed. Below it, answered calls in Close by call length; the bold step is what the team counts as a connect.">
                  Pick-ups · by call length
                </th>
              </>
            )}
            {(confirmation ? columns : columns.slice(1)).map((c) => (
              <th key={c.field} className={th} title={c.hint}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {me.days.map((d) => (
            <tr key={d.dayKey} className={`border-b border-border last:border-b-0 ${d.filed ? "" : "text-muted-foreground"}`}>
              <td className="whitespace-nowrap py-1.5 pr-3 align-top">
                {humanDay(d.dayKey)}
                {!d.filed && <span className="ml-1 text-[11px]">{d.due ? "not filed" : "not due"}</span>}
                {d.filed && d.flags.length > 0 && <span className="ml-1 text-[11px] font-medium text-amber-700">{d.flags.length} off</span>}
              </td>
              {!confirmation && (
                <>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top">
                    <Cell filed={d.filed?.dials} measured={d.measured.dials} flag={d.flags.find((f) => f.field === "dials")} />
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top">
                    <LadderCell filed={d.filed?.pickUps} ladder={d.ladder} connectSec={checks.connectSec} flag={d.flags.find((f) => f.field === "pickUps")} />
                  </td>
                </>
              )}
              {(confirmation ? columns : columns.slice(1)).map((c) => (
                <td key={c.field} className="whitespace-nowrap py-1.5 pr-3 text-right align-top">
                  <Cell
                    filed={d.filed?.[c.field]}
                    measured={d.measured[c.measuredKey]}
                    flag={d.flags.find((f) => f.field === c.field)}
                    unknown={c.field === "callsShown" ? d.measured.callsUnknown : c.field === "confirmedShowed" ? d.measured.confirmedUnknown : null}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
