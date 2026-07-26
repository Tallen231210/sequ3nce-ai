"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CloserShell } from "../CloserShell";
import { CallHistoryView } from "../_components/CallHistoryView";
import { PostCallModal } from "../_components/PostCallModal";
import { useCloserPage } from "../_components/CloserPage";

function CallsPage() {
  const { closerInfo, ready } = useCloserPage();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState<{ callId: string; prospectName?: string } | null>(null);

  // Desktop asked the main process to open a window for a specific call. The
  // web equivalent is an address — which also means the form survives a
  // refresh and can be linked to, neither of which the window could do.
  const linkedCallId = params.get("questionnaire");
  useEffect(() => {
    if (linkedCallId) setPending({ callId: linkedCallId });
  }, [linkedCallId]);

  const close = () => {
    setPending(null);
    if (linkedCallId) router.replace("/app/calls");
  };

  if (!ready) return null;
  return (
    <CloserShell>
      <CallHistoryView
        closerInfo={closerInfo}
        onOpenQuestionnaire={(callId, prospectName) =>
          setPending({ callId, prospectName })
        }
      />
      {pending && (
        <PostCallModal
          closerInfo={closerInfo}
          callId={pending.callId}
          prospectName={pending.prospectName}
          onClose={close}
        />
      )}
    </CloserShell>
  );
}

export default function Page() {
  // useSearchParams needs a suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <CallsPage />
    </Suspense>
  );
}
