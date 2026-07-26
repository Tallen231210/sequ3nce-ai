"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CloserShell } from "../CloserShell";
import { ActiveCallView } from "../_components/ActiveCallView";
import { useCloserPage } from "../_components/CloserPage";
import { useActiveCallContext } from "../_components/ActiveCallContext";
import type { CloserInfo } from "@/lib/closer/client";

/**
 * The call happening right now.
 *
 * On desktop this shared the hub with everything else. Here it's a route, so
 * the closer can leave it and come back — the banner in the shell is always
 * the way back in.
 */
export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <LiveCallBody closerInfo={closerInfo} />
    </CloserShell>
  );
}

/**
 * Sits inside the shell so it reads the shell's single poll rather than
 * starting a second one. Two watchers used to race over the same stored
 * "call I'm watching" marker, and the loser could swallow the post-call form.
 */
function LiveCallBody({ closerInfo }: { closerInfo: CloserInfo }) {
  const { activeCall } = useActiveCallContext();
  const router = useRouter();

  // Landing here with nothing live means the call already finished, or the
  // link was stale. Give the poll a couple of cycles to say otherwise, then
  // move them somewhere useful rather than leaving them on an empty screen.
  useEffect(() => {
    if (activeCall) return;
    const t = setTimeout(() => router.replace("/app/dashboard"), 25_000);
    return () => clearTimeout(t);
  }, [activeCall, router]);

  if (!activeCall) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium">No call in progress</p>
        <p className="text-xs text-muted-foreground">
          This opens automatically when the bot joins one of your calls.
        </p>
      </div>
    );
  }

  return (
    <ActiveCallView
      closerInfo={closerInfo}
      callId={activeCall.callId}
      botId={activeCall.botId}
      meetingTitle={activeCall.meetingTitle}
      prospectName={activeCall.prospectName}
    />
  );
}
