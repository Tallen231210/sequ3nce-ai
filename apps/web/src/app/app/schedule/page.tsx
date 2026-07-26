"use client";

import { CloserShell } from "../CloserShell";
import { ScheduleView } from "../_components/schedule/ScheduleView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <ScheduleView closerInfo={closerInfo} />
    </CloserShell>
  );
}
