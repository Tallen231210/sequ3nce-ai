"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PlaybookConfigProps {
  config: {
    cadenceDefault: string;            // "A" or "B"
    dialsPerDayTarget: number;
    contactsPerDayTarget: number;
    setRateTarget: number;
    typicalDealValue: number | null;
  };
}

/**
 * Setter Scorecard playbook overlay — team-level config for the targets
 * that drive the per-setter scorecard's status flags + dollar leakage.
 *
 * Per-offer overlay (multi-offer customers) is deferred to Phase 4. For
 * now, one team = one config.
 */
export function PlaybookConfig({ config }: PlaybookConfigProps) {
  const { clerkId } = useTeam();
  const update = useMutation(api.setterScorecardConfig.updateScorecardConfig);

  const [cadence, setCadence] = useState<"A" | "B">(
    config.cadenceDefault === "B" ? "B" : "A",
  );
  const [dialsTarget, setDialsTarget] = useState(config.dialsPerDayTarget);
  const [contactsTarget, setContactsTarget] = useState(
    config.contactsPerDayTarget,
  );
  const [setRate, setSetRate] = useState(config.setRateTarget);
  const [typicalDeal, setTypicalDeal] = useState<string>(
    config.typicalDealValue != null ? String(config.typicalDealValue) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auto-derive contacts-per-day from cadence + dials when cadence flips.
  useEffect(() => {
    const derived = cadence === "B" ? 25 : 12.5;
    if (contactsTarget !== derived) setContactsTarget(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadence]);

  async function save() {
    if (!clerkId) return;
    setSaving(true);
    setSaved(false);
    try {
      await update({
        clerkId,
        cadenceDefault: cadence,
        dialsPerDayTarget: dialsTarget,
        contactsPerDayTarget: contactsTarget,
        setRateTarget: setRate,
        typicalDealValue: typicalDeal ? Number(typicalDeal) : undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold">Setter Scorecard targets</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Playbook overlay — drives the per-setter targets shown on the
            Scorecard tab.
          </p>
        </div>

        {/* Cadence selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">
            Default cadence
          </label>
          <div className="flex gap-2">
            <CadenceOption
              id="A"
              label="Cadence A — B2C / impulse"
              hint="12 dials over 4 days · 12.5 contacts/day"
              selected={cadence === "A"}
              onClick={() => setCadence("A")}
            />
            <CadenceOption
              id="B"
              label="Cadence B — B2B / executive"
              hint="5-6 dials over 4 days · 25 contacts/day"
              selected={cadence === "B"}
              onClick={() => setCadence("B")}
            />
          </div>
        </div>

        {/* Per-day targets */}
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            label="Dials per day target"
            value={dialsTarget}
            onChange={setDialsTarget}
            hint="Playbook baseline: 150"
            min={50}
            max={400}
          />
          <NumberInput
            label="Contacts per day target"
            value={contactsTarget}
            onChange={setContactsTarget}
            hint="Auto-derived from cadence"
            step={0.5}
            min={1}
            max={50}
          />
        </div>

        <NumberInput
          label="Set rate target (%)"
          value={setRate}
          onChange={setSetRate}
          hint="Sets booked ÷ qualified contacts"
          min={0}
          max={100}
        />

        {/* Typical deal value override */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Typical deal value ($) — leakage anchor
          </label>
          <input
            type="number"
            value={typicalDeal}
            onChange={(e) => setTypicalDeal(e.target.value)}
            placeholder="leave blank to use computed average"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            If your closers don&apos;t always record cashCollected /
            contractValue accurately, set your typical deal value here.
            Used as the dollar multiplier on scorecard leakage estimates.
            Always uses the larger of (computed avg, this value).
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            {saved ? "Saved ✓" : "Changes apply to the Scorecard tab immediately."}
          </span>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CadenceOption({
  label,
  hint,
  selected,
  onClick,
}: {
  id: string;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={
        "flex-1 rounded-md border p-3 text-left transition-colors " +
        (selected
          ? "border-foreground bg-foreground/[0.03]"
          : "border-border hover:border-foreground/40")
      }
    >
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  hint,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        min={min}
        max={max}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
