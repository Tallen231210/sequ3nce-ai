"use client";

// Zion-editable scorecard settings, inline above the ledger (the reference
// HTML's header inputs). Save-on-blur sparse patch — the TargetsSettings
// Field idiom: empty clears back to unset.

import React, { useEffect, useState } from "react";

function Field({
  label,
  value,
  onSave,
  width = 90,
}: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => void;
  width?: number;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);
  return (
    <label style={{ display: "grid", gap: 2, fontSize: 11, color: "var(--mute)" }}>
      {label}
      <input
        type="number"
        value={draft}
        placeholder="—"
        style={{
          width,
          border: "1px solid var(--rule)",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 13,
          fontFamily: "inherit",
          color: "var(--ink)",
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const t = draft.trim();
          if (t === "") {
            if (value !== null) onSave(null);
            return;
          }
          const n = Number(t.replace(/[$,\s]/g, ""));
          if (Number.isFinite(n) && n !== value) onSave(n);
        }}
      />
    </label>
  );
}

export interface ScorecardSettings {
  tierPrices: number[] | null;
  costPerBookedCall: number | null;
  targetCdpbc: number | null;
}

export function SettingsRow({
  settings,
  state,
  onSave,
}: {
  settings: ScorecardSettings;
  state: "idle" | "saved" | "error";
  onSave: (patch: {
    tierPrices?: number[] | null;
    costPerBookedCall?: number | null;
    targetCdpbc?: number | null;
  }) => void;
}) {
  const prices = settings.tierPrices ?? [];

  const saveTier = (i: number, v: number | null) => {
    // Clearing a tier truncates from that position — positions are identity
    // (tier2Pitched always means "the second price"), so removing the middle
    // must never shift a later price into an earlier slot and silently
    // relabel everyone's historical counts.
    let next: number[];
    if (v === null) next = prices.slice(0, i);
    else {
      next = [...prices];
      next[i] = v;
      // Filling tier 2 while tier 1 is empty would build a sparse array the
      // validator rejects with an opaque error — compact instead; the value
      // visibly lands in the first open slot on re-render.
      next = next.filter((n) => typeof n === "number" && Number.isFinite(n));
    }
    onSave({ tierPrices: next.length ? next : null });
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: 12,
        padding: "10px 12px",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        background: "var(--stripe)",
        marginBottom: 16,
      }}
    >
      {[0, 1, 2].map((i) => (
        <Field
          key={i}
          label={`Tier ${i + 1} price`}
          value={prices[i] ?? null}
          onSave={(v) => saveTier(i, v)}
        />
      ))}
      <Field
        label="Cost per booked call"
        value={settings.costPerBookedCall}
        onSave={(v) => onSave({ costPerBookedCall: v })}
      />
      <Field
        label="Target CDPBC"
        value={settings.targetCdpbc}
        onSave={(v) => onSave({ targetCdpbc: v })}
      />
      <span style={{ fontSize: 11, color: state === "error" ? "var(--red)" : "var(--green)", paddingBottom: 6 }}>
        {state === "saved" ? "saved ✓" : state === "error" ? "couldn't save" : ""}
      </span>
    </div>
  );
}
