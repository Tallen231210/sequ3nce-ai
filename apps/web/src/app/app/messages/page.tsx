"use client";

import { CloserShell } from "../CloserShell";
import { MessagesView } from "../_components/MessagesView";
import { useCloserPage } from "../_components/CloserPage";

export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  if (!ready) return null;
  return (
    <CloserShell>
      <MessagesView closerInfo={closerInfo} />
    </CloserShell>
  );
}
