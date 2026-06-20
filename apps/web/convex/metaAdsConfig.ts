"use node";

// ============================================================================
// Meta Ads connection config — Phase 1 setup mutations.
//
// Manager generates a User Access Token via Graph API Explorer
// (https://developers.facebook.com/tools/explorer) with ads_read
// permission, then pastes into Settings. We encrypt-store it on
// teams.metaAdsAccessToken using the same lib/encrypt pattern as
// hyrosApiKey.
//
// Token validation happens server-side: we call /me to confirm the
// token works + /me/adaccounts to surface the available ad accounts
// for selection.
//
// Token expiry: long-lived User tokens expire every 60 days. We surface
// metaAdsTokenExpiresAt so the UI can prompt a fresh paste.
// ============================================================================

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptApiKey } from "./lib/encrypt";

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";

interface MetaAdAccount {
  id: string;
  account_id: string;
  name?: string;
  currency?: string;
  amount_spent?: string;
}

export const validateAndStoreMetaToken = action({
  args: {
    clerkId: v.string(),
    accessToken: v.string(),
    adAccountId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    error?: string;
    adAccounts?: MetaAdAccount[];
    tokenExpiresAt?: number;
  }> => {
    const user: { teamId?: string } | null = await ctx.runQuery(
      internal.metaAdsInternal.resolveUserTeam,
      { clerkId: args.clerkId },
    );
    if (!user?.teamId) return { ok: false, error: "Not authenticated" };

    // Step 1: validate the token by calling /me. Cheap probe.
    const meResp = await fetch(
      `${META_GRAPH_BASE}/me?access_token=${encodeURIComponent(args.accessToken)}`,
    );
    if (!meResp.ok) {
      const text = await meResp.text();
      return {
        ok: false,
        error: `Token invalid: ${meResp.status} ${text.slice(0, 100)}`,
      };
    }

    // Step 2: get available ad accounts. The manager will need to
    // pick one (a Meta user may have many).
    const acctResp = await fetch(
      `${META_GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,currency,amount_spent&limit=50&access_token=${encodeURIComponent(args.accessToken)}`,
    );
    if (!acctResp.ok) {
      const text = await acctResp.text();
      return {
        ok: false,
        error: `Couldn't fetch ad accounts: ${acctResp.status} ${text.slice(0, 100)}`,
      };
    }
    const acctBody: { data?: MetaAdAccount[] } = await acctResp.json();
    const adAccounts = acctBody.data ?? [];

    // Step 3: check token expiry via debug_token endpoint.
    const dbgResp = await fetch(
      `${META_GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(args.accessToken)}&access_token=${encodeURIComponent(args.accessToken)}`,
    );
    let tokenExpiresAt: number | undefined;
    if (dbgResp.ok) {
      const dbgBody: { data?: { expires_at?: number } } = await dbgResp.json();
      // expires_at is Unix seconds; convert to ms.
      if (dbgBody.data?.expires_at && dbgBody.data.expires_at > 0) {
        tokenExpiresAt = dbgBody.data.expires_at * 1000;
      }
    }

    // Step 4: if the manager picked an ad account, commit the
    // connection. Otherwise just return available accounts.
    if (args.adAccountId) {
      const matched = adAccounts.find(
        (a) => a.id === args.adAccountId || a.account_id === args.adAccountId,
      );
      if (!matched) {
        return { ok: false, error: "Ad account not in your authorized list" };
      }
      const encrypted = encryptApiKey(args.accessToken);
      await ctx.runMutation(internal.metaAdsInternal.storeMetaCredentials, {
        teamId: user.teamId as never,
        encryptedToken: encrypted,
        adAccountId: matched.id,           // "act_XXXXX"
        tokenExpiresAt,
      });

      // Kick off a 90-day backfill in the background so the ROI tab
      // populates without manual CLI intervention. Scheduled (not
      // awaited) — manager gets immediate "Connected" feedback while
      // historical spend rolls in over the next few minutes.
      await ctx.scheduler.runAfter(0, internal.adSpend.backfillMetaSpend, {
        teamId: user.teamId as never,
      });
    }

    return { ok: true, adAccounts, tokenExpiresAt };
  },
});

export const disconnectMetaAds = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const user: { teamId?: string } | null = await ctx.runQuery(
      internal.metaAdsInternal.resolveUserTeam,
      { clerkId: args.clerkId },
    );
    if (!user?.teamId) return { ok: false };
    await ctx.runMutation(internal.metaAdsInternal.clearMetaCredentials, {
      teamId: user.teamId as never,
    });
    return { ok: true };
  },
});
