"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, Scissors, X } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { ClipTimeline } from "./ClipTimeline";
import { mmss, speakerHue } from "./clipUtils";
import { CopyTranscriptButton, transcriptLine } from "@/components/ui/copy-transcript-button";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Segment = { speaker: string; text: string; startSeconds: number };

/** A tail so the clip doesn't cut off mid-sentence when the end is marked on
 *  the line that starts it. */
const TAIL_SECONDS = 8;

/**
 * Cutting a training out of a meeting: video, the meeting as a strip with a
 * draggable selection, and the transcript beside it.
 *
 * Both halves drive the same selection. A manager who remembers the words
 * marks it in the transcript; one who remembers roughly when drags the strip.
 */
export function ClipStudio({
  meetingId,
  segments,
  duration,
  hasRecording,
}: {
  meetingId: string;
  segments: Segment[];
  duration: number;
  hasRecording: boolean;
}) {
  const { user } = useUser();
  const createClip = useMutation(api.managerMeetingClips.createClip);
  const getUrl = useAction(api.managerShareRecording.getFreshRecordingUrl);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Recall presigns the recording and it expires roughly six hours after the
  // meeting, so the stored URL is only good on the day. Always ask for a fresh
  // one rather than rendering a player that 403s.
  const asked = useRef(false);
  useEffect(() => {
    if (!hasRecording || !user || asked.current) return;
    asked.current = true;
    void getUrl({ clerkId: user.id, meetingId: meetingId as any })
      .then((r: any) => setUrl(r?.recordingUrl ?? null))
      .catch(() => setUrl(null));
  }, [hasRecording, user, meetingId, getUrl]);

  const clear = () => {
    setStart(null);
    setEnd(null);
    setTitle("");
    setError(null);
  };

  const seek = (t: number) => {
    setPlayhead(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const markLine = (t: number) => {
    setSaved(false);
    if (start === null) return setStart(t);
    if (end === null) {
      // Marked backwards, which is easy when scanning upward. Swap rather
      // than refuse — the intent is unambiguous.
      return t < start ? (setEnd(start), setStart(t)) : setEnd(t + TAIL_SECONDS);
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
        startSeconds: Math.round(start),
        endSeconds: Math.round(end),
      });
      clear();
      setSaved(true);
    } catch (e: any) {
      setError(e?.data ?? "Couldn't save that clip");
    } finally {
      setSaving(false);
    }
  };

  if (segments.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="text-sm font-medium">Cut a training</div>
        <div className="text-[11px] text-muted-foreground">
          {start === null
            ? "click a line, or drag on the strip"
            : end === null
              ? "now click where it ends"
              : `${mmss(start)}–${mmss(end)} selected`}
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3">
          {hasRecording ? (
            url === undefined ? (
              <div className="flex h-48 items-center justify-center rounded-lg bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : url ? (
              <video
                ref={videoRef}
                src={url}
                controls
                onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                className="w-full rounded-lg bg-black"
              />
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-[13px] text-muted-foreground">
                The recording couldn&apos;t be loaded, but you can still cut from
                the transcript.
              </div>
            )
          ) : null}

          <ClipTimeline
            segments={segments}
            duration={duration}
            start={start}
            end={end}
            playhead={playhead}
            onScrub={seek}
            onSetStart={(t) => {
              setSaved(false);
              setStart(t);
            }}
            onSetEnd={setEnd}
            onClear={clear}
          />

          {/* The reliable way in. Dragging a range on a two-minute meeting is
              fiddly, and clicking transcript lines needs at least two of them —
              a meeting with one line had no way to clip at all. Play to the
              moment, press the button. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSaved(false);
                setStart(playhead);
                if (end !== null && end <= playhead) setEnd(null);
              }}
              className="rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-muted"
            >
              Start at {mmss(playhead)}
            </button>
            <button
              onClick={() => {
                setSaved(false);
                if (start === null) setStart(0);
                setEnd(Math.max(playhead, (start ?? 0) + 1));
              }}
              className="rounded-lg border border-border px-2.5 py-1 text-[12px] hover:bg-muted"
            >
              End at {mmss(playhead)}
            </button>
            {(start !== null || end !== null) && (
              <button
                onClick={clear}
                className="text-[12px] text-muted-foreground underline"
              >
                clear
              </button>
            )}
          </div>

          {/* Speakers, so the strip's colours mean something. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {[...new Set(segments.map((s) => s.speaker))].map((sp) => (
              <span
                key={sp}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: `hsl(${speakerHue(sp)} 45% 55%)` }}
                />
                {sp}
              </span>
            ))}
            <span className="ml-auto">
              <CopyTranscriptButton
                buildText={() =>
                  segments
                    .map((t) => transcriptLine(t.startSeconds, t.speaker, t.text))
                    .join("\n")
                }
              />
            </span>
          </div>
        </div>

        <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
          {segments.map((t, i) => (
            <button
              key={i}
              onClick={() => markLine(t.startSeconds)}
              onDoubleClick={() => seek(t.startSeconds)}
              className={
                "flex w-full gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-relaxed transition-colors " +
                (inRange(t.startSeconds) || t.startSeconds === start
                  ? "bg-primary/10"
                  : "hover:bg-muted/60")
              }
            >
              <span className="w-9 shrink-0 text-[11px] text-muted-foreground">
                {mmss(t.startSeconds)}
              </span>
              <span
                className="w-16 shrink-0 truncate text-[11px] font-medium"
                style={{ color: `hsl(${speakerHue(t.speaker)} 45% 40%)` }}
              >
                {t.speaker}
              </span>
              <span className="flex-1">{t.text}</span>
            </button>
          ))}
        </div>
      </div>

      {saved && (
        <div className="border-t border-border px-5 py-3 text-[13px] text-emerald-700">
          Clip saved — it&apos;s in the Clips tab, ready to share.
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
            onClick={() => void save()}
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
          {error && <span className="w-full text-[13px] text-rose-600">{error}</span>}
        </div>
      )}
    </section>
  );
}
