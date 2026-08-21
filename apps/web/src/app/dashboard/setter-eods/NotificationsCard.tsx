"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Bell, Check, Loader2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// The two Setter EOD notifications, configured where the roster lives:
// the reminder blast (setters' names + personal links, where they look)
// and the missing-report (who hasn't filed, for the manager). Hour and
// days per notification.
// ============================================================================

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function hourLabel(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
}

export function NotificationsCard() {
  const { user } = useUser();
  const clerkId = user?.id;
  const config = useQuery(
    api.setterEodNotifications.getNotificationConfig,
    clerkId ? { clerkId } : "skip",
  );

  if (config === undefined) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </section>
    );
  }
  if (!config) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Notifications</span>
        {!config.channelReady && (
          <span className="ml-auto text-[11px] text-amber-700">
            No Slack/Discord connected yet — schedules save, sending starts
            once a channel is set up.
          </span>
        )}
      </div>
      <NotificationRow
        which="reminder"
        title="Remind setters to file"
        description="Posts every setter's name with their personal link, where your setters look."
        initial={config.reminder}
      />
      <div className="border-t border-border/60" />
      <NotificationRow
        which="missing"
        title="Tell me who hasn't filed"
        description="Names anyone still missing their EOD — and says so when everyone's done."
        initial={config.missing}
      />
    </section>
  );
}

function NotificationRow({
  which,
  title,
  description,
  initial,
}: {
  which: "reminder" | "missing";
  title: string;
  description: string;
  initial: { enabled: boolean; hourLocal: number; days: string[] };
}) {
  const { user } = useUser();
  const save = useMutation(api.setterEodNotifications.setNotificationConfig);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [hour, setHour] = useState(initial.hourLocal);
  const [days, setDays] = useState<string[]>(initial.days);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Server state arriving late (first load) wins over the defaults.
  useEffect(() => {
    setEnabled(initial.enabled);
    setHour(initial.hourLocal);
    setDays(initial.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.enabled, initial.hourLocal, initial.days.join(",")]);

  async function persist(next: {
    enabled?: boolean;
    hourLocal?: number;
    days?: string[];
  }) {
    if (!user) return;
    const payload = {
      clerkId: user.id,
      which,
      enabled: next.enabled ?? enabled,
      hourLocal: next.hourLocal ?? hour,
      days: (next.days ?? days) as any,
    };
    setDirty(true);
    try {
      await save(payload);
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setDirty(false);
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              void persist({ enabled: e.target.checked });
            }}
            className="h-4 w-4 accent-foreground"
          />
          <span className="text-sm font-medium">{title}</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <Check className="h-3 w-3" /> saved
            </span>
          )}
          {dirty && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          <select
            value={hour}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHour(h);
              void persist({ hourLocal: h });
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px] outline-none"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
      <div className="mt-2.5 flex items-center gap-1">
        {DAYS.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              onClick={() => {
                const next = on ? days.filter((x) => x !== d) : [...days, d];
                if (next.length === 0) return; // a schedule with no days is off, not empty
                setDays(next);
                void persist({ days: next });
              }}
              className={
                "rounded-md border px-2 py-1 text-[11px] transition-colors " +
                (on
                  ? "border-foreground font-medium text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
