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

interface ScorecardSettings {
  enabled: boolean;
  channel?: "slack" | "discord";
  slackChannelId?: string;
  discordWebhookUrl?: string;
  hourLocal?: number;
}

interface ScorecardConfigProps {
  scorecard: ScorecardSettings;
  teamTimezone?: string;
}

export function ScorecardConfig({
  scorecard,
  teamTimezone,
}: ScorecardConfigProps) {
  const { clerkId } = useTeam();
  const updateConfig = useMutation(api.setterDataMutations.updateScorecardConfig);

  const [enabled, setEnabled] = useState(scorecard.enabled);
  const [channel, setChannel] = useState<"slack" | "discord" | "">(
    scorecard.channel ?? "",
  );
  const [slackChannelId, setSlackChannelId] = useState(scorecard.slackChannelId ?? "");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(
    scorecard.discordWebhookUrl ?? "",
  );
  const [hourLocal, setHourLocal] = useState<string>(
    scorecard.hourLocal !== undefined ? String(scorecard.hourLocal) : "9",
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!clerkId) return;
    setSaving(true);
    setError(null);
    try {
      const args: Record<string, unknown> = {
        clerkId,
        enabled,
      };
      if (channel === "slack" || channel === "discord") {
        args.channel = channel;
      }
      if (channel === "slack" && slackChannelId.trim()) {
        args.slackChannelId = slackChannelId.trim();
      }
      if (channel === "discord" && discordWebhookUrl.trim()) {
        args.discordWebhookUrl = discordWebhookUrl.trim();
      }
      const hourNum = parseInt(hourLocal, 10);
      if (!Number.isNaN(hourNum)) {
        args.hourLocal = hourNum;
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
          <h3 className="text-base font-semibold">Daily Scorecard</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send yesterday's setter performance to Slack or Discord every
            morning. Includes speed-to-lead, connection rate, untouched
            count, and your top setters.
          </p>
        </div>

        <div className="space-y-4">
          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <input
              id="scorecard-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="scorecard-enabled" className="cursor-pointer">
              Send daily scorecard
            </Label>
          </div>

          {enabled && (
            <>
              {/* Channel picker */}
              <div className="space-y-2">
                <Label htmlFor="scorecard-channel">Send to</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as "slack" | "discord")}
                >
                  <SelectTrigger id="scorecard-channel">
                    <SelectValue placeholder="Choose Slack or Discord" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Slack-specific fields */}
              {channel === "slack" && (
                <div className="space-y-2">
                  <Label htmlFor="scorecard-slack-channel">
                    Slack channel ID
                  </Label>
                  <Input
                    id="scorecard-slack-channel"
                    placeholder="C01234567"
                    value={slackChannelId}
                    onChange={(e) => setSlackChannelId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Right-click any channel in Slack → View channel details →
                    copy the ID at the bottom. Falls back to your default
                    Slack channel if left blank.
                  </p>
                </div>
              )}

              {/* Discord-specific fields */}
              {channel === "discord" && (
                <div className="space-y-2">
                  <Label htmlFor="scorecard-discord-webhook">
                    Discord webhook URL
                  </Label>
                  <Input
                    id="scorecard-discord-webhook"
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Server settings → Integrations → Webhooks → New webhook →
                    Copy webhook URL.
                  </p>
                </div>
              )}

              {/* Time of day */}
              <div className="space-y-2">
                <Label htmlFor="scorecard-hour">Time of day</Label>
                <Select value={hourLocal} onValueChange={setHourLocal}>
                  <SelectTrigger id="scorecard-hour" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }).map((_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {formatHour(i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Delivered at this hour in {teamTimezone || "your team's timezone"}.
                </p>
              </div>
            </>
          )}

          {/* Save button + status */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {savedAt && !error && (
              <span className="text-xs text-muted-foreground">
                Saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}
