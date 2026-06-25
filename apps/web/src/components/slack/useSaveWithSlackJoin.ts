"use client";

import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Centralizes the auto-join + save-authorization flow that the setter-data
 * Slack configs share. Replaces ~25 LoC of duplicated logic across each of
 * ScorecardConfig / UntouchedAlertConfig / CoverageGapConfig.
 *
 * Categorizes Slack join errors:
 *
 *   - "private" (in message) → set joinError, ALLOW save (graceful degrade,
 *     user manually /invite-s the bot in Slack and notifications start)
 *   - one of channel_not_found / is_archived / token_revoked / invalid_auth →
 *     set joinError, ABORT save. Persisting a dead channel ID means the
 *     downstream cron silently fails forever.
 *   - anything else → set joinError, ALLOW save (lenient — Slack may add new
 *     error codes and we'd rather over-permit than block real configs)
 *
 * Plan: .claude/plans/setter-slack-picker-review-fixes.md
 */

// Slack error codes that mean "this channel will NEVER work" — saving the ID
// would persist a dead config. Match against lowercased error message via
// substring (Slack returns codes like "channel_not_found" both bare and
// wrapped in longer error envelopes from our action).
const ABORT_SAVE_ERROR_CODES = [
  "channel_not_found_or_archived", // (longer prefix — match this BEFORE the bare codes below)
  "channel_not_found",
  "is_archived",
  "token_revoked",
  "invalid_auth",
];

export interface JoinAuthorizeArgs {
  clerkId: string;
  channel: "slack" | "discord" | "";
  slackChannelId: string;
  slackChannelName: string;
  onJoinError: (err: string | null) => void;
}

export interface JoinAuthorizeResult {
  okToSave: boolean;
  // Populated only when okToSave is true AND the user picked a Slack channel.
  // Caller spreads these onto its mutation args.
  slackArgs?: { slackChannelId: string; slackChannelName?: string };
}

export function useSaveWithSlackJoin() {
  const joinSlackChannel = useAction(api.slack.joinSlackChannel);

  async function joinAndAuthorizeSave(
    args: JoinAuthorizeArgs,
  ): Promise<JoinAuthorizeResult> {
    const { clerkId, channel, slackChannelId, slackChannelName, onJoinError } =
      args;

    // Not a Slack save — nothing to auto-join. Clear any stale error so a
    // previous Slack attempt's red banner doesn't linger when the user
    // switches to Discord (or disables the config entirely).
    if (channel !== "slack" || !slackChannelId.trim()) {
      onJoinError(null);
      return { okToSave: true };
    }

    const slackArgs: { slackChannelId: string; slackChannelName?: string } = {
      slackChannelId: slackChannelId.trim(),
    };
    if (slackChannelName.trim()) {
      slackArgs.slackChannelName = slackChannelName.trim();
    }

    const joinResult = await joinSlackChannel({
      clerkId,
      channelId: slackChannelId.trim(),
    });

    if (joinResult.success) {
      onJoinError(null);
      return { okToSave: true, slackArgs };
    }

    // Defensive fallback when the action returns success=false but error is
    // missing/empty. Shouldn't happen per the action contract but the picker
    // would otherwise silently clear a stale error in this branch.
    const errMsg =
      joinResult.error ??
      "Couldn't auto-join channel — please verify the channel exists and retry";
    onJoinError(errMsg);

    const lower = errMsg.toLowerCase();
    if (ABORT_SAVE_ERROR_CODES.some((code) => lower.includes(code))) {
      // Dead channel — refuse to persist a config that will silently fail.
      return { okToSave: false };
    }
    // Private channel + anything else → graceful degrade, save proceeds.
    return { okToSave: true, slackArgs };
  }

  return { joinAndAuthorizeSave };
}
