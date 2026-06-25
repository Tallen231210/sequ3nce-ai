"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { GhlConnectionCard } from "./GhlConnectionCard";
import { ScorecardConfig } from "./ScorecardConfig";
import { UntouchedAlertConfig } from "./UntouchedAlertConfig";
import { CoverageGapConfig } from "./CoverageGapConfig";
import { ConnectionThresholdConfig } from "./ConnectionThresholdConfig";
import { DispositionSyncConfig } from "./DispositionSyncConfig";
import { PlaybookConfig } from "./PlaybookConfig";
import { MetaAdsConfig } from "./MetaAdsConfig";
import type { SlackChannelOption } from "@/components/slack/SlackChannelPicker";
import { Loader2 } from "lucide-react";

// Keyed by config name (scorecard, untouchedAlert, speedToLead, coverageGap)
type AutoJoinErrors = Record<string, string | null>;

export function SettingsTab() {
  const { clerkId } = useTeam();
  const settings = useQuery(
    api.setterData.getMySettings,
    clerkId ? { clerkId } : "skip",
  );
  const installation = useQuery(
    api.setterGhlOauth.getMyInstallationStatus,
    clerkId ? { clerkId } : "skip",
  );

  // Lift Slack channel fetch to this parent so all 4 configs share one
  // list — no redundant fetches, and the channels the user picked on the
  // closer-side /dashboard/settings page are already here (same workspace,
  // same API). Mirrors the closer-side pattern.
  const getSlackChannels = useAction(api.slack.getSlackChannels);
  const [slackChannels, setSlackChannels] = useState<SlackChannelOption[]>([]);
  const [loadingSlackChannels, setLoadingSlackChannels] = useState(false);
  // Distinct from the "Slack not connected" benign-empty case. Set only when
  // getSlackChannels failed for a real reason (network, rate limit, expired
  // token, Slack 5xx). Required so the picker doesn't deceive users with
  // saved channels into thinking those channels were deleted in Slack —
  // shows a "Couldn't load — Retry" affordance instead of "(not found)".
  const [slackFetchError, setSlackFetchError] = useState<string | null>(null);
  // Per-config auto-join error from joinSlackChannel. Surfaced inline by
  // the picker (amber alert with actionable /invite copy for private
  // channels). Each config writes to its own key.
  const [autoJoinErrors, setAutoJoinErrors] = useState<AutoJoinErrors>({});

  const fetchSlackChannels = useCallback(async () => {
    if (!clerkId) return;
    setLoadingSlackChannels(true);
    setSlackFetchError(null);
    try {
      const result = await getSlackChannels({ clerkId });
      if ("channels" in result) {
        setSlackChannels(result.channels);
      } else {
        // Benign empty case = no Slack OAuth token on the team. Picker
        // shows empty dropdown, user is presumably using Discord. Real
        // errors (anything else) get surfaced so we don't mislabel saved
        // channels as deleted when the fetch just failed.
        setSlackChannels([]);
        if (result.error && result.error !== "Slack not connected") {
          setSlackFetchError(result.error);
        }
      }
    } catch (err) {
      // useAction transport-level throw (Convex network, etc.).
      setSlackChannels([]);
      setSlackFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSlackChannels(false);
    }
  }, [clerkId, getSlackChannels]);

  useEffect(() => {
    fetchSlackChannels();
  }, [fetchSlackChannels]);

  if (settings === undefined || installation === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settings === null || installation === null) {
    return null; // Parent already handled non-admin case.
  }

  // Narrow the channel field — schema stores it as a free string for
  // forward-compat (we may add more channels later), but the form only
  // handles the two known values today. Build a fresh object explicitly
  // so the channel type narrows from string|undefined to the literal.
  const narrowedScorecardChannel: "slack" | "discord" | undefined =
    settings.scorecard.channel === "slack" ||
    settings.scorecard.channel === "discord"
      ? settings.scorecard.channel
      : undefined;
  const scorecard = {
    enabled: settings.scorecard.enabled,
    channel: narrowedScorecardChannel,
    slackChannelId: settings.scorecard.slackChannelId,
    slackChannelName: settings.scorecard.slackChannelName,
    discordWebhookUrl: settings.scorecard.discordWebhookUrl,
    hourLocal: settings.scorecard.hourLocal,
  };

  const narrowedUntouchedChannel: "slack" | "discord" | undefined =
    settings.untouchedAlert.channel === "slack" ||
    settings.untouchedAlert.channel === "discord"
      ? settings.untouchedAlert.channel
      : undefined;
  const untouchedAlert = {
    enabled: settings.untouchedAlert.enabled,
    thresholdMinutes: settings.untouchedAlert.thresholdMinutes,
    channel: narrowedUntouchedChannel,
    slackChannelId: settings.untouchedAlert.slackChannelId,
    slackChannelName: settings.untouchedAlert.slackChannelName,
    discordWebhookUrl: settings.untouchedAlert.discordWebhookUrl,
  };

  const narrowedCoverageGapChannel: "slack" | "discord" | undefined =
    settings.coverageGap.channel === "slack" ||
    settings.coverageGap.channel === "discord"
      ? settings.coverageGap.channel
      : undefined;
  const coverageGap = {
    enabled: settings.coverageGap.enabled,
    channel: narrowedCoverageGapChannel,
    slackChannelId: settings.coverageGap.slackChannelId,
    slackChannelName: settings.coverageGap.slackChannelName,
    discordWebhookUrl: settings.coverageGap.discordWebhookUrl,
    hourLocal: settings.coverageGap.hourLocal,
    minLeads: settings.coverageGap.minLeads,
  };

  // Per-config setter for the auto-join error. Each config calls
  // onJoinError(message) after save attempts; passing null clears.
  function makeErrorSetter(key: string) {
    return (err: string | null) =>
      setAutoJoinErrors((prev) => ({ ...prev, [key]: err }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <GhlConnectionCard installation={installation} />
      <DispositionSyncConfig
        enabled={settings.dispositionSync.enabled}
        hasInstallation={installation.connected && installation.status === "active"}
      />
      <PlaybookConfig config={settings.scorecardConfig} />
      <MetaAdsConfig metaAds={settings.metaAds} />
      <ScorecardConfig
        scorecard={scorecard}
        teamTimezone={settings.timezone}
        slackChannels={slackChannels}
        loadingSlackChannels={loadingSlackChannels}
        slackFetchError={slackFetchError}
        onRetrySlackFetch={fetchSlackChannels}
        joinError={autoJoinErrors.scorecard ?? null}
        onJoinError={makeErrorSetter("scorecard")}
      />
      <UntouchedAlertConfig
        settings={untouchedAlert}
        slackChannels={slackChannels}
        loadingSlackChannels={loadingSlackChannels}
        slackFetchError={slackFetchError}
        onRetrySlackFetch={fetchSlackChannels}
        joinError={autoJoinErrors.untouchedAlert ?? null}
        onJoinError={makeErrorSetter("untouchedAlert")}
      />
      <CoverageGapConfig
        settings={coverageGap}
        teamTimezone={settings.timezone || "America/New_York"}
        slackChannels={slackChannels}
        loadingSlackChannels={loadingSlackChannels}
        slackFetchError={slackFetchError}
        onRetrySlackFetch={fetchSlackChannels}
        joinError={autoJoinErrors.coverageGap ?? null}
        onJoinError={makeErrorSetter("coverageGap")}
      />
      <ConnectionThresholdConfig
        thresholdSec={settings.setterConnectionThresholdSec}
      />
    </div>
  );
}
