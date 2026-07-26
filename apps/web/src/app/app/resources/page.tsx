"use client";

import { CloserShell } from "../CloserShell";
import { ResourcesView } from "../_components/ResourcesView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <ResourcesView closerInfo={closerInfo} />
    </CloserShell>
  );
}
