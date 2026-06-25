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

interface CoverageGapSettings {
  enabled: boolean;
  channel?: "slack" | "discord";
  slackChannelId?: string;
  slackChannelName?: string;
  discordWebhookUrl?: string;
  hourLocal?: number;
  minLeads?: number;
}

interface CoverageGapConfigProps {
  settings: CoverageGapSettings;
  teamTimezone: string;
  slackChannels: SlackChannelOption[];
  loadingSlackChannels: boolean;
  slackFetchError: string | null;
  onRetrySlackFetch: () => void;
  joinError: string | null;
  onJoinError: (err: string | null) => void;
}

const HOUR_OPTIONS = Array.from({ length: 24 }).map((_, h) => ({
  value: h,
  label: hourLabel(h),
}));

const MIN_LEADS_OPTIONS = [
  { value: 2, label: "2 leads" },
  { value: 3, label: "3 leads (default)" },
  { value: 5, label: "5 leads" },
  { value: 10, label: "10 leads" },
];

export function CoverageGapConfig({
  settings,
  teamTimezone,
  slackChannels,
  loadingSlackChannels,
  slackFetchError,
  onRetrySlackFetch,
  joinError,
  onJoinError,
}: CoverageGapConfigProps) {
  const { clerkId } = useTeam();
  const updateConfig = useMutation(
    api.setterDataMutations.updateCoverageGapConfig,
  );
  const { joinAndAuthorizeSave } = useSaveWithSlackJoin();

  const [enabled, setEnabled] = useState(settings.enabled);
  const [hourLocal, setHourLocal] = useState<string>(
    String(settings.hourLocal ?? 9),
  );
  const [minLeads, setMinLeads] = useState<string>(
    String(settings.minLeads ?? 3),
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
      const hr = parseInt(hourLocal, 10);
      if (!Number.isNaN(hr)) args.hourLocal = hr;
      const ml = parseInt(minLeads, 10);
      if (!Number.isNaN(ml)) args.minLeads = ml;
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
          <h3 className="text-base font-semibold">Coverage gap digest</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily morning digest of yesterday&apos;s worst lead-coverage
            windows. Identifies hours when leads arrived but waited too
            long for their first dial. Empty days don&apos;t ping. Off by
            default.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              id="coverage-gap-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label
              htmlFor="coverage-gap-enabled"
              className="cursor-pointer"
            >
              Send daily coverage-gap digest
            </Label>
          </div>

          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="coverage-gap-hour">Delivery hour</Label>
                <Select value={hourLocal} onValueChange={setHourLocal}>
                  <SelectTrigger id="coverage-gap-hour" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Times in {teamTimezone}.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coverage-gap-min-leads">
                  Minimum leads per hour to count as a gap
                </Label>
                <Select value={minLeads} onValueChange={setMinLeads}>
                  <SelectTrigger id="coverage-gap-min-leads" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MIN_LEADS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Hours with fewer than this many leads are excluded from the
                  digest — too small a sample to call a real gap.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coverage-gap-channel">Send to</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as "slack" | "discord")}
                >
                  <SelectTrigger id="coverage-gap-channel">
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
                  <Label htmlFor="coverage-gap-slack-channel">Slack channel</Label>
                  <SlackChannelPicker
                    id="coverage-gap-slack-channel"
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
                  <Label htmlFor="coverage-gap-discord">
                    Discord webhook URL
                  </Label>
                  <Input
                    id="coverage-gap-discord"
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  />
                </div>
              )}
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
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}
