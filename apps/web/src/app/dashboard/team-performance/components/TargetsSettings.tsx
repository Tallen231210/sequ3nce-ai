"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Info, Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { fmtCurrency, monthLabel } from "../lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A field that saves on blur, not on every keystroke.
 *
 * Empty means "not set" and is sent as null, so a manager can clear a value
 * rather than being forced to type a zero that the board would then treat as
 * a real target.
 */
function Field({
  label,
  hint,
  value,
  suffix,
  disabled,
  placeholder,
  onSave,
}: {
  label: string;
  hint?: string;
  value: number | null;
  suffix?: string;
  disabled?: boolean;
  placeholder?: string;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : String(value));

  return (
    <div>
      <label className="text-xs font-medium">{label}</label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          disabled={disabled}
          value={shown}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            setDraft(null);
            const raw = e.target.value.trim();
            const next = raw === "" ? null : Number(raw);
            if (next !== null && !Number.isFinite(next)) return;
            if (next !== value) onSave(next);
          }}
          className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:border-foreground disabled:opacity-60"
        />
        {suffix && (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TargetsSettings() {
  const { user } = useUser();
  const data = useQuery(
    api.closerPerformanceConfig.getConfig,
    user ? { clerkId: user.id } : "skip",
  );
  const update = useMutation(api.closerPerformanceConfig.updateConfig);
  const setGoal = useMutation(api.closerPerformanceConfig.setCloserGoal);

  const [error, setError] = useState<string | null>(null);
  const [prizeDraft, setPrizeDraft] = useState<Record<string, string> | null>(
    null,
  );

  if (data === undefined) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const disabled = !data.canEdit;

  const save = (patch: any) => {
    setError(null);
    void update({ clerkId: user!.id, ...patch }).catch((e) =>
      setError(e instanceof Error ? e.message : "Could not save"),
    );
  };

  const saveGoal = (closerId: string, cashGoal: number | null) => {
    setError(null);
    void setGoal({ clerkId: user!.id, closerId: closerId as never, cashGoal }).catch(
      (e) => setError(e instanceof Error ? e.message : "Could not save"),
    );
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* One home per setting. Targets and economics are edited on the board
          itself, beside the results they govern — but say so here, because
          Settings is where someone will look for them first. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Rate targets, monthly ad spend and rep commission are edited directly
          on the <span className="font-medium text-foreground">Team</span> tab,
          in the strip above the funnel — so they can be adjusted against the
          numbers they govern rather than from memory.
        </p>
      </div>

      {/* Goals */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold">
              Cash goals — {monthLabel(data.monthKey, true)}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Per closer. Stored per month, so changing next month&apos;s goal
              never rewrites what this month was measured against.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            Team total {fmtCurrency(data.sumRepGoals)}
          </span>
        </div>
        <div className="divide-y divide-border">
          {data.closers.map((c: any) => (
            <div
              key={c.closerId}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <span className="text-sm font-medium">{c.name}</span>
              <Field
                label=""
                value={c.cashGoal}
                placeholder="no goal"
                disabled={disabled}
                onSave={(v) => saveGoal(c.closerId, v)}
              />
            </div>
          ))}
          {data.closers.length === 0 && (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              No active closers on this team.
            </p>
          )}
        </div>
        <div className="border-t border-border px-5 py-4">
          <Field
            label="Team goal override"
            hint="Optional. Defaults to the sum of the goals above."
            value={data.teamCashGoalOverride}
            placeholder={String(data.sumRepGoals || "")}
            disabled={disabled}
            onSave={(v) => save({ teamCashGoalOverride: v })}
          />
        </div>
      </div>

      {/* Prize */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold">Team prize</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Optional. The prize card only appears once a name and target are
            set.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-5 px-5 py-4">
          <div>
            <label className="text-xs font-medium">Emoji</label>
            <input
              type="text"
              disabled={disabled}
              value={prizeDraft?.emoji ?? data.prize.emoji ?? ""}
              onChange={(e) =>
                setPrizeDraft({ ...(prizeDraft ?? {}), emoji: e.target.value })
              }
              onBlur={(e) => {
                setPrizeDraft(null);
                if (e.target.value !== (data.prize.emoji ?? "")) {
                  save({ prizeEmoji: e.target.value || null });
                }
              }}
              placeholder="🏝️"
              className="mt-1.5 w-16 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground disabled:opacity-60"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-xs font-medium">Prize</label>
            <input
              type="text"
              disabled={disabled}
              value={prizeDraft?.name ?? data.prize.name ?? ""}
              onChange={(e) =>
                setPrizeDraft({ ...(prizeDraft ?? {}), name: e.target.value })
              }
              onBlur={(e) => {
                setPrizeDraft(null);
                if (e.target.value !== (data.prize.name ?? "")) {
                  save({ prizeName: e.target.value || null });
                }
              }}
              placeholder="Cabo team trip"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground disabled:opacity-60"
            />
          </div>
          <Field
            label="Unlocks at"
            value={data.prize.target}
            placeholder="not set"
            disabled={disabled}
            onSave={(v) => save({ prizeTarget: v })}
          />
        </div>
      </div>

      {!data.canEdit && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Only managers can change these settings.
          </p>
        </div>
      )}
    </div>
  );
}
