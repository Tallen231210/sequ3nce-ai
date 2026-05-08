"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";

interface DispositionSyncConfigProps {
  /** Current state of the toggle from getMySettings. */
  enabled: boolean;
  /** Whether a Marketplace App is currently installed. Drives the
   *  warning when the toggle is on but no install exists. */
  hasInstallation: boolean;
}

/**
 * Phase 3c — Disposition Sync routing toggle. The "are you ready to
 * graduate from the legacy API-key flow to OAuth?" switch.
 *
 * Off by default. Flipping on routes future post-call disposition syncs
 * through the new OAuth flow IF a Marketplace App is installed; if no
 * install exists, the action surfaces a clear error so the manager
 * knows they still need to install.
 */
export function DispositionSyncConfig({
  enabled: initialEnabled,
  hasInstallation,
}: DispositionSyncConfigProps) {
  const updateConfig = useMutation(
    api.setterDataMutations.updateDispositionSyncConfig,
  );

  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateConfig({ enabled });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const dirty = enabled !== initialEnabled;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Disposition Sync</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Push closer post-call data (outcome, lead quality, deal
              value, summary, tags) into GoHighLevel after each call so
              your CRM stays in sync without manual entry.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            Phase 3
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              id="disposition-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="disposition-enabled" className="cursor-pointer">
              Sync dispositions to GoHighLevel after each call
            </Label>
          </div>

          {enabled && !hasInstallation && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/20">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="text-xs">
                <span className="font-medium">
                  No GoHighLevel connection.
                </span>{" "}
                Install the Marketplace App from the connection card above
                first — disposition sync requires an active OAuth install
                to push data.
              </div>
            </div>
          )}

          {enabled && hasInstallation && (
            <p className="text-xs text-muted-foreground">
              Each completed call will push:{" "}
              <code className="font-mono">outcome</code>,{" "}
              <code className="font-mono">lead_quality</code>,{" "}
              <code className="font-mono">deal_value</code>,{" "}
              <code className="font-mono">objection</code>,{" "}
              <code className="font-mono">summary</code>, and outcome-based
              tags onto the matched contact via the OAuth connection above.
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving || !dirty}>
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
