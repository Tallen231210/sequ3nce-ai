"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Info, Loader2, Send } from "lucide-react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import {
  SlackChannelPicker,
  type SlackChannelOption,
} from "@/components/slack/SlackChannelPicker";
import { useSaveWithSlackJoin } from "@/components/slack/useSaveWithSlackJoin";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The human-readable half of a Convex failure.
 *
 * A plain Error thrown in a Convex function is stripped to "Server Error" by
 * the time it reaches the browser; only ConvexError carries its message
 * across. This reads that message when there is one and falls back otherwise,
 * so a validation rule can actually tell someone what they did wrong.
 */
function readableError(e: unknown, fallback: string): string {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  return e instanceof Error ? e.message : fallback;
}

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/**
 * Delivery config for the "who hasn't filed their end-of-day" nudge.
 *
 * Same layout as the scoreboard card directly above it — a manager who set
 * that one up already knows this one. Two deliberate differences: the hour
 * starts unset, and the test button can honestly report there was nobody to
 * chase.
 *
 * The hour used to be REQUIRED before enabling, which deadlocked the screen —
 * the picker lives inside the section disabled while the nudge is off, so
 * there was no way to satisfy the rule from this page. It's now allowed, and
 * the unscheduled state is called out in amber instead.
 */
export function EodNudgeSettings() {
  const { user } = useUser();
  const data = useQuery(
    api.eodNudgeSettings.getEodNudgeSettings,
    user ? { clerkId: user.id } : "skip",
  );
  const update = useMutation(api.eodNudgeSettings.updateEodNudgeSettings);
  const sendTest = useAction(api.eodNudgeSettings.sendTestEodNudge);
  const getSlackChannels = useAction(api.slack.getSlackChannels);
  const { joinAndAuthorizeSave } = useSaveWithSlackJoin();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);

  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const clerkId = user?.id;

  const fetchChannels = useCallback(async () => {
    if (!clerkId) return;
    setLoadingChannels(true);
    setFetchError(null);
    try {
      const result = await getSlackChannels({ clerkId });
      if ("channels" in result) {
        setChannels(result.channels);
      } else {
        setChannels([]);
        if (result.error && result.error !== "Slack not connected") {
          setFetchError(result.error);
        }
      }
    } catch (err) {
      setChannels([]);
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChannels(false);
    }
  }, [clerkId, getSlackChannels]);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  if (data === undefined) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const disabled = !data.canEdit || busy;
  const noHour = typeof data.hourLocal !== "number";

  async function save(patch: any) {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      await update({ clerkId: user!.id, ...patch });
    } catch (e) {
      setError(readableError(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  /** Join the channel before saving, so a dead one fails here not in a cron. */
  async function saveChannel(channelId: string, channelName: string) {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const { okToSave, slackArgs } = await joinAndAuthorizeSave({
        clerkId: user!.id,
        channel: "slack",
        slackChannelId: channelId,
        slackChannelName: channelName,
        onJoinError: setJoinError,
      });
      if (!okToSave) return;
      await update({ clerkId: user!.id, ...slackArgs });
    } catch (e) {
      setError(readableError(e, "Could not save"));
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
          : res.reason === "everyone filed"
            ? "Nothing to send — everyone filed yesterday. That's the nudge working."
            : `Not sent: ${res.reason ?? "unknown reason"}`,
      );
    } catch (e) {
      setError(readableError(e, "Test failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Names the closers who took calls yesterday but never filed their
          end-of-day, with the number of calls they took. The scoreboard only
          counts days a closer submitted, so anyone who skips the form drops off
          it entirely — this is what says so. Nothing is posted on days everyone
          filed, or days nobody worked.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}
      {testResult && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {testResult}
        </div>
      )}

      {/* Enabled but unscheduled is a real, reachable state — the backend
          refuses to send without an hour, so it would otherwise look switched
          on and simply never arrive. Say it here rather than let someone
          discover it a week later. */}
      {data.enabled && noHour && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          This is switched on but has no send time, so nothing will go out. Pick
          a time below.
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold">Missing end-of-day nudge</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Who worked yesterday and didn&apos;t file
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
            "space-y-5 px-5 py-4 " +
            (data.enabled ? "" : "pointer-events-none opacity-50")
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
              <p className="mt-2 text-xs text-amber-700">
                Slack isn&apos;t connected for this team yet — connect it in
                Settings before enabling this.
              </p>
            )}
            {data.channel === "slack" && data.slackConnected && (
              <div className="mt-3">
                <label className="text-xs font-medium" htmlFor="eod-channel">
                  Channel
                </label>
                <SlackChannelPicker
                  id="eod-channel"
                  className="mt-1.5 max-w-sm"
                  value={data.slackChannelId ?? data.defaultSlackChannelId ?? ""}
                  selectedChannelName={data.slackChannelName ?? undefined}
                  channels={channels}
                  loadingChannels={loadingChannels}
                  fetchError={fetchError}
                  onRetryFetch={() => void fetchChannels()}
                  joinError={joinError}
                  disabled={disabled}
                  highlightMissing={
                    !data.slackChannelId && !data.defaultSlackChannelId
                  }
                  onChange={(channelId, channelName) =>
                    void saveChannel(channelId, channelName)
                  }
                />
                {!data.slackChannelId && !data.defaultSlackChannelId && (
                  <p className="mt-2 text-xs text-amber-700">
                    Pick a channel — without one there&apos;s nowhere to post.
                  </p>
                )}
              </div>
            )}
          </div>

          {data.channel === "discord" && (
            <div>
              <label className="text-xs font-medium" htmlFor="eod-webhook">
                Discord webhook URL
              </label>
              <input
                id="eod-webhook"
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

          {/* Which days to chase */}
          <div>
            <div className="text-xs font-medium">Chase</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Which days&apos; forms to chase. A Mon–Fri team chases
              Friday&apos;s on Saturday, and never chases a Sunday.
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
                      if (next.length === 0) return; // refused server-side too
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

          {/* Delivery hour — no default, so it must be chosen */}
          <div>
            <label className="text-xs font-medium" htmlFor="eod-hour">
              Send at
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <select
                id="eod-hour"
                disabled={disabled}
                value={noHour ? "" : String(data.hourLocal)}
                onChange={(e) => void save({ hourLocal: Number(e.target.value) })}
                className={
                  "rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground " +
                  (noHour ? "border-amber-400" : "border-border")
                }
              >
                <option value="" disabled>
                  Pick a time
                </option>
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
            <p className="mt-2 text-[11px] text-muted-foreground">
              Late enough that closers have had a chance to file. Set it after
              the scoreboard so the nudge explains a gap the scoreboard just
              showed.
            </p>
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
              Posts the real message right now. If everyone filed yesterday
              there&apos;s nothing to send, and it will say so rather than
              inventing an example.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
