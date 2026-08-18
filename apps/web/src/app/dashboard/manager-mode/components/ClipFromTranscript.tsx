"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Scissors, X } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Cut a training out of a meeting by picking two lines of the transcript.
 *
 * Marking the range in the words rather than by scrubbing the video is the
 * point — a manager knows the moment by what was said, and typing timestamps
 * means watching the recording twice to find them.
 */
export function ClipFromTranscript({
  meetingId,
  transcript,
}: {
  meetingId: string;
  transcript: Array<{ speaker: string; text: string; startSeconds: number }>;
}) {
  const { user } = useUser();
  const createClip = useMutation(api.managerMeetingClips.createClip);

  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const clear = () => {
    setStart(null);
    setEnd(null);
    setTitle("");
    setError(null);
  };

  const mark = (t: number) => {
    setSaved(false);
    if (start === null) return setStart(t);
    if (end === null) {
      // Marked backwards, which is easy to do when scanning upward. Swap
      // rather than refuse — the intent is unambiguous.
      return t < start ? (setEnd(start), setStart(t)) : setEnd(t);
    }
    setStart(t);
    setEnd(null);
  };

  const inRange = (t: number) =>
    start !== null && end !== null && t >= start && t <= end;

  const save = async () => {
    if (start === null || end === null || !user) return;
    setSaving(true);
    setError(null);
    try {
      await createClip({
        clerkId: user.id,
        meetingId: meetingId as any,
        title: title.trim(),
        // The last marked line starts the final sentence rather than ending
        // it. Without a tail the clip cuts off mid-word.
        startSeconds: start,
        endSeconds: end + 8,
      });
      clear();
      setSaved(true);
    } catch (e: any) {
      setError(e?.data ?? "Couldn't save that clip");
    } finally {
      setSaving(false);
    }
  };

  if (transcript.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="text-sm font-medium">Transcript</div>
        <div className="text-[11px] text-muted-foreground">
          {start === null
            ? "click a line to start a clip"
            : end === null
              ? "now click where it ends"
              : `${mmss(start)}–${mmss(end)} selected`}
        </div>
      </div>

      <div className="max-h-96 space-y-1 overflow-y-auto px-2.5 py-3">
        {transcript.map((t, i) => (
          <button
            key={i}
            onClick={() => mark(t.startSeconds)}
            className={
              "flex w-full gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm leading-relaxed transition-colors " +
              (inRange(t.startSeconds)
                ? "bg-primary/10"
                : t.startSeconds === start
                  ? "bg-primary/10"
                  : "hover:bg-muted/60")
            }
          >
            <span className="w-12 shrink-0 text-xs text-muted-foreground">
              {mmss(t.startSeconds)}
            </span>
            <span className="w-24 shrink-0 font-medium">{t.speaker}</span>
            <span className="flex-1">{t.text}</span>
          </button>
        ))}
      </div>

      {saved && (
        <div className="border-t border-border px-5 py-3 text-[13px] text-emerald-700">
          Clip saved.
        </div>
      )}

      {start !== null && end !== null && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-border px-5 py-3.5">
          <Scissors className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">
            {mmss(start)}–{mmss(end)}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this teaching?"
            className="min-w-48 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save clip"}
          </button>
          <button
            onClick={clear}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {error && (
            <span className="w-full text-[13px] text-rose-600">{error}</span>
          )}
        </div>
      )}
    </section>
  );
}
