"use client";

// Delivery settings for the Manager EOD digest — the same contract as every
// other notification: enable, hour, and the manager picks the Slack channel.

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Bell } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`,
}));

export function ManagerEodSettings() {
  const { user } = useUser();
  const clerkId = user?.id;
  const config = useQuery(
    api.managerEodDigest.getManagerEodConfig,
    clerkId ? { clerkId } : "skip",
  );
  const save = useMutation(api.managerEodDigest.setManagerEodConfig);
  const getSlackChannels = useAction(api.slack.getSlackChannels);

  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(19);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!config || hydrated) return;
    setEnabled(config.enabled);
    setHour(config.hourLocal);
    setChannelId(config.slackChannelId);
    setHydrated(true);
  }, [config, hydrated]);

  useEffect(() => {
    if (!clerkId) return;
    void getSlackChannels({ clerkId }).then((r: any) => {
      if (r && "channels" in r) setChannels(r.channels);
    });
  }, [clerkId, getSlackChannels]);

  async function persist(next: {
    enabled?: boolean;
    hourLocal?: number;
    slackChannelId?: string;
    slackChannelName?: string;
  }) {
    if (!clerkId) return;
    try {
      await save({
        clerkId,
        enabled: next.enabled ?? enabled,
        hourLocal: next.hourLocal ?? hour,
        ...(next.slackChannelId !== undefined
          ? { slackChannelId: next.slackChannelId, slackChannelName: next.slackChannelName }
          : {}),
      });
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  }

  if (!config) return null;

  const pickedName =
    channels.find((c) => c.id === channelId)?.name ?? config.slackChannelName;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Slack delivery
        </span>
        {state === "saved" && <span className="text-[11px] text-emerald-600">saved ✓</span>}
        {state === "error" && <span className="text-[11px] text-rose-600">couldn&apos;t save</span>}
        {!config.channelReady && (
          <span className="ml-auto text-[11px] text-amber-700">
            Connect Slack in Settings first — the schedule saves either way.
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              void persist({ enabled: e.target.checked });
            }}
          />
          Send this report to Slack every evening
        </label>
        <label className="flex items-center gap-1.5">
          at
          <select
            value={hour}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHour(h);
              void persist({ hourLocal: h });
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
          >
            {HOURS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          in
          {channels.length > 0 ? (
            <select
              value={channelId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                const name = channels.find((c) => c.id === id)?.name ?? "";
                setChannelId(id || null);
                if (id) void persist({ slackChannelId: id, slackChannelName: name });
              }}
              className="max-w-52 rounded-md border border-border bg-background px-2 py-1 text-[12px]"
            >
              <option value="" disabled>
                Pick a channel…
              </option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground">
              {pickedName ? `#${pickedName}` : "no channels loaded"}
            </span>
          )}
        </label>
      </div>
    </div>
  );
}
