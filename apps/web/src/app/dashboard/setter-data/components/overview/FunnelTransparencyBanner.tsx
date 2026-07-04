"use client";

import { Info } from "lucide-react";

type FlowType = "setter_drives" | "self_book" | "mixed" | "unknown";

interface FunnelTransparencyBannerProps {
  flowType: FlowType;
  flowOverride: "auto" | "setter_drives" | "self_book" | "mixed";
}

/**
 * One-line honesty banner: tells the manager which funnel type we detected
 * and what that means for the metrics on this page. Every funnel is
 * different (VSL self-book, lead-form dial-down, DM setting) — showing the
 * right subset of metrics, labeled, beats showing wrong numbers.
 */
export function FunnelTransparencyBanner({
  flowType,
  flowOverride,
}: FunnelTransparencyBannerProps) {
  // Nothing detected yet and no override — stay quiet rather than announce
  // uncertainty on every page load.
  if (flowType === "unknown") return null;

  const overridden = flowOverride !== "auto";

  const copy: Record<Exclude<FlowType, "unknown">, { label: string; detail: string }> = {
    setter_drives: {
      label: "Setter-driven funnel",
      detail:
        "Your team dials leads and books them in. Set rate measures each setter's owned-lead conversion.",
    },
    self_book: {
      label: "Self-book funnel",
      detail:
        "Prospects schedule themselves, so per-setter set rate is hidden (it would credit setters for bookings they didn't drive). Company booking rate and show rate stay fully accurate.",
    },
    mixed: {
      label: "Mixed funnel",
      detail:
        "Some bookings are setter-driven, some self-booked. Per-setter set rate covers the setter-driven side.",
    },
  };

  const { label, detail } = copy[flowType];

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">
          {label}
          {overridden ? " (set manually)" : " (auto-detected)"}
        </span>{" "}
        — {detail}{" "}
        <span className="text-muted-foreground/80">
          Change this in Settings if it looks wrong.
        </span>
      </span>
    </div>
  );
}
