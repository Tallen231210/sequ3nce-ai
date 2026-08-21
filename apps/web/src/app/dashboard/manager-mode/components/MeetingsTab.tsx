"use client";

import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, Video, Zap } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Paste a link, the MGMT bot joins now.
 *
 * The scheduled path only covers the manager's own calendar. This covers
 * everything that isn't on it — someone else's invite, an impromptu call.
 */
function QuickBot() {
  const { user } = useUser();
  const send = useAction(api.managerMeetingBot.createManagerQuickBot);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function go() {
    if (!user || !url.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await send({ clerkId: user.id, meetingUrl: url.trim() });
      if (r.ok) {
        setNote({ ok: true, text: "Bot sent — it joins in about 30 seconds. Let it in if there's a waiting room." });
        setUrl("");
      } else {
        setNote({ ok: false, text: r.error ?? "The bot couldn't be sent." });
      }
    } catch {
      setNote({ ok: false, text: "The bot couldn't be sent. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Record a meeting now</span>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        For meetings that aren&apos;t on your calendar — paste the link and the
        bot joins immediately.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://zoom.us/j/… or meet.google.com/…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send bot"}
        </button>
      </form>
      {note && (
        <p className={"mt-2 text-[13px] " + (note.ok ? "text-emerald-700" : "text-rose-600")}>
          {note.text}
        </p>
      )}
    </section>
  );
}

/**
 * Meeting-type tabs. The analysis judges each meeting's kind from the
 * conversation itself; "leadership" folds into the Team tab because a
 * leadership sync IS a team meeting for filing purposes. A meeting the AI
 * hasn't read yet has no bucket and appears under All only.
 */
type TypeTab = "all" | "one_on_one" | "team" | "interview" | "other";

const TYPE_TABS: Array<{ id: TypeTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "one_on_one", label: "1-on-1s" },
  { id: "team", label: "Team meetings" },
  { id: "interview", label: "Interviews" },
  { id: "other", label: "Other" },
];

function bucketOf(meetingType: string | null): TypeTab | null {
  switch (meetingType) {
    case "one_to_one":
      return "one_on_one";
    case "team":
    case "leadership":
      return "team";
    case "interview":
      return "interview";
    case "other":
      return "other";
    default:
      return null;
  }
}

const TYPE_PILL: Record<string, string> = {
  one_to_one: "1-on-1",
  team: "Team",
  leadership: "Leadership",
  interview: "Interview",
  other: "Other",
};

/**
 * What's coming and what was recorded.
 *
 * Upcoming sits above recorded because the useful question in the morning is
 * "what is the bot about to walk into", not "what did it catch yesterday".
 */
export function MeetingsTab({
  onOpenMeeting,
}: {
  onOpenMeeting: (id: string) => void;
}) {
  const { user } = useUser();
  const clerkId = user?.id;

  const meetings = useQuery(
    api.managerMeetingQueries.listManagerMeetings,
    clerkId ? { clerkId } : "skip",
  );
  const upcoming = useQuery(
    api.managerMeetingQueries.listUpcomingManagerEvents,
    clerkId ? { clerkId } : "skip",
  );

  const [typeTab, setTypeTab] = useState<TypeTab>("all");
  const counts = useMemo(() => {
    const c: Record<TypeTab, number> = { all: 0, one_on_one: 0, team: 0, interview: 0, other: 0 };
    for (const m of meetings ?? []) {
      c.all++;
      const b = bucketOf((m as any).meetingType);
      if (b) c[b]++;
    }
    return c;
  }, [meetings]);
  const visibleMeetings = useMemo(() => {
    if (!meetings) return meetings;
    if (typeTab === "all") return meetings;
    return meetings.filter((m: any) => bucketOf(m.meetingType) === typeTab);
  }, [meetings, typeTab]);

  return (
    <div className="space-y-6">
      <QuickBot />

      <section>
        <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Coming up
        </h3>
        <div className="rounded-xl border border-border bg-card">
          {upcoming === undefined ? (
            <Loading />
          ) : upcoming.length === 0 ? (
            <Empty>Nothing on your calendar in the next week.</Empty>
          ) : (
            upcoming.map((e: any) => (
              <div
                key={e._id}
                className="flex items-center justify-between border-b border-border/50 px-5 py-3.5 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(e.startTime).toLocaleString()}
                  </div>
                </div>
                {/* A meeting with no video link is on the calendar but
                    unrecordable. Saying so beats a silent absence from the
                    recordings list later. */}
                {!e.hasMeetingUrl ? (
                  <span className="text-xs text-muted-foreground">
                    no video link
                  </span>
                ) : e.excluded ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                    not recording
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                    will record
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Recorded
          </h3>
          <div className="flex flex-wrap items-center gap-1">
            {TYPE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeTab(t.id)}
                className={
                  "rounded-md border px-2.5 py-1 text-[12px] transition-colors " +
                  (typeTab === t.id
                    ? "border-foreground font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
                {t.id !== "all" && counts[t.id] > 0 ? ` · ${counts[t.id]}` : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card">
          {visibleMeetings === undefined ? (
            <Loading />
          ) : visibleMeetings.length === 0 ? (
            <Empty>
              {typeTab === "all"
                ? "Nothing recorded yet. Your next meeting with a video link will appear here."
                : `No ${TYPE_TABS.find((t) => t.id === typeTab)?.label.toLowerCase()} recorded yet.`}
            </Empty>
          ) : (
            visibleMeetings.map((m: any) => (
              <button
                key={m._id}
                onClick={() => onOpenMeeting(m._id)}
                className="flex w-full items-center gap-3 border-b border-border/50 px-5 py-3.5 text-left last:border-0 hover:bg-muted/40"
              >
                <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.title}</span>
                    {m.meetingType && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {TYPE_PILL[m.meetingType]}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {m.startedAt ? new Date(m.startedAt).toLocaleString() : "—"}
                    {m.duration ? ` · ${Math.round(m.duration / 60)} min` : ""}
                  </div>
                </div>
                {/* Why a recording produced nothing, when it produced nothing —
                    rather than a gap someone reads as "no meeting happened". */}
                {m.failureReason && (
                  <span className="text-xs text-amber-700">{m.failureReason}</span>
                )}
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-20 items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-5 text-sm text-muted-foreground">{children}</div>;
}
