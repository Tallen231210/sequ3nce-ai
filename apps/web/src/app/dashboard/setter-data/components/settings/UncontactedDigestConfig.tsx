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

interface UncontactedDigestSettings {
  enabled: boolean;
  channel?: "slack" | "discord";
  slackChannelId?: string;
  slackChannelName?: string;
  discordWebhookUrl?: string;
  hourLocal?: number;
}

interface UncontactedDigestConfigProps {
  uncontactedDigest: UncontactedDigestSettings;
  teamTimezone?: string;
  slackChannels: SlackChannelOption[];
  loadingSlackChannels: boolean;
  slackFetchError: string | null;
  onRetrySlackFetch: () => void;
  joinError: string | null;
  onJoinError: (err: string | null) => void;
}

export function UncontactedDigestConfig({
  uncontactedDigest,
  teamTimezone,
  slackChannels,
  loadingSlackChannels,
  slackFetchError,
  onRetrySlackFetch,
  joinError,
  onJoinError,
}: UncontactedDigestConfigProps) {
  const { clerkId } = useTeam();
  const updateConfig = useMutation(
    api.setterDataMutations.updateUncontactedDigestConfig,
  );
  const { joinAndAuthorizeSave } = useSaveWithSlackJoin();

  const [enabled, setEnabled] = useState(uncontactedDigest.enabled);
  const [channel, setChannel] = useState<"slack" | "discord" | "">(
    uncontactedDigest.channel ?? "",
  );
  const [slackChannelId, setSlackChannelId] = useState(
    uncontactedDigest.slackChannelId ?? "",
  );
  const [slackChannelName, setSlackChannelName] = useState(
    uncontactedDigest.slackChannelName ?? "",
  );
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(
    uncontactedDigest.discordWebhookUrl ?? "",
  );
  // Default 5pm — captures the end of a normal sales day in any reasonable
  // timezone. Teams can pick their own.
  const [hourLocal, setHourLocal] = useState<string>(
    uncontactedDigest.hourLocal !== undefined
      ? String(uncontactedDigest.hourLocal)
      : "17",
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
          <h3 className="text-base font-semibold">Daily Uncontacted Leads Digest</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            End-of-day rollup of every lead that came in today and still
            hasn&apos;t been contacted. Setters can clear the list in one batch
            instead of chasing real-time pings all day. Leads that get
            contacted before the digest fires are excluded automatically.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              id="uncontacted-digest-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="uncontacted-digest-enabled" className="cursor-pointer">
              Send daily uncontacted digest
            </Label>
          </div>

          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="uncontacted-digest-channel">Send to</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as "slack" | "discord")}
                >
                  <SelectTrigger id="uncontacted-digest-channel">
                    <SelectValue placeholder="Choose Slack or Discord" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {channel === "slack" && (
                <div className="space-y-2">
                  <Label htmlFor="uncontacted-digest-slack-channel">
                    Slack channel
                  </Label>
                  <SlackChannelPicker
                    id="uncontacted-digest-slack-channel"
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

              {channel === "discord" && (
                <div className="space-y-2">
                  <Label htmlFor="uncontacted-digest-discord-webhook">
                    Discord webhook URL
                  </Label>
                  <Input
                    id="uncontacted-digest-discord-webhook"
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

              <div className="space-y-2">
                <Label htmlFor="uncontacted-digest-hour">Time of day</Label>
                <Select value={hourLocal} onValueChange={setHourLocal}>
                  <SelectTrigger id="uncontacted-digest-hour" className="w-48">
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

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

