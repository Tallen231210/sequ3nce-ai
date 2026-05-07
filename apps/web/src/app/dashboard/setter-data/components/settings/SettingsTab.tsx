"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { GhlConnectionCard } from "./GhlConnectionCard";
import { ScorecardConfig } from "./ScorecardConfig";
import { UntouchedAlertConfig } from "./UntouchedAlertConfig";
import { ConnectionThresholdConfig } from "./ConnectionThresholdConfig";
import { Loader2 } from "lucide-react";

export function SettingsTab() {
  const settings = useQuery(api.setterData.getMySettings);
  const installation = useQuery(api.setterGhlOauth.getMyInstallationStatus);

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <GhlConnectionCard installation={installation} />
      <ScorecardConfig scorecard={scorecard} teamTimezone={settings.timezone} />
      <UntouchedAlertConfig settings={untouchedAlert} />
      <ConnectionThresholdConfig
        thresholdSec={settings.setterConnectionThresholdSec}
      />
    </div>
  );
}
