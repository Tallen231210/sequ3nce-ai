"use client";

import { Loader2, Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Reusable Slack channel picker — extracted from the closer-side
 * NotificationChannelConfig so the setter-data settings can use the same
 * widget. The closer-side currently keeps its inline copy unchanged to
 * avoid regression; future decision to lift it onto this shared component.
 *
 * Stateless — parent owns the selected value, the channel list, and any
 * auto-join error. Renders the dropdown + lock icons for private channels
 * + amber error alert with actionable private-channel /invite copy.
 *
 * Plan: .claude/plans/setter-slack-picker-parity.md
 */

export interface SlackChannelOption {
  id: string;
  name: string;
  isPrivate: boolean;
}

interface SlackChannelPickerProps {
  /** Selected channel ID. Empty string = nothing selected. */
  value: string;
  /** Display name of the selected channel — used in the "(not found)" tag
   * and the private-channel error copy. Optional because legacy saved
   * data only has the channel ID; the picker still works via the channels
   * lookup below. */
  selectedChannelName?: string;
  onChange: (channelId: string, channelName: string) => void;
  channels: SlackChannelOption[];
  loadingChannels: boolean;
  /** Auto-join error from the most recent save attempt. Null = no error.
   * If the message contains "private", renders the actionable /invite copy. */
  joinError?: string | null;
  /** Show amber border on the trigger (e.g., when channel is required
   * but nothing is picked). */
  highlightMissing?: boolean;
  /** Disable selection (e.g., while saving). */
  disabled?: boolean;
  className?: string;
}

export function SlackChannelPicker({
  value,
  selectedChannelName,
  onChange,
  channels,
  loadingChannels,
  joinError,
  highlightMissing,
  disabled,
  className,
}: SlackChannelPickerProps) {
  // If the saved value isn't in the fetched channel list, the channel
  // may have been deleted in Slack or the bot kicked. Show the raw ID
  // with a "(not found)" tag so the user knows to re-pick rather than
  // assume their notifications are still routing.
  const matchedChannel = channels.find((c) => c.id === value);
  const showNotFound = value !== "" && !loadingChannels && !matchedChannel;

  return (
    <div className={className}>
      <Select
        value={value}
        onValueChange={(next) => {
          const channel = channels.find((c) => c.id === next);
          if (channel) onChange(channel.id, channel.name);
        }}
        disabled={disabled || loadingChannels}
      >
        <SelectTrigger
          className={`h-9 text-sm ${highlightMissing ? "border-amber-400" : ""}`}
        >
          {loadingChannels ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading channels…
            </span>
          ) : showNotFound ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              #{selectedChannelName ?? value}{" "}
              <span className="text-xs">(not found)</span>
            </span>
          ) : (
            <SelectValue placeholder="Select channel" />
          )}
        </SelectTrigger>
        <SelectContent>
          {channels.map((channel) => (
            <SelectItem key={channel.id} value={channel.id}>
              <span className="flex items-center gap-1.5">
                {channel.isPrivate && (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
                #{channel.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {joinError && (
        <div className="mt-2 text-xs p-2 rounded border bg-amber-50 border-amber-200 text-amber-700">
          {joinError.toLowerCase().includes("private") ? (
            <>
              <p className="font-medium mb-1">
                Sequ3nce can&apos;t auto-join private channels.
              </p>
              <p>
                Open Slack, go to{" "}
                <span className="font-mono">
                  #{selectedChannelName ?? "this channel"}
                </span>
                , type <span className="font-mono">/invite @Sequ3nce</span>,
                then save again here.
              </p>
            </>
          ) : (
            <p>{joinError}</p>
          )}
        </div>
      )}
    </div>
  );
}
