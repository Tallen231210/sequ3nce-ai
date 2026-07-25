"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { fmtCurrency, fmtNum } from "../lib/format";

/**
 * One number in the daily grid. Shows the measured value until a manager
 * corrects it, then shows the correction with the measured value kept visible
 * underneath — the manager always knows what Sequ3nce actually recorded and
 * what they overrode it with.
 */
export function EditableCell({
  measured,
  override,
  field,
  editable,
  onCommit,
}: {
  measured: number;
  override: number | undefined;
  field: string;
  editable: boolean;
  onCommit: (value: number | null) => Promise<void>;
}) {
  const isCash = field === "cash";
  const effective = override ?? measured;
  const edited = override !== undefined;
  const diverges = edited && override !== measured;

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
    // Typing the measured value back in is a revert, not an override.
    await save(parsed === measured ? null : parsed);
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
      <span className={"tabular-nums " + (diverges ? "font-semibold" : "")}>
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
          className="w-20 rounded border border-foreground bg-background px-1.5 py-0.5 text-right text-sm tabular-nums outline-none disabled:opacity-60"
          aria-label={`Edit ${field}`}
        />
        {saving && (
          <Loader2 className="absolute -right-5 top-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {error && (
          <div className="absolute right-0 top-full z-10 mt-1 w-max max-w-[200px] rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 shadow-sm dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
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
          diverges
            ? `Manually entered. Sequ3nce recorded ${
                isCash ? fmtCurrency(measured) : fmtNum(measured)
              }.`
            : "Click to edit"
        }
        className={
          "rounded px-1 py-0.5 tabular-nums transition-colors hover:bg-muted " +
          (diverges
            ? "font-semibold text-amber-700 underline decoration-amber-500/60 decoration-dotted underline-offset-2 dark:text-amber-400"
            : "")
        }
      >
        {display}
      </button>

      {diverges && (
        <button
          type="button"
          onClick={() => void save(null)}
          title={`Reset to ${isCash ? fmtCurrency(measured) : fmtNum(measured)} (what Sequ3nce recorded)`}
          className="opacity-0 transition-opacity group-hover/cell:opacity-100"
        >
          <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </span>
  );
}
