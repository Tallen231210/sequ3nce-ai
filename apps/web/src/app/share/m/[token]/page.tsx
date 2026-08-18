"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Lock } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Logo } from "@/components/ui/logo";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// A manager's meeting, or a clip of one, shown to whoever holds the link.
//
// Separate from /share/[token], which serves sales calls and carries comments,
// chapters, scoring and compliance redaction. None of that applies here, and
// teaching that page a second content type would put a manager's one-to-one
// through code paths built around a prospect.
// ============================================================================

const DENIAL_COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "This link doesn't exist",
    body: "Check you copied the whole thing, or ask whoever sent it for a new one.",
  },
  revoked: {
    title: "This link was turned off",
    body: "Whoever shared it has since revoked access.",
  },
  expired: {
    title: "This link has expired",
    body: "Manager links expire by default. Ask for a fresh one if you still need it.",
  },
};

export default function ManagerSharePage() {
  const { token } = useParams<{ token: string }>();
  const initial = useQuery(api.managerShareView.resolveShare, token ? { token } : "skip");
  const unlock = useMutation(api.managerShareView.resolveShareWithPassword);
  const countView = useMutation(api.managerShareView.recordShareView);

  const freshUrl = useAction(api.managerShareRecording.getFreshRecordingUrlByToken);

  const [unlocked, setUnlocked] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null | undefined>(undefined);

  // Count the view once. A ref rather than state because React re-runs effects
  // in development and a doubled count would make "opened twice" meaningless.
  const counted = useRef(false);
  useEffect(() => {
    if (initial?.ok && !counted.current && token) {
      counted.current = true;
      void countView({ token });
    }
  }, [initial, token, countView]);

  // The stored URL is a presigned S3 link that expires about six hours after
  // the meeting. Always ask for a fresh one rather than serving a URL that
  // silently 403s the day after the link was sent.
  const passedGate = unlocked ?? (initial?.ok ? initial : null);
  const asked = useRef(false);
  useEffect(() => {
    if (!passedGate || asked.current || !token) return;
    asked.current = true;
    void freshUrl({ token, password: password || undefined })
      .then((r: any) => setRecordingUrl(r?.recordingUrl ?? null))
      .catch(() => setRecordingUrl(null));
  }, [passedGate, token, password, freshUrl]);

  if (initial === undefined) {
    return (
      <Shell>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Shell>
    );
  }

  const data = passedGate;

  if (!data) {
    const reason = (initial as any).reason as string;
    if (reason === "password_required") {
      return (
        <Shell>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h1 className="mt-3 text-lg font-semibold tracking-tight">
              This link is password protected
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter the password you were given.
            </p>
            <form
              className="mt-5 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setChecking(true);
                setWrong(false);
                const res: any = await unlock({ token, password });
                setChecking(false);
                if (res?.ok) setUnlocked(res);
                else setWrong(true);
              }}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Password"
              />
              {wrong && (
                <p className="text-[13px] text-rose-600">
                  That password didn&apos;t work.
                </p>
              )}
              <button
                type="submit"
                disabled={checking || !password}
                className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {checking ? "Checking…" : "View"}
              </button>
            </form>
          </div>
        </Shell>
      );
    }

    const copy = DENIAL_COPY[reason] ?? DENIAL_COPY.not_found;
    return (
      <Shell>
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </Shell>
    );
  }

  return <ShareBody data={data} recordingUrl={recordingUrl} />;
}

