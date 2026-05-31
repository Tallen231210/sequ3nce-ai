"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { GhlConnectionCard } from "./GhlConnectionCard";
import { ScorecardConfig } from "./ScorecardConfig";
import { UntouchedAlertConfig } from "./UntouchedAlertConfig";
import { SpeedToLeadConfig } from "./SpeedToLeadConfig";
import { CoverageGapConfig } from "./CoverageGapConfig";
import { ConnectionThresholdConfig } from "./ConnectionThresholdConfig";
import { DispositionSyncConfig } from "./DispositionSyncConfig";
import { Loader2 } from "lucide-react";

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
    discordWebhookUrl: settings.untouchedAlert.discordWebhookUrl,
  };

  const narrowedSpeedToLeadChannel: "slack" | "discord" | undefined =
    settings.speedToLead.channel === "slack" ||
    settings.speedToLead.channel === "discord"
      ? settings.speedToLead.channel
      : undefined;
  const speedToLead = {
    enabled: settings.speedToLead.enabled,
    channel: narrowedSpeedToLeadChannel,
    slackChannelId: settings.speedToLead.slackChannelId,
    discordWebhookUrl: settings.speedToLead.discordWebhookUrl,
    slowThresholdMinutes: settings.speedToLead.slowThresholdMinutes,
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
    discordWebhookUrl: settings.coverageGap.discordWebhookUrl,
    hourLocal: settings.coverageGap.hourLocal,
    minLeads: settings.coverageGap.minLeads,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <GhlConnectionCard installation={installation} />
      <DispositionSyncConfig
        enabled={settings.dispositionSync.enabled}
        hasInstallation={installation.connected && installation.status === "active"}
      />
      <ScorecardConfig scorecard={scorecard} teamTimezone={settings.timezone} />
      <UntouchedAlertConfig settings={untouchedAlert} />
      <SpeedToLeadConfig settings={speedToLead} />
      <CoverageGapConfig
        settings={coverageGap}
        teamTimezone={settings.timezone || "America/New_York"}
      />
      <ConnectionThresholdConfig
        thresholdSec={settings.setterConnectionThresholdSec}
      />
    </div>
  );
}
