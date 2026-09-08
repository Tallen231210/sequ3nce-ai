// ============================================================================
// The color-aware half of the calendar upsert.
//
// googleCalendar.ts patches every synced field unconditionally, which is fine
// for titles and times but throws away the one thing a color rulebook needs:
// whether the color CHANGED since we last looked. These helpers sit in front
// of that patch/insert, compare old and new, append a history row when they
// differ, and hand back the fields to write. Why a separate module: the sync
// file is already long, and this logic wants reading on its own.
//
// Cost: a history insert only when the color differs from the previous sync;
// one indexed lookup per NEW event row (rare). Unchanged events write nothing.
// ============================================================================

import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type HistorySource = Doc<"calendarEventColorHistory">["source"];

/** What the sync just fetched for one event. */
export interface IncomingColor {
  eventColorId?: string;
  googleUpdatedAt?: number;
  title: string;
  startTime: number;
}

/** Where the event lives. */
export interface EventHome {
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  subscriptionId?: Id<"closerCalendarSubscriptions">;
  eventUid: string;
}

/** Latest history row for this event on this closer's calendar, if any. */
export async function lastColorHistoryFor(
  ctx: MutationCtx,
  closerId: Id<"closers">,
  eventUid: string,
): Promise<Doc<"calendarEventColorHistory"> | null> {
  return ctx.db
    .query("calendarEventColorHistory")
    .withIndex("by_closer_and_uid", (q) =>
      q.eq("closerId", closerId).eq("eventUid", eventUid),
    )
    .order("desc")
    .first();
}

async function appendHistory(
  ctx: MutationCtx,
  home: EventHome,
  incoming: IncomingColor,
  extra: {
    calendarEventId?: Id<"calendarEvents">;
    previousColorId?: string;
    observedAt: number;
    source: HistorySource;
  },
): Promise<void> {
  // The trail is a bonus on top of the sync, never a reason for it to fail:
  // this mutation also feeds the auto-join bots, and a calendar that stops
  // updating because an audit row couldn't be written would cost real calls.
  try {
    await ctx.db.insert("calendarEventColorHistory", {
      teamId: home.teamId,
      closerId: home.closerId,
      subscriptionId: home.subscriptionId,
      eventUid: home.eventUid,
      calendarEventId: extra.calendarEventId,
      title: incoming.title,
      eventStartTime: incoming.startTime,
      colorId: incoming.eventColorId,
      previousColorId: extra.previousColorId,
      observedAt: extra.observedAt,
      googleUpdatedAt: incoming.googleUpdatedAt,
      source: extra.source,
    });
  } catch (err) {
    console.error(
      `[ColorHistory] could not record ${home.eventUid}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * For a row we already hold: compare colors, log a change, and return the
 * color fields to include in the patch.
 *
 * `colorChangedAt` is set only when the row had been observed before. The
 * first time the color-aware sync sees a pre-existing row, whatever color it
 * carries is the present state, not a change we watched — logged as
 * "initial" so a history view can tell the two apart, and never treated as
 * "the closer recolored it".
 *
 * Keys are included only when they should be written: patching a key to
 * `undefined` deletes it in Convex, and a missing Google `updated` must not
 * erase the timestamp we already have.
 */
export async function colorPatchForExisting(
  ctx: MutationCtx,
  existing: Doc<"calendarEvents">,
  home: EventHome,
  incoming: IncomingColor,
  now: number,
): Promise<Partial<Doc<"calendarEvents">>> {
  const firstObs = existing.colorFirstObservedAt;
  const changed = existing.eventColorId !== incoming.eventColorId;

  if (changed) {
    await appendHistory(ctx, home, incoming, {
      calendarEventId: existing._id,
      previousColorId: existing.eventColorId,
      observedAt: now,
      source: firstObs === undefined ? "initial" : "sync",
    });
  }

  return {
    eventColorId: incoming.eventColorId,
    colorFirstObservedAt: firstObs ?? now,
    ...(incoming.googleUpdatedAt !== undefined
      ? { googleUpdatedAt: incoming.googleUpdatedAt }
      : {}),
    ...(changed && firstObs !== undefined ? { colorChangedAt: now } : {}),
  };
}

/**
 * Color fields for a brand-new row. No transition can have been observed,
 * so `colorChangedAt` stays unset.
 */
export function colorFieldsForInsert(
  incoming: IncomingColor,
  now: number,
): Pick<Doc<"calendarEvents">, "eventColorId" | "googleUpdatedAt" | "colorFirstObservedAt"> {
  return {
    eventColorId: incoming.eventColorId,
    googleUpdatedAt: incoming.googleUpdatedAt,
    colorFirstObservedAt: now,
  };
}

/**
 * After inserting a new row: log its color if it has one.
 *
 * The sync deletes a cancelled future event and re-inserts it if the closer
 * restores it, so "new row" does not mean "new event". Check the trail and
 * skip the row when the color is what we last recorded — otherwise every
 * restore would read as a fresh recolor.
 */
export async function recordInsertedColor(
  ctx: MutationCtx,
  home: EventHome,
  incoming: IncomingColor,
  calendarEventId: Id<"calendarEvents">,
  now: number,
): Promise<void> {
  if (incoming.eventColorId === undefined) return;
  const last = await lastColorHistoryFor(ctx, home.closerId, home.eventUid);
  if (last && last.colorId === incoming.eventColorId) return;
  await appendHistory(ctx, home, incoming, {
    calendarEventId,
    previousColorId: last?.colorId,
    observedAt: now,
    source: "sync",
  });
}
