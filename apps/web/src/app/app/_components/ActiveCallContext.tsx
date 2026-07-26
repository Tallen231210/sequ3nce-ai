"use client";

import { createContext, useContext } from "react";
import type { ActiveBotCall } from "./useActiveCall";

/**
 * One watcher for the whole app.
 *
 * Before this existed, both the shell and the live-call page called
 * `useActiveCall` independently. That meant two polls for the same thing, and
 * — much worse — two state machines racing over the same stored "call I'm
 * watching" marker. Whichever noticed the call end first cleared it, so the
 * other could miss the transition entirely and never show the post-call form.
 * That failure landed precisely on the page a closer is most likely to be
 * sitting on when a call ends.
 *
 * The shell owns the poll and publishes the result here; everything else
 * reads.
 */
export interface ActiveCallState {
  activeCall: ActiveBotCall | null;
}

const ActiveCallContext = createContext<ActiveCallState>({ activeCall: null });

export const ActiveCallProvider = ActiveCallContext.Provider;

export function useActiveCallContext(): ActiveCallState {
  return useContext(ActiveCallContext);
}
