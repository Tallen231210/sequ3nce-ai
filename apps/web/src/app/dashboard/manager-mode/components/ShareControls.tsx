"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Check, Copy, Link2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Create and manage links, for a whole meeting or one clip.
 *
 * This is the only share entry point. It used to live solely inside the clips
 * list — which renders nothing until a clip exists, so a manager who hadn't
 * cut one yet had no way to share anything and reasonably concluded sharing
 * wasn't built.
 */
export function ShareControls({
  meetingId,
  clipId,
  label = "Share",
}: {
  meetingId: string;
  clipId?: string;
  label?: string;
}) {
  const { user } = useUser();
  const createShare = useMutation(api.managerMeetingClips.createShare);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [madeToken, setMadeToken] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <Link2 className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {madeToken ? (
        // The link, immediately — creating a link and then hunting for where
        // it went is the failure mode this avoids.
        <>
          <CopyLink token={madeToken} big />
          <button
            onClick={() => {
              setMadeToken(null);
              setOpen(false);
              setPassword("");
            }}
            className="text-[12px] text-muted-foreground underline"
          >
            done
          </button>
        </>
      ) : (
        <>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password (optional)"
            className="w-40 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
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
              try {
                const r = await createShare({
                  clerkId: user.id,
                  meetingId: meetingId as any,
                  clipId: clipId as any,
                  password: password.trim() || undefined,
                  expiryDays: days,
                });
                setMadeToken(r.token);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "…" : "Create link"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-[12px] text-muted-foreground underline"
          >
            cancel
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Links already handed out for the whole meeting, with expiry and view count.
 * Clip links live with their clips; this lists only the meeting-level ones.
 */
export function MeetingShareList({ meetingId }: { meetingId: string }) {
  const { user } = useUser();
  const shares = useQuery(
    api.managerMeetingClips.listShares,
    user ? { clerkId: user.id, meetingId: meetingId as any } : "skip",
  );
  const revokeShare = useMutation(api.managerMeetingClips.revokeShare);

  const meetingLinks = (shares ?? []).filter((s: any) => !s.clipId);
  if (meetingLinks.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {meetingLinks.map((s: any) => (
        <div
          key={s._id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground"
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
              user && revokeShare({ clerkId: user.id, shareId: s._id as any })
            }
            className="ml-auto underline hover:text-rose-600"
          >
            revoke
          </button>
        </div>
      ))}
    </div>
  );
}

export function CopyLink({ token, big }: { token: string; big?: boolean }) {
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
      className={
        "inline-flex items-center gap-1 font-medium text-foreground hover:underline " +
        (big ? "rounded-lg border border-border px-3 py-1.5 text-[13px]" : "")
      }
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
