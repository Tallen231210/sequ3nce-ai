"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CloserShell } from "../CloserShell";
import { CoachingView } from "../_components/CoachingView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  const router = useRouter();

  // Hiding the tab isn't gating the feature — the URL still works, and a
  // bookmark or an old link would walk straight into a page this team's
  // product doesn't include. Coaching is built around our bot being in the
  // call; on the bring-your-own-recording tier it would only ever be empty.
  const excluded = closerInfo?.productTier === "fathom";

  useEffect(() => {
    if (ready && excluded) router.replace("/app/dashboard");
  }, [ready, excluded, router]);

  if (!ready || excluded) return null;

  return (
    <CloserShell>
      <CoachingView closerInfo={closerInfo} />
    </CloserShell>
  );
}
