"use client";

// Dev-only preview of the Setters page on fictional data — the localhost
// review surface. 404 in production, like st-preview.

import { useState } from "react";
import type { SettersTab } from "../dashboard/setters/components/SettersView";
import { notFound } from "next/navigation";
import { SettersView } from "../dashboard/setters/components/SettersView";
import { SettingsDrawer } from "../dashboard/setters/components/SettingsDrawer";
import { ACTIVITY, BOOKINGS, CADENCE, CHECKS, SETS, SPEED } from "./fixture";

export default function SettersPreviewPage() {
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<SettersTab>("setters");
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <button type="button" onClick={() => setSettings(true)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
        Settings (drawer shell only — its lists need a live login)
      </button>
      <SettingsDrawer clerkId="preview" open={settings} onClose={() => setSettings(false)} checks={CHECKS} />
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        Preview · fictional team, fictional people · the drawer's Speed and Cadence tabs need a live backend and stay empty here; the EOD tab, the cards' EOD line, the Unlabeled panel and the connect ladder in settings are fixture data run through the real rule; assigning from the panel needs a live login and shows "Not authorised" here.
      </div>
      <SettersView bookings={BOOKINGS} sets={SETS} activity={ACTIVITY} speed={SPEED} cadence={CADENCE} checks={CHECKS} clerkId="preview" tab={tab} onTab={setTab} eodBoard={<p className="text-sm text-muted-foreground">The EODs board needs a live login.</p>} rangeStart={BOOKINGS.range.startMs} rangeEnd={BOOKINGS.range.endMs} />
    </div>
  );
}
