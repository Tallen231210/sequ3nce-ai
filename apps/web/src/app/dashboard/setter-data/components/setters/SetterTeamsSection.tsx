"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card } from "@/components/ui/card";
import { SetterTeamDrill, type DrillSelection } from "./SetterTeamDrill";
import { ConfirmationTable, LaneTable, type ConfirmationLaneRow, type LaneRow } from "./SetterTeamsTables";
import type { FunctionReturnType } from "convex/server";

export type SetterTeamsData = NonNullable<FunctionReturnType<typeof api.setterTeamQueries.getSetterTeams>>;

/**
 * Setter teams — every booking in the range, by who set it and whether the
 * prospect showed. Close activity or the calendar tag, either counts. Hidden
 * for teams without the setter_teams flag (the query returns null).
 */
export function SetterTeamsSection({ rangeStart, rangeEnd }: { rangeStart: number; rangeEnd: number }) {
  const { clerkId } = useTeam();
  const data = useQuery(api.setterTeamQueries.getSetterTeams, clerkId ? { clerkId, rangeStart, rangeEnd } : "skip");
  // Nothing while loading either: most teams don't have the flag, and a
  // spinner that collapses to nothing would jump the leaderboard on every
  // range change.
  if (data === null || data === undefined) return null;
  return <SetterTeamsView data={data} />;
}

/** The section itself, given the query's data — also what the dev preview renders. */
export function SetterTeamsView({ data }: { data: SetterTeamsData }) {
  const [selection, setSelection] = useState<DrillSelection | null>(null);
  const lanes = data.comparison;
  const confirmationName = data.confirmation[0]?.name ?? "Confirmation";
  const notes: string[] = [];
  if (data.rangeClampedToDays) notes.push(`Showing the last ${data.rangeClampedToDays} days of the range.`);
  if (data.truncated.length > 0) notes.push(`Partial: some reads hit their cap (${data.truncated.join(", ")}).`);
  if (data.followUpsExcluded > 0) notes.push(`${data.followUpsExcluded} follow-up calls are counted for shows but not as sets.`);
  if (data.configured.rostersWithCrmUser < data.configured.rosters) {
    const n = data.configured.rosters - data.configured.rostersWithCrmUser;
    notes.push(`${n} roster member${n === 1 ? " has" : "s have"} no CRM user linked yet (Setter EODs → roster).`);
  }

  return (
    <Card className="space-y-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Setter teams</h3>
          <p className="text-sm text-muted-foreground">
            Every booking in the range, by who set it and whether the prospect showed. A setter gets the set from Close
            activity or the calendar tag — either counts. Click a row for the evidence.
          </p>
        </div>
        {notes.length > 0 && (
          <ul className="max-w-sm text-xs text-muted-foreground">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Lane comparison: DM vs outbound vs confirmation vs untouched */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium"> </th>
              {lanes.map((l) => (
                <th key={l.lane} className="py-2 pr-3 text-right font-medium" title={l.label}>
                  {l.lane === "confirmation" ? confirmationName : l.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Bookings", (l) => l.bookings],
                ["Showed", (l) => l.showed],
                ["No-show", (l) => l.noShow],
                ["Unknown", (l) => l.unknown],
                ["Show rate", (l) => (l.showRatePct === null ? "—" : `${l.showRatePct}%`)],
              ] as Array<[string, (l: (typeof lanes)[number]) => number | string]>
            ).map(([label, pick]) => (
              <tr key={label} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 text-muted-foreground">{label}</td>
                {lanes.map((l) => (
                  <td
                    key={l.lane}
                    className="cursor-pointer py-1.5 pr-3 text-right hover:bg-muted/50"
                    onClick={() => setSelection({ kind: "lane", lane: l.lane, name: l.lane === "confirmation" ? confirmationName : l.label })}
                  >
                    {pick(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          Self-booked through the funnel: {data.funnel.newSelfBooks} new · {data.funnel.contacted} contacted by{" "}
          {confirmationName} · {data.funnel.uncontacted} untouched · {data.funnel.leadMissing} with no lead in Close.
          Show rate is showed over showed-plus-no-show; unknowns don't count against anyone.
        </p>
      </div>

      <LaneTable
        title="DM setters"
        nameHeader="From the booking link"
        rows={data.dm}
        onRow={(r: LaneRow) => setSelection({ kind: "person", lane: "dm", id: r.id, name: r.name })}
      />
      <LaneTable
        title="Outbound setters"
        nameHeader="Setter"
        rows={data.outbound}
        showTagging
        onRow={(r) => setSelection({ kind: "person", lane: "outbound", id: r.id, name: r.name })}
      />
      <ConfirmationTable rows={data.confirmation} onRow={(r: ConfirmationLaneRow) => setSelection({ kind: "person", lane: "confirmation", id: r.id, name: r.name })} />
      <LaneTable
        title="Self-booked, not contacted"
        nameHeader="Closer"
        rows={data.selfBookedUncontacted}
        onRow={(r) => setSelection({ kind: "person", lane: "self_booked_uncontacted", id: r.id, name: r.name })}
      />
      <LaneTable
        title="Needs a look"
        nameHeader="Why"
        rows={data.unattributed}
        onRow={(r) => setSelection({ kind: "person", lane: "unattributed", id: r.id, name: r.name })}
      />

      <SetterTeamDrill selection={selection} records={data.records} timezone={data.range.timezone} onClose={() => setSelection(null)} />
    </Card>
  );
}

