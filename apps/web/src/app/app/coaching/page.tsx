"use client";

import { CloserShell } from "../CloserShell";
import { CoachingView } from "../_components/CoachingView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <CoachingView closerInfo={closerInfo} />
    </CloserShell>
  );
}
