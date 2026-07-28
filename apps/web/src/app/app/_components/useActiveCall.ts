"use client";

import { useCallback, useRef, useState } from "react";
import { tierHas } from "@/lib/tiers";
import { usePoll } from "@/lib/closer/usePoll";
import { getActiveCallForCloserBot, type CloserInfo } from "@/lib/closer/client";

/**
 * Watches for a call the meeting bot is currently in.
 *
 * On desktop this same poll drove IPC that opened and closed floating windows:
 * the ammo tracker while the call ran, then the post-call form when it ended.
 * A browser has no windows to open, so the two outcomes become app state — a
 * banner the closer can follow, and a dialog when the call finishes.
 *
 * Tier 3 only. Teams that don't use our bot never see any of it, because
 * there is never an active call to find.
 */

export interface ActiveBotCall {
  callId: string;
  botId?: string;
  meetingTitle?: string;
  prospectName?: string;
}

/** Matches the desktop cadence. Ten seconds, not three — the tighter poll was
 *  a top contributor to Convex action saturation (task #348). */
const BOT_POLL_INTERVAL_MS = 10_000;

/**
 * Which call we were watching, kept outside React.
 *
 * The desktop app had a main process that remembered this across every window,
 * so a call ending always produced a form. A browser tab has no such thing: a
 * refresh mid-call would otherwise wipe the memory and the closer would never
 * be asked for the outcome. Persisting it means a reload, a new tab, or
 * quitting the browser and coming back all still end with the form.
 */
const WATCH_KEY = "sequ3nce_closer_watching_call";
/** Beyond this, a stored call is stale — don't ambush someone the next morning
 *  with a form for a call that ended yesterday. The Calls page's own
 *  "needs outcomes" prompt is the safety net for those. */
const WATCH_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function readWatched(): ActiveBotCall | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WATCH_KEY);
    if (!raw) return null;
    const { call, at } = JSON.parse(raw) as { call: ActiveBotCall; at: number };
    if (!call?.callId || Date.now() - at > WATCH_MAX_AGE_MS) {
      window.localStorage.removeItem(WATCH_KEY);
      return null;
    }
    return call;
  } catch {
    return null;
  }
}

function writeWatched(call: ActiveBotCall | null) {
  if (typeof window === "undefined") return;
  try {
    if (call) {
      window.localStorage.setItem(
        WATCH_KEY,
        JSON.stringify({ call, at: Date.now() }),
      );
    } else {
      window.localStorage.removeItem(WATCH_KEY);
    }
  } catch {
    // Storage blocked. The poll still works for as long as the tab lives.
  }
}

export function useActiveCall(closerInfo: CloserInfo | null) {
  const [activeCall, setActiveCall] = useState<ActiveBotCall | null>(null);
  const [endedCall, setEndedCall] = useState<ActiveBotCall | null>(null);
  const previousRef = useRef<ActiveBotCall | null>(null);
  const restoredRef = useRef(false);

  usePoll(
    "botActiveCall",
    async () => {
      if (!closerInfo?.closerId) return;
      // Nothing to watch for on a plan without our meeting bot. There is no
      // live call to find, ever — so this is a request every ten seconds, per
      // closer, forever, that can only ever return nothing.
      if (!tierHas(closerInfo.productTier, "meetingBot")) return;

      // First poll after a mount: pick up whatever we were watching before the
      // page reloaded, so a refresh mid-call doesn't lose the outcome prompt.
      if (!restoredRef.current) {
        restoredRef.current = true;
        previousRef.current = readWatched();
      }

      const call = (await getActiveCallForCloserBot(
        closerInfo.closerId,
      )) as ActiveBotCall | null;

      if (call) {
        setActiveCall(call);
        previousRef.current = call;
        writeWatched(call);
        setEndedCall(null);
        return;
      }

      // The call we were watching has finished. Surface the form once, for
      // that call — not on every subsequent empty poll.
      if (previousRef.current) {
        setEndedCall(previousRef.current);
        previousRef.current = null;
        writeWatched(null);
      }
      setActiveCall(null);
    },
    BOT_POLL_INTERVAL_MS,
    { enabled: !!closerInfo?.closerId },
  );

  const dismissEnded = useCallback(() => setEndedCall(null), []);

  return { activeCall, endedCall, dismissEnded };
}
