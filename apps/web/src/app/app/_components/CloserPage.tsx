"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCloserInfo, signOut, type CloserInfo } from "@/lib/closer/session";

/**
 * Bridges the ported desktop views to the web.
 *
 * They all expect a `closerInfo` prop, and a couple expect callbacks that used
 * to switch which Electron window was showing. Here those become routes, which
 * is the whole point of the migration — the desktop app was six windows
 * pretending to be one app.
 *
 * The session is read in an effect rather than during render. Reading
 * localStorage while rendering makes the server produce one tree and the
 * browser another; React reports a hydration failure and throws away the
 * server's work to recover. It rendered fine either way, which is exactly what
 * makes it easy to ship by accident.
 */
export function useCloserPage() {
  const router = useRouter();
  const [closerInfo, setCloserInfo] = useState<CloserInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCloserInfo(getCloserInfo());
    setReady(true);
  }, []);

  return {
    closerInfo: closerInfo as CloserInfo,
    /** True once we've looked, and there is someone signed in. */
    ready: ready && !!closerInfo,
    /** Desktop switched windows; the web navigates. */
    onNavigate: (section: string) => router.push(`/app/${section}`),
    onLogout: async () => {
      await signOut();
      router.replace("/app/login");
    },
  };
}
