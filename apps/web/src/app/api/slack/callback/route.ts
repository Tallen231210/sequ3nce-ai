import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: Request) {
  const convex = getConvex();

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // Contains teamId
    const error = url.searchParams.get("error");

    // Handle Slack errors
    if (error) {
      console.error("[Slack OAuth] Error from Slack:", error);
      return NextResponse.redirect(
        new URL(`/dashboard/settings?slack_error=${encodeURIComponent(error)}`, req.url)
      );
    }

    if (!code || !state) {
      console.error("[Slack OAuth] Missing code or state");
      return NextResponse.redirect(
        new URL("/dashboard/settings?slack_error=missing_params", req.url)
      );
    }

    // The state is the teamId
    const teamId = state as Id<"teams">;

    // Exchange code for token via Convex action
    const result = await convex.action(api.slack.exchangeCodeForToken, {
      code,
      teamId,
    });

    if (!result.success) {
      console.error("[Slack OAuth] Token exchange failed");
      return NextResponse.redirect(
        new URL("/dashboard/settings?slack_error=exchange_failed", req.url)
      );
    }

    // Success! Redirect back to settings with success message
    const successParams = new URLSearchParams({
      slack_success: "true",
      ...(result.channelName && { slack_channel: result.channelName }),
      ...(result.slackTeamName && { slack_team: result.slackTeamName }),
    });

    return NextResponse.redirect(
      new URL(`/dashboard/settings?${successParams.toString()}`, req.url)
    );
  } catch (err) {
    console.error("[Slack OAuth] Error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/settings?slack_error=server_error", req.url)
    );
  }
}
