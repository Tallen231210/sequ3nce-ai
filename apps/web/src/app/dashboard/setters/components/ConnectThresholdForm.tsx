"use client";

// The connect threshold, set from the Setters page. Saving moves the ladder,
// the drawer and the flags at once and kicks a recount so the cards' past
// days follow — the honest version of the old tab's control.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";

const OPTIONS = [
  { value: 30, label: "30 seconds" },
  { value: 45, label: "45 seconds" },
  { value: 60, label: "60 seconds (default)" },
  { value: 90, label: "90 seconds" },
  { value: 120, label: "2 minutes" },
  { value: 180, label: "3 minutes" },
];

export function ConnectThresholdForm({ clerkId }: { clerkId: string }) {
  const config = useQuery(api.settersPageConfig.getConfig, { clerkId });
  const save = useMutation(api.settersPageConfig.setConnectThreshold);
  const [value, setValue] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (config && value === null) setValue(config.connectSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  if (!config || value === null) return null;
  const options = OPTIONS.some((o) => o.value === value) ? OPTIONS : [...OPTIONS, { value, label: `${value} seconds` }].sort((a, b) => a.value - b.value);

  const submit = async () => {
    try {
      const r = await save({ clerkId, thresholdSec: value });
      setStatus(
        r.recount === "started"
          ? "Saved. Today's numbers already use it; the last two weeks are being counted again and will catch up within a few minutes."
          : r.recount === "queued"
            ? "Saved. An earlier change is still being counted, so the last two weeks will catch up within about ten minutes."
            : "Saved.",
      );
    } catch (err) {
      setStatus(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Couldn't save — try again");
    }
  };

  return (
    <div className="mt-2">
      <label className="sr-only" htmlFor="connect-threshold">
        A pick-up is an answered call lasting at least
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">At least</span>
        <select
          id="connect-threshold"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={submit} disabled={value === config.connectSec} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:border-foreground/40 disabled:opacity-50">
          Save
        </button>
      </div>
      {status && <p className="mt-2 text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
