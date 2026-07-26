"use client";

import { CloserShell } from "../CloserShell";
import { DashboardView } from "../_components/DashboardView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready, onNavigate } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <DashboardView closerInfo={closerInfo} onNavigate={onNavigate} />
    </CloserShell>
  );
}
