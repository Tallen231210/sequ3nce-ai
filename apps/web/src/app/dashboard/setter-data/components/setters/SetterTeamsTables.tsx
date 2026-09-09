"use client";

/** The per-lane tables of the Setter teams section (SetterTeamsSection). */

export interface LaneRow {
  id: string;
  name: string;
  bookings: number;
  tagged: number;
  crmOnly: number;
  showed: number;
  noShow: number;
  unknown: number;
  showRatePct: number | null;
}

export interface ConfirmationLaneRow extends LaneRow {
  newSelfBooks: number;
  contacted: number;
  reached: number;
  coveragePct: number | null;
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export function LaneTable({
  title,
  nameHeader,
  rows,
  showTagging,
  onRow,
}: {
  title: string;
  nameHeader: string;
  rows: LaneRow[];
  showTagging?: boolean;
  onRow: (row: LaneRow) => void;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce(
    (t, r) => ({ bookings: t.bookings + r.bookings, tagged: t.tagged + r.tagged, crmOnly: t.crmOnly + r.crmOnly, showed: t.showed + r.showed, noShow: t.noShow + r.noShow, unknown: t.unknown + r.unknown }),
    { bookings: 0, tagged: 0, crmOnly: 0, showed: 0, noShow: 0, unknown: 0 },
  );
  const known = total.showed + total.noShow;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-semibold text-foreground normal-case tracking-normal">{title}</th>
            <th className="py-2 pr-3 text-right font-medium">Sets</th>
            {showTagging && (
              <>
                <th className="py-2 pr-3 text-right font-medium" title="Sets credited from the initials on the calendar title">
                  Tagged
                </th>
                <th className="py-2 pr-3 text-right font-medium" title="Sets credited from Close calls or texts only — no initials on the title">
                  From Close only
                </th>
              </>
            )}
            <th className="py-2 pr-3 text-right font-medium">Showed</th>
            <th className="py-2 pr-3 text-right font-medium">No-show</th>
            <th className="py-2 pr-3 text-right font-medium">Unknown</th>
            <th className="py-2 text-right font-medium">Show rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer border-b border-border/60 hover:bg-muted/50" onClick={() => onRow(r)}>
              <td className="py-1.5 pr-3">
                <span className="text-xs text-muted-foreground">{nameHeader}: </span>
                {r.name}
              </td>
              <td className="py-1.5 pr-3 text-right">{r.bookings}</td>
              {showTagging && (
                <>
                  <td className="py-1.5 pr-3 text-right">{r.tagged}</td>
                  <td className="py-1.5 pr-3 text-right">{r.crmOnly}</td>
                </>
              )}
              <td className="py-1.5 pr-3 text-right">{r.showed}</td>
              <td className="py-1.5 pr-3 text-right">{r.noShow}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.unknown}</td>
              <td className="py-1.5 text-right">{pct(r.showRatePct)}</td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="font-medium">
              <td className="py-1.5 pr-3">Total</td>
              <td className="py-1.5 pr-3 text-right">{total.bookings}</td>
              {showTagging && (
                <>
                  <td className="py-1.5 pr-3 text-right">{total.tagged}</td>
                  <td className="py-1.5 pr-3 text-right">{total.crmOnly}</td>
                </>
              )}
              <td className="py-1.5 pr-3 text-right">{total.showed}</td>
              <td className="py-1.5 pr-3 text-right">{total.noShow}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{total.unknown}</td>
              <td className="py-1.5 text-right">{known > 0 ? `${Math.round((total.showed / known) * 100)}%` : "—"}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ConfirmationTable({ rows, onRow }: { rows: ConfirmationLaneRow[]; onRow: (r: ConfirmationLaneRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-semibold text-foreground normal-case tracking-normal">Confirmation</th>
            <th className="py-2 pr-3 text-right font-medium" title="Self-booked funnel calls in the range">New self-books</th>
            <th className="py-2 pr-3 text-right font-medium" title="Called or texted after the lead booked, or marked (s)">Contacted</th>
            <th className="py-2 pr-3 text-right font-medium" title="A connected call, or the lead texted back">Reached</th>
            <th className="py-2 pr-3 text-right font-medium">Coverage</th>
            <th className="py-2 pr-3 text-right font-medium">Showed</th>
            <th className="py-2 pr-3 text-right font-medium">No-show</th>
            <th className="py-2 pr-3 text-right font-medium">Unknown</th>
            <th className="py-2 text-right font-medium" title="Of the calls they contacted, showed over showed-plus-no-show">Show rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer border-b border-border/60 hover:bg-muted/50" onClick={() => onRow(r)}>
              <td className="py-1.5 pr-3">{r.name}</td>
              <td className="py-1.5 pr-3 text-right">{r.newSelfBooks}</td>
              <td className="py-1.5 pr-3 text-right">{r.contacted}</td>
              <td className="py-1.5 pr-3 text-right">{r.reached}</td>
              <td className="py-1.5 pr-3 text-right">{pct(r.coveragePct)}</td>
              <td className="py-1.5 pr-3 text-right">{r.showed}</td>
              <td className="py-1.5 pr-3 text-right">{r.noShow}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.unknown}</td>
              <td className="py-1.5 text-right">{pct(r.showRatePct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
