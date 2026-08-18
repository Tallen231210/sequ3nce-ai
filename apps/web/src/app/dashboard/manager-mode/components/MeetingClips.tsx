"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { mmss } from "./clipUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Clips cut from this meeting, and the links handed out for them.
 *
 * Links are listed with their expiry and view count rather than hidden behind
 * a copy button. A manager who shared a one-to-one three weeks ago should be
 * able to see that it's still open and whether anyone opened it — that's the
 * whole reason those two fields exist.
 */
export function MeetingClips({ meetingId }: { meetingId: string }) {
  const { user } = useUser();
  const clips = useQuery(
    api.managerMeetingClips.listClipsForMeeting,
    user ? { clerkId: user.id, meetingId: meetingId as any } : "skip",
  );
  const shares = useQuery(
    api.managerMeetingClips.listShares,
    user ? { clerkId: user.id, meetingId: meetingId as any } : "skip",
  );
  const deleteClip = useMutation(api.managerMeetingClips.deleteClip);
  const revokeShare = useMutation(api.managerMeetingClips.revokeShare);

  if (!clips || clips.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        Clips
      </div>

      <div className="mt-3 space-y-3">
        {clips.map((c: any) => {
          const links = (shares ?? []).filter(
            (s: any) => String(s.clipId) === String(c._id),
          );
          return (
            <div key={c._id} className="rounded-lg border border-border/70 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {mmss(c.startSeconds)}–{mmss(c.endSeconds)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ShareButton meetingId={meetingId} clipId={c._id} />
                  <button
                    onClick={() =>
                      user &&
                      deleteClip({ clerkId: user.id, clipId: c._id as any })
                    }
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-600"
                    aria-label="Delete clip"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {c.notes && (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {c.notes}
                </p>
              )}

              {links.map((s: any) => (
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
                    {s.viewCount === 0
                      ? "not opened yet"
                      : `opened ${s.viewCount}×`}
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
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShareButton({
  meetingId,
  clipId,
}: {
  meetingId: string;
  clipId?: string;
}) {
  const { user } = useUser();
  const createShare = useMutation(api.managerMeetingClips.createShare);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Share"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password (optional)"
        className="w-36 rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none"
      />
      <select
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px]"
      >
        <option value={7}>7 days</option>
        <option value={30}>30 days</option>
        <option value={90}>90 days</option>
        {/* Present, but never the default. */}
        <option value={0}>never expires</option>
      </select>
      <button
        disabled={busy}
        onClick={async () => {
          if (!user) return;
          setBusy(true);
          await createShare({
            clerkId: user.id,
            meetingId: meetingId as any,
            clipId: clipId as any,
            password: password.trim() || undefined,
            expiryDays: days,
          });
          setBusy(false);
          setOpen(false);
          setPassword("");
        }}
        className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "…" : "Create link"}
      </button>
    </div>
  );
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === "undefined" ? "" : `${window.location.origin}/share/m/${token}`;

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
