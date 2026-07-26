"use client";

import { CloserShell } from "../CloserShell";
import { CallHistoryView } from "../_components/CallHistoryView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <CallHistoryView closerInfo={closerInfo} />
    </CloserShell>
  );
}
