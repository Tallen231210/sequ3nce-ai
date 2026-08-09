"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Info, Loader2, Send, TrendingUp } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SlackChannelPicker,
  type SlackChannelOption,
} from "@/components/slack/SlackChannelPicker";
import { useSaveWithSlackJoin } from "@/components/slack/useSaveWithSlackJoin";

/* eslint-disable @typescript-eslint/no-explicit-any */

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/**
 * End-of-day cash digest.
 *
 * Its own channel rather than riding along with call notifications — this is a
 * number the whole team is meant to see, and the channel where every completed
 * call lands is usually not that room.
 */
export function CashDigestSettings() {
  const { user } = useUser();
  const clerkId = user?.id;

  const data = useQuery(
    api.cashDigestSettings.getCashDigestSettings,
    clerkId ? { clerkId } : "skip",
  );
  const update = useMutation(api.cashDigestSettings.updateCashDigestSettings);
  const sendTest = useAction(api.cashDigestSettings.sendTestCashDigest);
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

  // Undefined = loading, null = not a manager. Neither should render.
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
        res.sent ? "Sent — check the channel." : `Not sent: ${res.reason ?? "unknown"}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          End-of-day cash
        </CardTitle>
        <CardDescription>
          What came in today, month and year to date, your pace, and who
          collected it
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Figures come from the Team Performance board — the same numbers
            your closers submit there, through the same manager overrides — so
            this post and that board always agree. Close rate is the average of
            each closer&apos;s own rate, so everyone counts equally regardless
            of call volume. It posts on quiet days too: a zero is worth seeing.
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

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Post the daily numbers</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Its own channel, separate from your call notifications
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

        <div className={data.enabled ? "space-y-5" : "space-y-5 opacity-50"}>
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
                Slack isn&apos;t connected for this team yet.
              </p>
            )}

            {data.channel === "slack" && data.slackConnected && (
              <div className="mt-3">
                <label className="text-xs font-medium" htmlFor="cash-channel">
                  Channel
                </label>
                <SlackChannelPicker
                  id="cash-channel"
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
                  onChange={(id, name) => void saveChannel(id, name)}
                />
              </div>
            )}

            {data.channel === "discord" && (
              <div className="mt-3">
                <label className="text-xs font-medium" htmlFor="cash-webhook">
                  Discord webhook URL
                </label>
                <input
                  id="cash-webhook"
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
          </div>

          {/* Leaderboard */}
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Include the leaderboard</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Each closer&apos;s cash this month and their close rate, ranked
              </p>
            </div>
            <input
              type="checkbox"
              checked={data.showLeaderboard}
              disabled={disabled}
              onChange={(e) => void save({ showLeaderboard: e.target.checked })}
              className="h-4 w-4 shrink-0 rounded border-border accent-foreground"
            />
          </label>

          {/* Cadence */}
          <div>
            <div className="text-xs font-medium">How often</div>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ["daily", "Every day"],
                  ["weekly", "Mondays only"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => void save({ cadence: value })}
                  className={
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
                    (data.cadence === value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Hour */}
          <div>
            <label className="text-xs font-medium" htmlFor="cash-hour">
              Send at
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <select
                id="cash-hour"
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
              <span className="text-xs text-muted-foreground">{data.timezone}</span>
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
              Send it now
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              Posts today&apos;s real numbers to the channel above, right now.
              Uses a separate record, so it won&apos;t stop the scheduled one
              going out.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
