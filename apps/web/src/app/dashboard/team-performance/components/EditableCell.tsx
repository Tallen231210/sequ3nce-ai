"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { fmtCurrency, fmtNum } from "../lib/format";
import { MONO } from "@/components/analytics/primitives/typography";

/**
 * One number in the daily grid. Shows the measured value until a manager
 * corrects it, then shows the correction with the measured value kept visible
 * underneath — the manager always knows what Sequ3nce actually recorded and
 * what they overrode it with.
 */
export function EditableCell({
 measured,
  reported,
  override,
  field,
  editable,
  onCommit,
}: {
  measured: number;
  /** What the closer submitted, if anything. */
  reported?: number;
  override: number | undefined;
  field: string;
  editable: boolean;
  onCommit: (value: number | null) => Promise<void>;
}) {
  const isCash = field === "cash" || field === "contractValue";
 // manager override > closer entry > measured, same order as the board.
  const effective = override ?? reported ?? measured;
  const source: "manager" | "closer" | "measured" =
 override !== undefined ? "manager" : reported !== undefined ? "closer" : "measured";
 // Only flag a difference from what the closer said — a manager confirming
  // the same number isn't a correction worth marking.
  const base = reported ?? measured;
  const diverges = source !== "measured" && effective !== base;

 const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const display = isCash ? fmtCurrency(effective) : fmtNum(effective);

  async function commit(raw: string) {
    const trimmed = raw.trim();
    // Emptying the box means "go back to what you measured", not "zero".
 if (trimmed === "") {
 await save(null);
      return;
    }
    const parsed = Number(trimmed.replace(/[$,\s]/g, ""));
 if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Enter a positive number");
 return;
    }
    if (!isCash && !Number.isInteger(parsed)) {
      setError("Whole numbers only");
 return;
    }
    // Typing the underlying value back in is a revert, not a correction.
    await save(parsed === base ? null : parsed);
  }

  async function save(value: number | null) {
    setSaving(true);
    setError(null);
    try {
      await onCommit(value);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
 } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return (
      <span className={MONO + " " + (diverges ? "font-semibold" : "")}>
 {display}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="relative">
 <input
          ref={inputRef}
          defaultValue={String(effective)}
          onBlur={(e) => void commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit(e.currentTarget.value);
 if (e.key === "Escape") {
 setEditing(false);
              setError(null);
            }
          }}
          disabled={saving}
          className={`w-20 rounded border border-foreground bg-background px-1.5 py-0.5 text-right text-sm ${MONO} outline-none disabled:opacity-60`}
          aria-label={`Edit ${field}`}
        />
        {saving && (
          <Loader2 className="absolute -right-5 top-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
 )}
        {error && (
          <div className="absolute right-0 top-full z-10 mt-1 w-max max-w-[200px] rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 shadow-sm">
 {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <span className="group/cell inline-flex items-center gap-1">
 <button
        type="button"
 onClick={() => setEditing(true)}
        title={
          source === "manager"
 ? `You corrected this. Closer reported ${
                reported === undefined
                  ? "nothing"
 : isCash ? fmtCurrency(reported) : fmtNum(reported)
              }; we recorded ${isCash ? fmtCurrency(measured) : fmtNum(measured)}.`
            : source === "closer"
 ? `Reported by the closer. We recorded ${
                  isCash ? fmtCurrency(measured) : fmtNum(measured)
                }.`
              : "Not reported — this is what we recorded. Click to enter a value."
 }
        className={
          "rounded px-1 py-0.5 " + MONO + " transition-colors hover:bg-muted " +
 (source === "manager"
 ? "font-semibold text-amber-700 underline decoration-amber-500/60 decoration-dotted underline-offset-2"
 : source === "closer"
 ? "font-medium"
 : "text-muted-foreground")
 }
      >
        {display}
      </button>

      {diverges && (
        <button
          type="button"
 onClick={() => void save(null)}
          title={`Remove your correction and go back to ${
            isCash ? fmtCurrency(base) : fmtNum(base)
          }`}
          className="opacity-0 transition-opacity group-hover/cell:opacity-100"
 >
          <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </span>
  );
}
