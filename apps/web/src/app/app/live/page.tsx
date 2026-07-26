"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CloserShell } from "../CloserShell";
import { ActiveCallView } from "../_components/ActiveCallView";
import { useCloserPage } from "../_components/CloserPage";
import { useActiveCall } from "../_components/useActiveCall";

/**
 * The call happening right now.
 *
 * On desktop this shared the hub with everything else. Here it's a route, so
 * the closer can leave it and come back — the banner in the shell is always
 * the way back in.
 */
export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  const { activeCall } = useActiveCall(ready ? closerInfo : null);
  const router = useRouter();

  // Nothing live? There is nothing for this page to show. Send them somewhere
  // useful rather than leaving them on an empty screen.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (!activeCall) router.replace("/app/dashboard");
    }, 12_000);
    return () => clearTimeout(t);
  }, [ready, activeCall, router]);

  if (!ready) return null;
  return (
    <CloserShell>
      {activeCall ? (
        <ActiveCallView
          closerInfo={closerInfo}
          callId={activeCall.callId}
          botId={activeCall.botId}
          meetingTitle={activeCall.meetingTitle}
          prospectName={activeCall.prospectName}
        />
      ) : (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium">No call in progress</p>
          <p className="text-xs text-muted-foreground">
            This opens automatically when the bot joins one of your calls.
          </p>
        </div>
      )}
    </CloserShell>
  );
}
