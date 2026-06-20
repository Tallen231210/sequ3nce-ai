"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";

interface MetaAccount {
  id: string;
  account_id: string;
  name?: string;
  currency?: string;
  amount_spent?: string;
}

interface MetaAdsState {
  connected: boolean;
  adAccountId: string | null;
  connectedAt: number | null;
  tokenExpiresAt: number | null;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
}

/**
 * Meta Ads connection card — Phase 1 setup UI.
 *
 * Two-step:
 *   1. Paste a User Access Token from Graph API Explorer → we validate
 *      it and surface available ad accounts.
 *   2. Pick an ad account → token + account get encrypt-stored and the
 *      ROI tab starts populating.
 *
 * Token expires every 60 days (Meta default for long-lived tokens).
 * We surface metaAdsTokenExpiresAt as a warning when within 7 days of
 * expiry.
 */
export function MetaAdsConfig({ metaAds }: { metaAds: MetaAdsState }) {
  const { clerkId } = useTeam();
  const validateAndStore = useAction(
    api.metaAdsConfig.validateAndStoreMetaToken,
  );
  const disconnect = useAction(api.metaAdsConfig.disconnectMetaAds);

  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [tokenExpiresAtLocal, setTokenExpiresAtLocal] = useState<number | null>(
    null,
  );
  const [refreshMode, setRefreshMode] = useState(false);

  const isConnected = metaAds.connected;
  const tokenExpiresAt = tokenExpiresAtLocal ?? metaAds.tokenExpiresAt;
  const expiresInDays =
    tokenExpiresAt != null
      ? Math.round((tokenExpiresAt - Date.now()) / 86_400_000)
      : null;
  const expiringSoon = expiresInDays !== null && expiresInDays <= 7;

  async function validate() {
    if (!clerkId || !token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await validateAndStore({
        clerkId,
        accessToken: token.trim(),
      });
      if (!result.ok) {
        setError(result.error ?? "Validation failed");
        setAccounts([]);
      } else {
        setAccounts(result.adAccounts ?? []);
        if (result.tokenExpiresAt) setTokenExpiresAtLocal(result.tokenExpiresAt);
        if ((result.adAccounts ?? []).length === 0) {
          setError("No ad accounts found for this token. Make sure ads_read permission is enabled.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function connectSelected() {
    if (!clerkId || !selectedAccount || !token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await validateAndStore({
        clerkId,
        accessToken: token.trim(),
        adAccountId: selectedAccount,
      });
      if (!result.ok) {
        setError(result.error ?? "Connection failed");
      } else {
        // Reset form
        setToken("");
        setAccounts([]);
        setSelectedAccount("");
        setRefreshMode(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!clerkId) return;
    setLoading(true);
    try {
      await disconnect({ clerkId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Meta Ads (Facebook + Instagram)
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
            )}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pulls daily ad spend for the Closer ROI dashboard. Spend is joined
            to Hyros&apos;s ad-source IDs to attribute closer-by-closer ROI.
          </p>
        </div>

        {(!isConnected || refreshMode) && accounts.length === 0 && (
          <>
            <div className="rounded-md bg-muted/30 p-3 space-y-2 text-xs">
              <h4 className="font-semibold">Quick setup</h4>
              <ol className="text-muted-foreground space-y-1 list-decimal pl-4">
                <li>
                  Go to{" "}
                  <a
                    href="https://developers.facebook.com/tools/explorer"
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-foreground"
                  >
                    Graph API Explorer{" "}
                    <ExternalLink className="inline h-3 w-3" />
                  </a>
                </li>
                <li>
                  Click <strong>Get Token → Get User Access Token</strong>
                </li>
                <li>
                  Under <strong>Permissions</strong>, add{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                    ads_read
                  </code>
                </li>
                <li>
                  Click <strong>Generate Access Token</strong> → copy
                </li>
                <li>Paste below</li>
              </ol>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">
                User Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAB..."
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-foreground/10"
              />
              <Button
                size="sm"
                onClick={validate}
                disabled={loading || !token.trim()}
              >
                {loading ? "Validating…" : "Validate & list ad accounts"}
              </Button>
            </div>
          </>
        )}

        {accounts.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium">
              Choose ad account to track
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
            >
              <option value="">— pick one —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.account_id} ({a.currency ?? "USD"})
                  {a.amount_spent ? ` · spent ${a.amount_spent}` : ""}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={connectSelected}
                disabled={loading || !selectedAccount}
              >
                {loading ? "Connecting…" : "Connect"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAccounts([]);
                  setToken("");
                  setSelectedAccount("");
                }}
              >
                Start over
              </Button>
            </div>
            {tokenExpiresAt && (
              <p className="text-[11px] text-muted-foreground">
                Token expires{" "}
                {new Date(tokenExpiresAt).toLocaleDateString()}. We&apos;ll
                prompt you to refresh ~7 days before.
              </p>
            )}
          </div>
        )}

        {isConnected && !refreshMode && accounts.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Ad account: </span>
                <code className="text-foreground font-mono">
                  {metaAds.adAccountId}
                </code>
              </div>
              {metaAds.lastSyncedAt && (
                <div>
                  <span className="text-muted-foreground">Last sync: </span>
                  <span className="text-foreground">
                    {new Date(metaAds.lastSyncedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {expiresInDays !== null && (
                <div
                  className={
                    expiringSoon
                      ? "text-amber-700 dark:text-amber-400 font-medium"
                      : "text-muted-foreground"
                  }
                >
                  Token expires in {expiresInDays} day
                  {expiresInDays === 1 ? "" : "s"}
                  {expiringSoon && " — re-paste a fresh token below"}
                </div>
              )}
              {metaAds.lastSyncError && (
                <div className="text-destructive">
                  Last sync error: {metaAds.lastSyncError}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisconnect}
                disabled={loading}
              >
                Disconnect
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRefreshMode(true)}
                disabled={loading}
              >
                Refresh token
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