function ShareBody({
  data,
  recordingUrl,
}: {
  data: any;
  recordingUrl: string | null | undefined;
}) {
  const isClip = data.kind === "clip";
  const hasWords = isClip
    ? !!data.transcriptText
    : (data.transcript?.length ?? 0) > 0;

  // The transcript follows the video and clicking a line seeks it, so time
  // and seeking live here, above both.
  const [time, setTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
    setTime(t);
  };

  const player =
    recordingUrl === undefined ? (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    ) : recordingUrl ? (
      <ClipPlayer
        url={recordingUrl}
        startSeconds={data.startSeconds}
        endSeconds={data.endSeconds}
        videoRef={videoRef}
        onTime={setTime}
      />
    ) : (
      // The words are still worth reading without the video, so this says
      // what's missing rather than rendering a broken player.
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        The recording for this meeting isn&apos;t available.
      </div>
    );

  const a = !isClip ? data.analysis : null;

  const words = isClip ? (
    <pre className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 font-sans text-[13px] leading-relaxed">
      {data.transcriptText}
    </pre>
  ) : (
    <SyncedTranscript
      segments={data.transcript ?? []}
      time={time}
      onSeek={seek}
    />
  );

  return (
    <div className="min-h-screen bg-background">
      {/* This page is what a recipient sees with no other context — often
          their first contact with the product. The mark carries that, big and
          centred, linking home. */}
      <header className="border-b border-border py-8">
        <div className="flex justify-center">
          <Logo height={44} href="https://sequ3nce.ai" />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {isClip ? "Clip" : "Meeting"}
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
            {data.title}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(data.metAt).toLocaleDateString()}
            {isClip
              ? ` · ${formatRange(data.startSeconds, data.endSeconds)}`
              : data.duration
                ? ` · ${Math.round(data.duration / 60)} min`
                : ""}
          </p>
        </div>

        {data.notes && (
          <p className="mx-auto mt-5 max-w-2xl rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            {data.notes}
          </p>
        )}

        {/* The video is the main event and sized like it — roughly two thirds
            of the row, words in the remaining third. Stacked on a phone. When
            there are no words, the video takes the middle alone rather than
            sitting in a lopsided half-filled grid. */}
        <div
          className={
            "mt-7 " +
            (hasWords
              ? "grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start"
              : "mx-auto max-w-4xl")
          }
        >
          <div className="space-y-5">
            {player}

            {/* What the meeting amounted to, under the video where a viewer
                who won't watch all of it still gets the substance. */}
            {a?.summary && (
              <section className="rounded-xl border border-border bg-card p-5">
                <SectionLabel>Summary</SectionLabel>
                <p className="mt-2.5 text-sm leading-relaxed">{a.summary}</p>
                {a.topics.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {a.topics.map((t: string) => (
                      <span
                        key={t}
                        className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {(a?.talkingPoints?.length ?? 0) > 0 && (
              <section className="rounded-xl border border-border bg-card p-5">
                <SectionLabel>Biggest takeaways</SectionLabel>
                <Bullets items={a.talkingPoints} />
              </section>
            )}

            {(a?.agreements?.length ?? 0) > 0 && (
              <section className="rounded-xl border border-border bg-card p-5">
                <SectionLabel>Agreed</SectionLabel>
                <ul className="mt-3 space-y-2">
                  {a.agreements.map((g: any, i: number) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      <span>
                        <span className="font-medium">{g.who}</span> — {g.what}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(a?.actionItems?.length ?? 0) > 0 && (
              <section className="rounded-xl border border-border bg-card p-5">
                <SectionLabel>Left hanging</SectionLabel>
                <ul className="mt-3 space-y-2">
                  {a.actionItems.map((t: any, i: number) => (
                    <li key={i} className="text-sm leading-relaxed">
                      <span className="font-medium">{t.who}</span> — {t.what}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {hasWords && <div className="lg:sticky lg:top-6">{words}</div>}
        </div>
      </div>

      <footer className="pb-10 pt-2 text-center text-[11px] text-muted-foreground">
        Recorded with{" "}
        <a href="https://sequ3nce.ai" className="font-medium text-foreground hover:underline">
          Sequ3nce.ai
        </a>
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          {t}
        </li>
      ))}
    </ul>
  );
}

/**
 * The transcript, following the video.
 *
 * The line being spoken is highlighted and kept in view; clicking any line
 * seeks the video there. Auto-follow pauses for a few seconds after the reader
 * scrolls by hand — fighting someone who's trying to read back is worse than
 * briefly losing sync, and playback re-captures it on the next line change.
 */
function SyncedTranscript({
  segments,
  time,
  onSeek,
}: {
  segments: Array<{ speaker: string; text: string; startSeconds: number }>;
  time: number;
  onSeek: (t: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  // The line being spoken: the last one that started before now.
  let active = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startSeconds <= time) active = i;
    else break;
  }

  useEffect(() => {
    if (Date.now() - userScrolledAt.current < 4000) return;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <div
      ref={boxRef}
      onWheel={() => (userScrolledAt.current = Date.now())}
      onTouchMove={() => (userScrolledAt.current = Date.now())}
      className="max-h-[75vh] space-y-0.5 overflow-y-auto rounded-xl border border-border bg-card p-3"
    >
      {segments.map((s, i) => (
        <button
          key={i}
          ref={i === active ? activeRef : undefined}
          onClick={() => onSeek(s.startSeconds)}
          className={
            "block w-full rounded-lg px-2.5 py-2 text-left text-[13px] leading-relaxed transition-colors " +
            (i === active ? "bg-primary/10" : "hover:bg-muted/60")
          }
        >
          <span className="font-semibold">{s.speaker}</span>
          <span
            className={
              "ml-2 " +
              (i === active ? "text-foreground" : "text-muted-foreground")
            }
          >
            {s.text}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Plays only the clip's range.
 *
 * Seeks to the start on load and stops at the end. Without the stop, a
 * "two-minute clip" keeps playing into the rest of the one-to-one, which for
 * a meeting about someone's performance is a real disclosure, not a rough edge.
 */
function ClipPlayer({
  url,
  startSeconds,
  endSeconds,
  videoRef,
  onTime,
}: {
  url: string;
  startSeconds: number | null;
  endSeconds: number | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTime: (t: number) => void;
}) {
  const ref = videoRef;

  useEffect(() => {
    const el = ref.current;
    if (!el || startSeconds === null) return;

    const onLoaded = () => {
      el.currentTime = startSeconds;
    };
    const onTimeCap = () => {
      if (endSeconds !== null && el.currentTime >= endSeconds) el.pause();
    };
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTimeCap);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTimeCap);
    };
  }, [startSeconds, endSeconds, ref]);

  return (
    <video
      ref={ref}
      src={url}
      controls
      onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
      className="w-full rounded-xl border border-border bg-black"
    />
  );
}

function formatRange(start: number | null, end: number | null) {
  if (start === null || end === null) return "";
  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return `${mmss(start)}–${mmss(end)}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      {children}
    </div>
  );
}
