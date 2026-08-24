"use client";

// Read-only call detail for a setter: everything the closer sees — video,
// AI summary, ammo, analysis, transcript, outcome — and no way to change
// any of it. No facts editor, no classification control, no share links.

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useSetter } from "../../_components/SetterContext";

type Tab = "overview" | "analysis" | "transcript";

function fmtMoney(v: number | null) {
  return v != null ? `$${v.toLocaleString()}` : null;
}

export default function SetterCallDetailPage() {
  const { callId } = useParams<{ callId: string }>();
  const { sessionToken } = useSetter();
  const [tab, setTab] = useState<Tab>("overview");
  const detail = useQuery(
    api.setterApp.getMyCallDetail,
    callId ? { sessionToken, callId: callId as any } : "skip",
  );

  if (detail === undefined) {
    return <div className="py-16 text-center text-sm text-neutral-400">Loading…</div>;
  }
  if (detail === null || (detail as any).forbidden) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-neutral-500">That call isn&apos;t on your list.</p>
        <Link href="/setter/calls" className="mt-2 inline-block text-[13px] underline">
          Back to your calls
        </Link>
      </div>
    );
  }
  const d = detail as any;
  const videoUrl = d.recordingUrl ?? d.externalShareUrl;

  return (
    <div>
      <Link href="/setter/calls" className="text-[12px] text-neutral-400 hover:text-neutral-900">
        ← Calls you&apos;ve set
      </Link>
      <div className="mb-4 mt-1">
        <h1 className="text-[17px] font-semibold tracking-tight">{d.title}</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          {d.closerName} ·{" "}
          {new Date(d.dateMs).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
          {d.durationSec ? ` · ${Math.round(d.durationSec / 60)} min` : ""}
          {d.outcome ? ` · ${d.outcome.replace(/_/g, " ")}` : ""}
        </p>
      </div>

      {d.recordingUrl ? (
        <video controls src={d.recordingUrl} className="mb-5 w-full rounded-lg bg-black" />
      ) : videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-5 block rounded-lg border border-neutral-200 px-4 py-3 text-[13px] hover:border-neutral-900"
        >
          ▶ Watch the recording
        </a>
      ) : (
        <p className="mb-5 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3 text-[13px] text-neutral-500">
          No recording available for this call.
        </p>
      )}

      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        {(["overview", "analysis", "transcript"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "border-b-2 px-3 py-2 text-[13px] capitalize transition-colors " +
              (tab === t
                ? "border-neutral-900 font-medium"
                : "border-transparent text-neutral-500 hover:text-neutral-900")
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          {d.summary && (
            <Section title="AI summary">
              <SummaryBlock summary={d.summary} />
            </Section>
          )}
          <Section title="Call facts">
            <div className="space-y-1 rounded-lg bg-neutral-50 p-3 text-[13px]">
              <Fact label="Outcome" value={d.outcome ? d.outcome.replace(/_/g, " ") : "pending"} />
              {fmtMoney(d.cashCollected) && <Fact label="Cash collected" value={fmtMoney(d.cashCollected)!} />}
              {fmtMoney(d.contractValue) && <Fact label="Contract value" value={fmtMoney(d.contractValue)!} />}
            </div>
          </Section>
          {d.ammo.length > 0 && (
            <Section title="Key prospect quotes">
              <div className="space-y-1.5">
                {d.ammo.map((a: any, i: number) => (
                  <div key={i} className="rounded-lg bg-neutral-50 px-3 py-2 text-[13px]">
                    “{a.text}”
                    {a.category && (
                      <span className="ml-2 text-[11px] uppercase tracking-wide text-neutral-400">
                        {a.category}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === "analysis" &&
        (d.callAnalysis ? (
          <pre className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-[13px] leading-relaxed">
            {typeof d.callAnalysis === "string"
              ? d.callAnalysis
              : JSON.stringify(d.callAnalysis, null, 2)}
          </pre>
        ) : (
          <p className="py-8 text-center text-sm text-neutral-400">No analysis for this call.</p>
        ))}

      {tab === "transcript" &&
        (d.segments.length > 0 ? (
          <div className="space-y-2.5">
            {d.segments.map((s: any, i: number) => (
              <div key={i} className="text-[13px] leading-relaxed">
                <span className="font-medium text-neutral-700">{s.speaker}: </span>
                <span className="text-neutral-600">{s.text}</span>
              </div>
            ))}
          </div>
        ) : d.transcriptText ? (
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-600">
            {d.transcriptText}
          </pre>
        ) : (
          <p className="py-8 text-center text-sm text-neutral-400">No transcript for this call.</p>
        ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** The summary can be a plain string or the structured object the AI emits
 *  (topic, objections, outcome…). Render both without ceremony. */
function SummaryBlock({ summary }: { summary: unknown }) {
  if (typeof summary === "string") {
    return <p className="text-[13px] leading-relaxed text-neutral-700">{summary}</p>;
  }
  if (summary && typeof summary === "object") {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.entries(summary as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-neutral-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              {k.replace(/([A-Z])/g, " $1")}
            </div>
            <div className="mt-0.5 text-[13px] text-neutral-700">{String(v)}</div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
