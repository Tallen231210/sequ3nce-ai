"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Phone } from "lucide-react";

interface Cadence {
  leadsWithDials: number;
  avgDialsPerLead: number | null;
  pctLeadsThreeOrMoreAttempts: number | null;
  medianPursuitDays: number | null;
}

interface SetterCadenceRow {
  ghlUserId: string;
  name: string;
  cadence: Cadence;
}

interface DialCadencePanelProps {
  perSetter: SetterCadenceRow[];
}

/**
 * Per-setter dial cadence panel. Sorts setters by avgDialsPerLead
 * descending so the most-persistent appear first. Setters whose
 * leadsWithDials is below the small-sample threshold (suppressed by the
 * backend with null aggregates) appear at the bottom with "—" and a
 * footnote.
 */
export function DialCadencePanel({ perSetter }: DialCadencePanelProps) {
  const populated = perSetter
    .filter((s) => s.cadence.avgDialsPerLead !== null)
    .sort(
      (a, b) =>
        (b.cadence.avgDialsPerLead ?? 0) - (a.cadence.avgDialsPerLead ?? 0),
    );
  const suppressed = perSetter.filter(
    (s) =>
      s.cadence.avgDialsPerLead === null && s.cadence.leadsWithDials > 0,
  );

  if (populated.length === 0 && suppressed.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Dial cadence by setter</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Persistence patterns per setter. Higher dials/lead and
              %≥3-attempts mean they keep trying. Low numbers mean they
              give up fast.
            </p>
          </div>
          <Phone className="h-4 w-4 text-muted-foreground" />
        </div>

        {populated.length > 0 && (
          <div className="space-y-2">
            {populated.map((row) => (
              <CadenceRow key={row.ghlUserId} row={row} />
            ))}
          </div>
        )}

        {suppressed.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Not enough leads to compute (need ≥5)
            </div>
            <div className="space-y-1.5">
              {suppressed.map((row) => (
                <div
                  key={row.ghlUserId}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>{row.name}</span>
                  <span>
                    {row.cadence.leadsWithDials}{" "}
                    {row.cadence.leadsWithDials === 1 ? "lead" : "leads"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CadenceRow({ row }: { row: SetterCadenceRow }) {
  const { cadence } = row;
  return (
    <div className="grid grid-cols-12 gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm">
      <div className="col-span-4 font-medium">{row.name}</div>
      <div className="col-span-2 text-right">
        <div className="font-semibold tabular-nums">
          {cadence.avgDialsPerLead?.toFixed(1) ?? "—"}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          dials/lead
        </div>
      </div>
      <div className="col-span-3 text-right">
        <div className="font-semibold tabular-nums">
          {cadence.pctLeadsThreeOrMoreAttempts !== null
            ? `${Math.round(cadence.pctLeadsThreeOrMoreAttempts * 100)}%`
            : "—"}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          ≥3 attempts
        </div>
      </div>
      <div className="col-span-3 text-right">
        <div className="font-semibold tabular-nums">
          {cadence.medianPursuitDays !== null
            ? formatPursuitDays(cadence.medianPursuitDays)
            : "—"}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          median pursuit
        </div>
      </div>
    </div>
  );
}

function formatPursuitDays(days: number): string {
  if (days < 1 / 24) {
    const min = Math.round(days * 24 * 60);
    return `${min}m`;
  }
  if (days < 1) {
    const hr = Math.round(days * 24 * 10) / 10;
    return `${hr}h`;
  }
  return `${days.toFixed(1)}d`;
}
