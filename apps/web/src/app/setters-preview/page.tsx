"use client";

// Dev-only preview of the Setters page on fictional data — the localhost
// review surface. 404 in production, like st-preview.

import { notFound } from "next/navigation";
import { SettersView } from "../dashboard/setters/components/SettersView";
import { ACTIVITY, BOOKINGS, SETS } from "./fixture";

export default function SettersPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        Preview · fictional team, fictional people · the drawer's Speed and EOD tabs need a live backend and stay empty here.
      </div>
      <SettersView bookings={BOOKINGS} sets={SETS} activity={ACTIVITY} clerkId="preview" rangeStart={BOOKINGS.range.startMs} rangeEnd={BOOKINGS.range.endMs} />
    </div>
  );
}
