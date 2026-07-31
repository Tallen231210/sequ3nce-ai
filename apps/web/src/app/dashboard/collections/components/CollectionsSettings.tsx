"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Info, Loader2, Send } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
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
 * Outstanding-balances digest config. Deliberately the same shape as the two
 * scorecard settings panels — a manager who has set one up already knows this.
 */
export function CollectionsSettings() {
  const { user } = useUser();
  const data = useQuery(
    api.collectionsSettings.getCollectionsSettings,
    user ? { clerkId: user.id } : "skip",
  );
  const update = useMutation(api.collectionsSettings.updateCollectionsSettings);
  const sendTest = useAction(api.collectionsSettings.sendTestCollectionsDigest);
  const getSlackChannels = useAction(api.slack.getSlackChannels);
  const { joinAndAuthorizeSave } = useSaveWithSlackJoin();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);

  // The channel list. Without a picker there is no way to choose one, and
  // teams whose Slack was connected after we stopped writing the legacy
  // team-wide channel id have nothing to fall back on — the digest would be
  // configured, enabled, and permanently unable to find anywhere to post.
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
        // "Slack not connected" is the benign empty case — the team is
        // presumably on Discord. Anything else is a real failure and must be
        // shown, so a saved channel isn't mislabelled as deleted.
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
      <div className="m-6 flex h-40 items-center justify-center rounded-xl border border-border bg-card">
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

  /**
   * Save a Slack channel, joining it first.
   *
   * The bot has to be IN a channel to post to it. Joining before saving means a
   * dead or inaccessible channel is caught here, rather than by a cron that
   * fails silently every morning with nobody watching.
   */
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
    <div className="space-y-4 p-6">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Posts the deals that closed but haven&apos;t been paid in full — the
          total owed, what&apos;s new, and everything still sitting there with
          how long it&apos;s been. Nothing is sent on a day when nothing is
          outstanding, so the message only ever appears when there&apos;s money
          to chase. Whoever chases it replies in the thread with the
          arrangement.
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

      <div className="rounded-xl border border-border bg-card">
        <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold">Outstanding balances</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A reminder of what&apos;s been closed but not collected
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
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Its own channel, separate from your call notifications — chasing
              money and watching calls are usually different people.
            </p>
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
                <label className="text-xs font-medium" htmlFor="col-channel">
                  Channel
                </label>
                <SlackChannelPicker
                  id="col-channel"
                  className="mt-1.5 max-w-sm"
                  value={data.slackChannelId ?? data.defaultSlackChannelId ?? ""}
                  selectedChannelName={data.slackChannelName ?? undefined}
                  channels={channels}
                  loadingChannels={loadingChannels}
                  fetchError={fetchError}
                  onRetryFetch={() => void fetchChannels()}
                  joinError={joinError}
                  disabled={disabled}
                  // Nothing chosen and no legacy default to inherit means this
                  // config can never post. Say so before it's switched on.
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

          {/* Discord webhook */}
          {data.channel === "discord" && (
            <div>
              <label className="text-xs font-medium" htmlFor="col-webhook">
                Discord webhook URL
              </label>
              <input
                id="col-webhook"
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

          {/* Cadence */}
          <div>
            <div className="text-xs font-medium">How often</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Daily keeps the total in front of whoever is chasing it, and stays
              quiet on days nothing is owed. Weekly posts on Monday mornings
              only.
            </p>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ["daily", "Daily"],
                  ["weekly", "Weekly"],
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

          {/* Delivery hour */}
          <div>
            <label className="text-xs font-medium" htmlFor="col-hour">
              Send at
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <select
                id="col-hour"
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
              post from going out. If nothing is outstanding, nothing is sent —
              that&apos;s the same rule the daily post follows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
