"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Check, Copy, Loader2, Scissors, Trash2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { mmss } from "./clipUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Every training cut so far, and where each one was sent.
 *
 * Links show their expiry and whether anyone opened them. A manager who shared
 * a coaching clip three weeks ago should be able to see at a glance that it's
 * still live and was never watched — that's the whole reason those two fields
 * exist on the share.
 */
export function ClipsTab({
  onOpenMeeting,
}: {
  onOpenMeeting: (id: string) => void;
}) {
  const { user } = useUser();
  const clips = useQuery(
    api.managerMeetingClips.listAllClips,
    user ? { clerkId: user.id } : "skip",
  );
  const deleteClip = useMutation(api.managerMeetingClips.deleteClip);
  const revokeShare = useMutation(api.managerMeetingClips.revokeShare);

  if (clips === undefined) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Scissors className="mx-auto h-5 w-5 text-muted-foreground" />
        <h3 className="mt-3 text-base font-semibold">No clips yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Open a recorded meeting and click the line where a moment starts and
          the line where it ends. That becomes a clip you can send to one person
          or keep as training.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {clips.map((c: any) => (
        <div key={c._id} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{c.title}</div>
              <button
                onClick={() => onOpenMeeting(String(c.meetingId))}
                className="mt-0.5 text-[11px] text-muted-foreground hover:underline"
              >
                {c.meetingTitle} · {mmss(c.startSeconds)}–{mmss(c.endSeconds)}
              </button>
            </div>
            <button
              onClick={() =>
                user && deleteClip({ clerkId: user.id, clipId: c._id as any })
              }
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-600"
              aria-label="Delete clip"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {c.notes && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {c.notes}
            </p>
          )}

          {c.transcriptText && (
            <p className="mt-2.5 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
              {c.transcriptText}
            </p>
          )}

          {c.links.length === 0 ? (
            <div className="mt-3 text-[11px] text-muted-foreground">
              Not shared with anyone.
            </div>
          ) : (
            c.links.map((s: any) => (
              <div
                key={s._id}
                className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground"
              >
                <CopyLink token={s.token} />
                {s.hasPassword && <span>password</span>}
                <span>
                  {s.expiresAt
                    ? `expires ${new Date(s.expiresAt).toLocaleDateString()}`
                    : "no expiry"}
                </span>
                <span>
                  {s.viewCount === 0 ? "not opened yet" : `opened ${s.viewCount}×`}
                </span>
                <button
                  onClick={() =>
                    user &&
                    revokeShare({ clerkId: user.id, shareId: s._id as any })
                  }
                  className="ml-auto underline hover:text-rose-600"
                >
                  revoke
                </button>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/share/m/${token}`;

  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> copy link
        </>
      )}
    </button>
  );
}
