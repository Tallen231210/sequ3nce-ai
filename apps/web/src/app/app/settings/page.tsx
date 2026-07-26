"use client";

import { CloserShell } from "../CloserShell";
import { SettingsView } from "../_components/SettingsView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready, onLogout } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <SettingsView closerInfo={closerInfo} onLogout={onLogout} />
    </CloserShell>
  );
}
