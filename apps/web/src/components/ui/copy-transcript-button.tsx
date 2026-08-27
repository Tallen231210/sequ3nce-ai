"use client";

// One-click "copy the whole transcript" (Zion's ask, useful everywhere a
// transcript renders). Text is built lazily on click — transcripts run to
// thousands of lines and there's no reason to serialize them on every render.

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export interface CopyTranscriptButtonProps {
  /** Serialize the full transcript. Return "" when there's nothing to copy. */
  buildText: () => string;
  className?: string;
}

/** A transcript line, formatted the same on every surface. */
export function transcriptLine(
  seconds: number,
  speaker: string,
  text: string,
): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `[${m}:${s}] ${speaker}: ${text}`;
}

export function CopyTranscriptButton({
  buildText,
  className,
}: CopyTranscriptButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    const text = buildText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be refused (permissions, insecure context). Nothing to
      // clean up — the button simply stays in its idle state.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy transcript
        </>
      )}
    </button>
  );
}
