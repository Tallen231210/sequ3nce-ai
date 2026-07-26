"use client";

import { useState } from "react";
import { CapacitySettings } from "./CapacitySettings";
import { ScorecardSettings } from "./ScorecardSettings";
import { TargetsSettings } from "./TargetsSettings";

const SECTIONS = [
 ["targets", "Goals & prize"],
 ["availability", "Availability"],
 ["post", "Daily post"],
] as const;

type Section = (typeof SECTIONS)[number][0];

/**
 * All configuration behind one tab.
 *
 * Three separate top-level tabs for settings crowded out the three tabs people
 * actually use daily, and none of them was discoverable — the Economics card
 * pointed managers at "settings" that didn't exist anywhere.
 */
export function SettingsTab() {
 const [section, setSection] = useState<Section>("targets");

 return (
    <div className="space-y-5">
 <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-1">
 {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
 onClick={() => setSection(id)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
 (section === id
                ? "bg-foreground text-background"
 : "text-muted-foreground hover:bg-muted hover:text-foreground")
 }
          >
            {label}
          </button>
        ))}
      </div>

      {section === "targets" && <TargetsSettings />}
 {section === "availability" && <CapacitySettings />}
 {section === "post" && <ScorecardSettings />}
    </div>
  );
}
