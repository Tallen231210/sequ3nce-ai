"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SlackChannelPicker,
  type SlackChannelOption,
} from "@/components/slack/SlackChannelPicker";
import { useSaveWithSlackJoin } from "@/components/slack/useSaveWithSlackJoin";

interface UntouchedAlertSettings {
  enabled: boolean;
  thresholdMinutes?: number;
  channel?: "slack" | "discord";
  slackChannelId?: string;
  slackChannelName?: string;
  discordWebhookUrl?: string;
}

interface UntouchedAlertConfigProps {
  settings: UntouchedAlertSettings;
  slackChannels: SlackChannelOption[];
  loadingSlackChannels: boolean;
  slackFetchError: string | null;
  onRetrySlackFetch: () => void;
  joinError: string | null;
  onJoinError: (err: string | null) => void;
}

const THRESHOLD_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "60 minutes" },
];

export function UntouchedAlertConfig({
  settings,
  slackChannels,
  loadingSlackChannels,
  slackFetchError,
  onRetrySlackFetch,
  joinError,
  onJoinError,
}: UntouchedAlertConfigProps) {
  const { clerkId } = useTeam();
  const updateConfig = useMutation(
    api.setterDataMutations.updateUntouchedAlertConfig,
  );
  const { joinAndAuthorizeSave } = useSaveWithSlackJoin();

  const [enabled, setEnabled] = useState(settings.enabled);
  const [thresholdMinutes, setThresholdMinutes] = useState<string>(
    String(settings.thresholdMinutes ?? 5),
  );
  const [channel, setChannel] = useState<"slack" | "discord" | "">(
    settings.channel ?? "",
  );
  const [slackChannelId, setSlackChannelId] = useState(
    settings.slackChannelId ?? "",
  );
  const [slackChannelName, setSlackChannelName] = useState(
    settings.slackChannelName ?? "",
  );
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(
    settings.discordWebhookUrl ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!clerkId) return;
    setSaving(true);
    setError(null);
    try {
      const args: Record<string, unknown> = { clerkId, enabled };
      const thr = parseInt(thresholdMinutes, 10);
      if (!Number.isNaN(thr)) {
        args.thresholdMinutes = thr;
      }
      if (channel === "slack" || channel === "discord") {
        args.channel = channel;
      }
      const { okToSave, slackArgs } = await joinAndAuthorizeSave({
        clerkId,
        channel,
        slackChannelId,
        slackChannelName,
        onJoinError,
      });
      if (!okToSave) {
        setSaving(false);
        return;
      }
      if (slackArgs) {
        Object.assign(args, slackArgs);
      }
      if (channel === "discord" && discordWebhookUrl.trim()) {
        args.discordWebhookUrl = discordWebhookUrl.trim();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateConfig(args as any);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Untouched-lead alerts</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Get a Slack or Discord ping when a fresh lead has been sitting
            with zero contact attempts longer than your threshold. Off by
            default — useful for high-ticket teams where every minute
            matters; noisy for higher-volume teams.
          </p>
        </div>

        <div className="space-y-4">
          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <input
              id="untouched-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="untouched-enabled" className="cursor-pointer">
              Send real-time alerts
            </Label>
          </div>

          {enabled && (
            <>
              {/* Threshold */}
              <div className="space-y-2">
                <Label htmlFor="untouched-threshold">Alert threshold</Label>
                <Select
                  value={thresholdMinutes}
                  onValueChange={setThresholdMinutes}
                >
                  <SelectTrigger id="untouched-threshold" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THRESHOLD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Alert fires once per lead per 15-min window — won't spam
                  if a lead stays untouched.
                </p>
              </div>

              {/* Channel picker */}
              <div className="space-y-2">
                <Label htmlFor="untouched-channel">Send to</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as "slack" | "discord")}
                >
                  <SelectTrigger id="untouched-channel">
                    <SelectValue placeholder="Choose Slack or Discord" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Slack-specific */}
              {channel === "slack" && (
                <div className="space-y-2">
                  <Label htmlFor="untouched-slack-channel">Slack channel</Label>
                  <SlackChannelPicker
                    id="untouched-slack-channel"
                    value={slackChannelId}
                    selectedChannelName={slackChannelName || undefined}
                    onChange={(id, name) => {
                      setSlackChannelId(id);
                      setSlackChannelName(name);
                      onJoinError(null);
                    }}
                    channels={slackChannels}
                    loadingChannels={loadingSlackChannels}
                    fetchError={slackFetchError}
                    onRetryFetch={onRetrySlackFetch}
                    joinError={joinError}
                  />
                </div>
              )}

              {/* Discord-specific */}
              {channel === "discord" && (
                <div className="space-y-2">
                  <Label htmlFor="untouched-discord">
                    Discord webhook URL
                  </Label>
                  <Input
                    id="untouched-discord"
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {/* Save */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {savedAt && !error && (
              <span className="text-xs text-muted-foreground">
                Saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
