"use client";

import { useRouter } from "next/navigation";
import { BotOnboardingView } from "../_components/BotOnboardingView";
import { useCloserPage } from "../_components/CloserPage";

/**
 * Calendar connection, so the bot knows which meetings to join.
 *
 * Deliberately outside the shell: it is the one thing standing between the
 * closer and a working app, and a sidebar full of sections they cannot use
 * yet is a distraction from it.
 */
export default function Page() {
  const { closerInfo, ready } = useCloserPage();
  const router = useRouter();
  if (!ready) return null;
  return (
    <BotOnboardingView
      closerInfo={closerInfo}
      onComplete={() => router.replace("/app/dashboard")}
    />
  );
}
