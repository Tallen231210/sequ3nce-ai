"use client";

interface SourceRow {
  source: string;
  leadCount: number;
  connectedCount: number;
  appointmentCount: number;
  showedCount: number;
  connectRate: number | null;
}

interface SetterSourceMixProps {
  rows: SourceRow[];
}

/**
 * Per-setter source attribution table. Answers "which lead sources is
 * this setter actually good with?" — a setter who's mediocre on cold
 * inbound but crushes referrals tells the manager something different
 * than a setter who's mediocre across the board.
 */
export function SetterSourceMix({ rows }: SetterSourceMixProps) {
  if (rows.length === 0) return null;

  const totalLeads = rows.reduce((sum, r) => sum + r.leadCount, 0);

  return (
    <div>
      <div className="mb-2">
        <div className="text-sm font-semibold">Lead source breakdown</div>
        <p className="text-xs text-muted-foreground">
          How this setter performs across their incoming sources.
        </p>
      </div>

      <ul className="space-y-2.5">
        {rows.map((row) => {
          const sharePct =
            totalLeads > 0 ? (row.leadCount / totalLeads) * 100 : 0;
          return (
            <li key={row.source}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium">{row.source}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.leadCount} lead{row.leadCount === 1 ? "" : "s"}
                  {row.connectRate !== null && (
                    <>
                      {" "}
                      · {Math.round(row.connectRate * 100)}% connect
                    </>
                  )}
                  {row.showedCount > 0 && (
                    <> · {row.showedCount} showed</>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${sharePct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
