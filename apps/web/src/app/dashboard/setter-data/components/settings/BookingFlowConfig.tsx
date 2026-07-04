"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { GitBranch, Loader2 } from "lucide-react";

type FlowOverride = "auto" | "setter_drives" | "self_book" | "mixed";

interface BookingFlowConfigProps {
  bookingFlow: {
    detected: "setter_drives" | "self_book" | "mixed" | "unknown";
    detectedAt?: number;
    override: FlowOverride;
  };
}

const FLOW_LABELS: Record<string, string> = {
  setter_drives: "Setter-driven (setters dial, then book)",
  self_book: "Self-book (prospects schedule themselves)",
  mixed: "Mixed",
  unknown: "Not enough data yet",
};

/**
 * Booking-flow type config. We auto-detect whether bookings are
 * setter-driven or prospect-self-booked (it changes which set-rate metrics
 * are valid); this card shows the detection and lets a manager override it.
 */
export function BookingFlowConfig({ bookingFlow }: BookingFlowConfigProps) {
  const { clerkId } = useTeam();
  const setOverride = useMutation(api.setterDataMutations.setBookingFlowOverride);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<FlowOverride>(bookingFlow.override);

  async function handleChange(next: FlowOverride) {
    if (!clerkId) return;
    setValue(next);
    setSaving(true);
    try {
      await setOverride({ clerkId, override: next });
    } catch (err) {
      console.error(err);
      setValue(bookingFlow.override); // revert on failure
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Booking Flow</h3>
          {saving && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          How meetings get booked in your funnel. This decides which set-rate
          metrics we show — per-setter set rate is hidden for self-book
          funnels, where crediting setters for bookings would be misleading.
        </p>

        <div className="mt-4 space-y-1 text-sm">
          <div>
            <span className="font-medium">Auto-detected:</span>{" "}
            <span className="text-muted-foreground">
              {FLOW_LABELS[bookingFlow.detected]}
              {bookingFlow.detectedAt
                ? ` (as of ${new Date(bookingFlow.detectedAt).toLocaleDateString()})`
                : ""}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">Override</label>
          <select
            className="mt-1.5 block w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={value}
            disabled={saving}
            onChange={(e) => handleChange(e.target.value as FlowOverride)}
          >
            <option value="auto">Automatic (use detection)</option>
            <option value="setter_drives">Setter-driven</option>
            <option value="self_book">Self-book</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
