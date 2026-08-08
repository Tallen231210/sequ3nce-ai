"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Info, Loader2, Send, ShieldAlert, Wand2 } from "lucide-react";
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
import { ComplianceFindings, type ComplianceReview } from "./ComplianceFindings";

/* eslint-disable @typescript-eslint/no-explicit-any */

const RULES_PLACEHOLDER = `What can and can't be said on your calls, in your own words. For example:

Never promise a specific timeline — say "most clients see results in the first month", never "you'll have this in three weeks".
Never say "money-back guarantee" without the conditions attached.
Don't close anyone who says they can't put the time in.`;

/**
 * Compliance settings.
 *
 * Two settings and a channel, which is the whole feature by design. The rules
 * box is the product: a business describes its own limits in a paragraph, and
 * calls get read against that rather than against a legal corpus we'd have to
 * source per industry and keep current forever.
 *
 * Only managers can reach this — the query returns null for anyone else and the
 * card doesn't render.
 */
export function ComplianceSettings() {
  const { user } = useUser();
  const clerkId = user?.id;

  const data = useQuery(
    api.complianceSettings.getComplianceSettings,
    clerkId ? { clerkId } : "skip",
  );
  const update = useMutation(api.complianceSettings.updateComplianceSettings);
  const preview = useAction(api.complianceSettings.previewComplianceRules);
  const sendTest = useAction(api.complianceSettings.sendTestComplianceAlert);
  const getSlackChannels = useAction(api.slack.getSlackChannels);
  const { joinAndAuthorizeSave } = useSaveWithSlackJoin();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesDraft, setRulesDraft] = useState<string | null>(null);
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { review: ComplianceReview; testedAgainst: string | null } | null
  >(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [testingChannel, setTestingChannel] = useState(false);
  const [channelTestResult, setChannelTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

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

  // Undefined = still loading, null = not a manager. Neither should render.
  if (!data) return null;

  const rules = rulesDraft ?? data.rules;

  async function save(patch: any) {
    setBusy(true);
    setError(null);
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

  async function runChannelTest() {
    setTestingChannel(true);
    setChannelTestResult(null);
    try {
      const res = await sendTest({ clerkId: user!.id });
      setChannelTestResult(
        res.sent
          ? { ok: true, message: "Sent — check the channel." }
          : {
              ok: false,
              message:
                (res.reason ?? "Couldn't send.") +
                " If it's a private channel, run /invite @Sequ3nce in it first.",
            },
      );
    } catch (e) {
      setChannelTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "Couldn't send.",
      });
    } finally {
      setTestingChannel(false);
    }
  }

  async function runPreview() {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res: any = await preview({ clerkId: user!.id, rules });
      if (!res?.ok) {
        setTestError(res?.reason ?? "Couldn't run the test.");
      } else {
        setTestResult({ review: res.review, testedAgainst: res.testedAgainst });
      }
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Couldn't run the test.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Compliance
        </CardTitle>
        <CardDescription>
          Reads every call against your own rules and tells you when something on
          one is worth a look
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Only managers see any of this — it never appears in the closer app,
            and the channel below should be one your closers aren&apos;t in.
            Nothing is sent for a call with nothing on it.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Rules */}
        <div>
          <label className="text-xs font-medium" htmlFor="compliance-rules">
            Your rules
          </label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Plain language. The more specific you are about the exact phrases
            that aren&apos;t allowed, the more useful the findings.
          </p>
          <textarea
            id="compliance-rules"
            rows={10}
            disabled={busy}
            value={rules}
            placeholder={RULES_PLACEHOLDER}
            onChange={(e) => setRulesDraft(e.target.value)}
            onBlur={(e) => {
              if (e.target.value !== data.rules) {
                void save({ rules: e.target.value });
              }
              setRulesDraft(null);
            }}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-foreground"
          />

          {/* Trying the rules before they go live is the point of this button:
              a paragraph reads fine and can still produce a wall of findings on
              a clean call. Better to learn that here than in their channel. */}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={testing || !rules.trim()}
              onClick={() => void runPreview()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Try it on a real call
            </button>
            <span className="text-[11px] text-muted-foreground">
              Nothing is saved or sent
            </span>
          </div>

          {testError && (
            <p className="mt-2 text-xs text-amber-700">{testError}</p>
          )}

          {testResult && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                Tested against{" "}
                {testResult.testedAgainst
                  ? `your call with ${testResult.testedAgainst}`
                  : "a recent call"}
              </p>
              <ComplianceFindings review={testResult.review} />
            </div>
          )}
        </div>

        {/* Where alerts go.
            NOT disabled until the feature is switched on, which is how I built
            it first and had backwards. A missed alert is never retried — so a
            team that enables reviewing before choosing a channel silently loses
            the findings for every call in between. Channel first, switch last. */}
        <div>
          <div className="text-xs font-medium">Alert me in</div>
          <div className="mt-2 flex gap-2">
            {(["slack", "discord"] as const).map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
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
              <label className="text-xs font-medium" htmlFor="compliance-channel">
                Channel
              </label>
              <SlackChannelPicker
                id="compliance-channel"
                className="mt-1.5 max-w-sm"
                value={data.slackChannelId ?? ""}
                selectedChannelName={data.slackChannelName ?? undefined}
                channels={channels}
                loadingChannels={loadingChannels}
                fetchError={fetchError}
                onRetryFetch={() => void fetchChannels()}
                joinError={joinError}
                disabled={busy}
                highlightMissing={!data.slackChannelId}
                onChange={(id, name) => void saveChannel(id, name)}
              />
              {/* No fallback to the team's general channel, unlike the other
                  digests. Findings landing in the room the closers are in is
                  the one mistake here you can't take back. */}
              {!data.slackChannelId && (
                <p className="mt-2 text-xs text-amber-700">
                  Pick a channel — findings are only ever sent to this one, so
                  without it nothing is sent at all.
                </p>
              )}
            </div>
          )}

          {data.channel === "discord" && (
            <div className="mt-3">
              <label className="text-xs font-medium" htmlFor="compliance-webhook">
                Discord webhook URL
              </label>
              <input
                id="compliance-webhook"
                type="url"
                disabled={busy}
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

          {/* The most likely way this whole feature fails is a private Slack
              channel our bot was never invited to — and that failure looks
              exactly like a run of clean calls. Prove it now, not in six
              weeks on the one call that mattered. */}
          <div className="mt-4 border-t border-border pt-4">
            <button
              type="button"
              disabled={busy || testingChannel || !data.channel}
              onClick={() => void runChannelTest()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {testingChannel ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send a test message
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              Posts a clearly-labelled sample to the channel above so you can
              confirm it arrives. Nothing is reviewed and no real call is
              mentioned.
            </p>
            {channelTestResult && (
              <p
                className={
                  "mt-2 flex items-center gap-2 text-xs " +
                  (channelTestResult.ok ? "text-emerald-700" : "text-amber-700")
                }
              >
                {channelTestResult.ok && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                )}
                {channelTestResult.message}
              </p>
            )}
          </div>
        </div>

        {/* The switch, last. Everything above it is setup; this is the only
            control that changes what happens on the next call. */}
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Review calls from now on</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Past calls aren&apos;t scored — only calls recorded from here.
            </p>
          </div>
          <input
            type="checkbox"
            checked={data.enabled}
            disabled={busy}
            onChange={(e) => void save({ enabled: e.target.checked })}
            className="h-4 w-4 shrink-0 rounded border-border accent-foreground"
          />
        </label>

        {data.enabled && !data.slackChannelId && !data.discordWebhookUrl && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Calls are being reviewed but there&apos;s nowhere to send the
            findings, so nothing will be posted. Pick a channel above — alerts
            aren&apos;t sent later for calls that happen in the meantime.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
