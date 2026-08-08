"use client";

import { ShieldCheck } from "lucide-react";

/**
 * Score and findings, rendered the same way everywhere they appear — the
 * settings preview and the call page.
 *
 * Purely presentational. Every piece of wording here is deliberate: a finding
 * says what was said and which rule it may touch, and never that a rule was
 * broken. If we tell a customer a call is "9/10 compliant" and they later face
 * a complaint, our number becomes part of their story.
 */

export interface ComplianceFinding {
  rule: string;
  quote: string;
  concern: string;
  timestamp?: number;
  speaker?: string;
}

export interface ComplianceReview {
  score: number;
  summary: string;
  findings: ComplianceFinding[];
  reviewedAt?: number;
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Three bands, matching the anchors written into the prompt. Green is reserved
 * for calls with nothing on them at all — a "mostly fine" call that still has a
 * finding should not read as a pass at a glance.
 */
function tone(score: number, findingCount: number) {
  if (findingCount === 0) {
    return { chip: "bg-emerald-100 text-emerald-800 border-emerald-300" };
  }
  if (score >= 7) return { chip: "bg-amber-100 text-amber-800 border-amber-300" };
  return { chip: "bg-rose-100 text-rose-800 border-rose-300" };
}

export function ComplianceFindings({
  review,
  onSeek,
}: {
  review: ComplianceReview;
  /** Wire to the player when there is one, so a timestamp is clickable. */
  onSeek?: (seconds: number) => void;
}) {
  const t = tone(review.score, review.findings.length);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-sm font-semibold tabular-nums ${t.chip}`}
        >
          {review.score}/10
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {review.summary}
        </p>
      </div>

      {review.findings.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Nothing on this call touched your rules.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {review.findings.map((f, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {f.speaker && <span>{f.speaker}</span>}
                {typeof f.timestamp === "number" ? (
                  onSeek ? (
                    <button
                      type="button"
                      onClick={() => onSeek(f.timestamp as number)}
                      className="tabular-nums underline underline-offset-2 hover:text-foreground"
                    >
                      {mmss(f.timestamp)}
                    </button>
                  ) : (
                    <span className="tabular-nums">{mmss(f.timestamp)}</span>
                  )
                ) : (
                  /* The timestamp comes from finding these exact words in the
                     recording. No timestamp means we couldn't — almost always
                     because the wording was tidied up slightly. Saying so beats
                     presenting a paraphrase in quotation marks as if it were
                     word for word. */
                  <span
                    className="normal-case tracking-normal"
                    title="We couldn't match these exact words in the recording, so the wording may be approximate."
                  >
                    wording approximate
                  </span>
                )}
              </div>

              <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-sm italic leading-relaxed">
                &ldquo;{f.quote}&rdquo;
              </blockquote>

              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">May touch:</span>{" "}
                {f.rule}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {f.concern}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
