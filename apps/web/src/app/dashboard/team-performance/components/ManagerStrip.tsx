"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { fmtCurrency, monthLabel } from "../lib/format";
import { MONO } from "@/components/analytics/primitives/typography";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Provenance badge. MGR = a manager typed this. F = we derived it.
 *
 * From Gianni's mockup, and worth keeping: on a board that mixes entered
 * targets with measured results, "who decided this number" is the first
 * question anyone asks of a figure they disagree with.
 */
function Badge({ kind }: { kind: "MGR" | "F" }) {
  return (
    <span
      title={
        kind === "MGR"
          ? "Set by a manager"
          : "Calculated — not editable"
      }
      className={
        "rounded border px-1 py-px text-[9px] font-semibold tracking-wide " +
        (kind === "MGR"
          ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
          : "border-border text-muted-foreground")
      }
    >
      {kind}
    </span>
  );
}

/** Inline editable figure — dashed underline signals "you can change this". */
function EditableStat({
  label,
  value,
  prefix,
  suffix,
  disabled,
  onSave,
}: {
  label: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  disabled: boolean;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="min-w-0 flex-1 px-5 py-4">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <Badge kind="MGR" />
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        {prefix && <span className="text-xl font-semibold">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          disabled={disabled}
          value={draft ?? (value === null ? "" : String(value))}
          placeholder="—"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            setDraft(null);
            const raw = e.target.value.trim();
            const next = raw === "" ? null : Number(raw);
            if (next !== null && !Number.isFinite(next)) return;
            if (next !== value) onSave(next);
          }}
          className={`w-full min-w-0 border-b border-dashed border-muted-foreground/40 bg-transparent text-xl font-semibold tracking-tight ${MONO} outline-none transition-colors focus:border-foreground disabled:cursor-default disabled:border-transparent`}
        />
        {suffix && (
          <span className="text-xl font-semibold text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/** A derived figure, with the arithmetic stated underneath. */
function ComputedStat({
  label,
  value,
  formula,
  tone,
}: {
  label: string;
  value: string;
  formula: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="min-w-0 flex-1 px-5 py-4">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <Badge kind="F" />
      </div>
      <div
        className={
          "mt-1.5 text-xl font-semibold " + MONO + " " +
          (tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "negative"
              ? "text-rose-600 dark:text-rose-400"
              : "")
        }
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {formula}
      </div>
    </div>
  );
}

/**
 * The manager band at the top of the board: what a manager SETS, next to what
 * those settings produce.
 *
 * Editable here as well as in Settings on purpose — targets and ad spend get
 * revised while looking at results, and making someone leave the page to do it
 * is how they end up never being revised at all.
 */
export function ManagerStrip({
  monthKey,
  teamCash,
  booked,
  isCurrentMonth,
}: {
  monthKey: string;
  teamCash: number;
  booked: number;
  isCurrentMonth: boolean;
}) {
  const { user } = useUser();
  const config = useQuery(
    api.closerPerformanceConfig.getConfig,
    user ? { clerkId: user.id } : "skip",
  );
  const update = useMutation(api.closerPerformanceConfig.updateConfig);
  const [error, setError] = useState<string | null>(null);

  if (!config) return null;
  const disabled = !config.canEdit;

  const save = (patch: any) => {
    setError(null);
    void update({ clerkId: user!.id, ...patch }).catch((e) =>
      setError(e instanceof Error ? e.message : "Could not save"),
    );
  };

  const adSpend = config.adSpendMonthly ?? 0;
  const compPct = config.compPct ?? 0;
  // Only quote cost-per-booked once both sides are real; ad spend ÷ 0 bookings
  // is not a number a manager should be shown.
  const costPerBooked = adSpend > 0 && booked > 0 ? adSpend / booked : null;
  const teamNet = teamCash - adSpend - teamCash * (compPct / 100);
  const roas = adSpend > 0 ? teamCash / adSpend : null;

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Targets */}
      <div className="flex flex-wrap divide-border overflow-hidden rounded-xl border border-border bg-card sm:flex-nowrap sm:divide-x">
        <EditableStat
          label="Booked% target"
          value={config.targets.bookedPct}
          suffix="%"
          disabled={disabled}
          onSave={(v) => v !== null && save({ bookedPctTarget: v })}
        />
        <EditableStat
          label="Show% target"
          value={config.targets.showPct}
          suffix="%"
          disabled={disabled}
          onSave={(v) => v !== null && save({ showPctTarget: v })}
        />
        <EditableStat
          label="Offer→Cls target"
          value={config.targets.offerClosePct}
          suffix="%"
          disabled={disabled}
          onSave={(v) => v !== null && save({ offerClosePctTarget: v })}
        />
        <EditableStat
          label="Close% target"
          value={config.targets.closePct}
          suffix="%"
          disabled={disabled}
          onSave={(v) => v !== null && save({ closePctTarget: v })}
        />
      </div>

      {/* Economics: what the manager sets, then what it produces */}
      <div className="flex flex-wrap divide-border overflow-hidden rounded-xl border border-border bg-card sm:flex-nowrap sm:divide-x">
        <EditableStat
          label="Ad spend / mo"
          value={config.adSpendMonthly}
          prefix="$"
          disabled={disabled}
          onSave={(v) => save({ adSpendMonthly: v })}
        />
        <EditableStat
          label="Rep comp %"
          value={config.compPct}
          suffix="%"
          disabled={disabled}
          onSave={(v) => v !== null && save({ compPct: v })}
        />
        <ComputedStat
          label="Team cash"
          value={fmtCurrency(teamCash)}
          formula={`${monthLabel(monthKey)}${isCurrentMonth ? " (MTD)" : ""}`}
        />
        <ComputedStat
          label="Cost / booked"
          value={costPerBooked === null ? "—" : fmtCurrency(costPerBooked)}
          formula="ad spend ÷ booked"
        />
        <ComputedStat
          label="ROAS"
          value={roas === null ? "—" : `${roas.toFixed(1)}x`}
          formula="cash ÷ ad spend"
          tone={roas === null ? undefined : roas >= 1 ? "positive" : "negative"}
        />
        <ComputedStat
          label="Team net"
          value={`${teamNet >= 0 ? "+" : ""}${fmtCurrency(teamNet)}`}
          formula="cash − ads − comp"
          tone={teamNet >= 0 ? "positive" : "negative"}
        />
      </div>
    </div>
  );
}
