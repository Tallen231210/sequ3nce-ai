"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Lock } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {isClip ? "Clip" : "Meeting"}
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{data.title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(data.metAt).toLocaleDateString()}
          {isClip
            ? ` · ${formatRange(data.startSeconds, data.endSeconds)}`
            : data.duration
              ? ` · ${Math.round(data.duration / 60)} min`
              : ""}
        </p>

        {data.notes && (
          <p className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            {data.notes}
          </p>
        )}

        {recordingUrl === undefined ? (
          <div className="mt-6 flex h-40 items-center justify-center rounded-xl border border-border bg-card">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : recordingUrl ? (
          <ClipPlayer
            url={recordingUrl}
            startSeconds={data.startSeconds}
            endSeconds={data.endSeconds}
          />
        ) : (
          // The words are still worth reading without the video, so this says
          // what's missing rather than rendering a broken player.
          <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            The recording for this meeting isn&apos;t available.
          </div>
        )}

        {isClip && data.transcriptText && (
          <pre className="mt-6 whitespace-pre-wrap rounded-xl border border-border bg-card p-5 font-sans text-[13px] leading-relaxed">
            {data.transcriptText}
          </pre>
        )}

        {!isClip && data.transcript?.length > 0 && (
          <div className="mt-6 space-y-3">
            {data.transcript.map((s: any, i: number) => (
              <div key={i} className="text-[13px] leading-relaxed">
                <span className="font-semibold">{s.speaker}</span>
                <span className="ml-2 text-muted-foreground">{s.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
}: {
  url: string;
  startSeconds: number | null;
  endSeconds: number | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || startSeconds === null) return;

    const onLoaded = () => {
      el.currentTime = startSeconds;
    };
    const onTime = () => {
      if (endSeconds !== null && el.currentTime >= endSeconds) el.pause();
    };
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [startSeconds, endSeconds]);

  return (
    <video
      ref={ref}
      src={url}
      controls
      className="mt-6 w-full rounded-xl border border-border bg-black"
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
