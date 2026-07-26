"use client";

import { CloserShell } from "../CloserShell";
import { StatsView } from "../_components/StatsView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <StatsView closerInfo={closerInfo} />
    </CloserShell>
  );
}
