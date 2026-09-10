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
          ? "Saved. The ladder, drawer and flags use the new threshold now; the cards' connects for past days are being recounted and will settle within a few minutes."
          : r.recount === "queued"
            ? "Saved. A recount from an earlier change is still running; another is queued behind it, so the cards' past days will follow within about ten minutes."
            : "Saved.",
      );
    } catch (err) {
      setStatus(err instanceof ConvexError && typeof err.data === "string" ? err.data : "Couldn't save — try again");
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium" htmlFor="connect-threshold">
        A connect is an answered call lasting at least
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
      <p className="mt-2 text-xs text-muted-foreground">
        Used by the Connects on the cards, the pick-up flags, the ladder&apos;s bold step, the touches that count as &quot;reached&quot;, and the outbound EOD prefill. Changing it recounts the last 14 days in the
        background; live counting picks it up immediately.
      </p>
      {status && <p className="mt-2 text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
