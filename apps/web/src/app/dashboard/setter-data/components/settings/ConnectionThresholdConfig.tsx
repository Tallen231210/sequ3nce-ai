"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ConnectionThresholdConfigProps {
  thresholdSec: number;
}

const THRESHOLD_OPTIONS = [
  { value: 30, label: "30 seconds" },
  { value: 60, label: "60 seconds (default)" },
  { value: 90, label: "90 seconds" },
  { value: 120, label: "2 minutes" },
  { value: 180, label: "3 minutes" },
];

export function ConnectionThresholdConfig({
  thresholdSec,
}: ConnectionThresholdConfigProps) {
  const updateThreshold = useMutation(
    api.setterDataMutations.updateConnectionThreshold,
  );

  const [value, setValue] = useState<string>(String(thresholdSec));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateThreshold({ thresholdSec: parseInt(value, 10) });
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
          <h3 className="text-base font-semibold">Connection threshold</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Calls lasting at least this long count as a "connection."
            Shorter calls (voicemails, hang-ups) don't bump connection
            metrics.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="threshold">Minimum call duration</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="threshold" className="w-64">
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
          </div>

          <p className="text-xs text-muted-foreground">
            Note: changing this only affects new calls going forward.
            Historical "Connected" status on existing leads is not
            recomputed.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || parseInt(value, 10) === thresholdSec}
            >
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
