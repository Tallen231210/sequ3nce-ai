"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Info, Loader2, Send } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/**
 * Daily scoreboard delivery config. Deliberately the same shape as the setter
 * scorecard settings — a manager who has set one up already knows this one.
 */
export function ScorecardSettings() {
  const { user } = useUser();
  const data = useQuery(
    api.closerScorecardSettings.getScorecardSettings,
    user ? { clerkId: user.id } : "skip",
  );
  const update = useMutation(api.closerScorecardSettings.updateScorecardSettings);
  const sendTest = useAction(api.closerScorecardSettings.sendTestScorecard);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const disabled = !data.canEdit || busy;

  async function save(patch: any) {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      await update({ clerkId: user!.id, ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await sendTest({ clerkId: user!.id });
      setTestResult(
        res.sent
          ? "Sent — check your channel."
          : `Not sent: ${res.reason ?? "unknown reason"}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Posts yesterday&apos;s numbers — cash, closes, show and close rates,
          and a per-closer ranking — to Slack or Discord each morning. It reads
          the same figures as this dashboard, corrections included, so the post
          and the board can never disagree. Quiet days aren&apos;t posted: a
          channel that gets &quot;0 booked&quot; every weekend stops being read.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}
      {testResult && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {testResult}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold">Daily scoreboard</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One post each morning with yesterday&apos;s results
            </p>
          </div>
          <input
            type="checkbox"
            checked={data.enabled}
            disabled={disabled}
            onChange={(e) => void save({ enabled: e.target.checked })}
            className="h-4 w-4 shrink-0 rounded border-border accent-foreground"
          />
        </label>

        <div
          className={
            "space-y-5 px-5 py-4 " + (data.enabled ? "" : "pointer-events-none opacity-50")
          }
        >
          {/* Channel */}
          <div>
            <div className="text-xs font-medium">Send to</div>
            <div className="mt-2 flex gap-2">
              {(["slack", "discord"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={disabled}
                  onClick={() => void save({ channel: c })}
                  className={
                    "rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-colors " +
                    (data.channel === c
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  {c}
                </button>
              ))}
            </div>

            {data.channel === "slack" && !data.slackConnected && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Slack isn&apos;t connected for this team yet — connect it in
                Settings before enabling this.
              </p>
            )}
            {data.channel === "slack" && data.slackConnected && (
              <p className="mt-2 text-xs text-muted-foreground">
                Posting to{" "}
                <span className="font-medium text-foreground">
                  {data.slackChannelName ??
                    data.slackChannelId ??
                    data.defaultSlackChannelId ??
                    "your default channel"}
                </span>
                .
              </p>
            )}
          </div>

          {/* Discord webhook */}
          {data.channel === "discord" && (
            <div>
              <label className="text-xs font-medium" htmlFor="cs-webhook">
                Discord webhook URL
              </label>
              <input
                id="cs-webhook"
                type="url"
                disabled={disabled}
                value={webhookDraft ?? data.discordWebhookUrl ?? ""}
                onChange={(e) => setWebhookDraft(e.target.value)}
                onBlur={(e) => {
                  if (e.target.value !== (data.discordWebhookUrl ?? "")) {
                    void save({ discordWebhookUrl: e.target.value });
                  }
                  setWebhookDraft(null);
                }}
                placeholder="https://discord.com/api/webhooks/..."
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
              />
            </div>
          )}

          {/* Report days */}
          <div>
            <div className="text-xs font-medium">Report on</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Which days&apos; results to report. A Mon–Fri team gets
              Friday&apos;s numbers on Saturday morning, and no post about a
              dead Sunday.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"],
                [5, "Fri"], [6, "Sat"], [0, "Sun"],
              ].map(([d, label]) => {
                const on = (data.reportDays as number[]).includes(d as number);
                return (
                  <button
                    key={String(d)}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const cur = data.reportDays as number[];
                      const next = on
                        ? cur.filter((x) => x !== d)
                        : [...cur, d as number];
                      if (next.length === 0) return; // handled server-side too
                      void save({ reportDays: next });
                    }}
                    className={
                      "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors " +
                      (on
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delivery hour */}
          <div>
            <label className="text-xs font-medium" htmlFor="cs-hour">
              Send at
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <select
                id="cs-hour"
                disabled={disabled}
                value={data.hourLocal}
                onChange={(e) => void save({ hourLocal: Number(e.target.value) })}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {data.timezone}
              </span>
            </div>
          </div>

          {/* Test */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              disabled={disabled || !data.channel}
              onClick={() => void runTest()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send test post
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              Posts the real message to your real channel right now. It uses a
              separate record, so it won&apos;t stop tomorrow morning&apos;s
              post from going out.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
