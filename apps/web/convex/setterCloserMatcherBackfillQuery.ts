// V8 internalQuery + internalMutation backing setterCloserMatcherBackfill.
// Split out because the action uses @sentry/node (Node runtime), but the
// DB reads/writes must run in the V8 isolate.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { normalizeEmail, normalizePhone } from "./setterCloserMatcher";

/**
 * Fetch a page of calls for this team starting after the cursor, joining
 * scheduledCalls / calendarEvents to derive the prospect identity. Returns
 * the rows that NEED patching alongside their derived identity values.
 */
export const fetchUnpatchedBatch = internalQuery({
  args: {
    teamId: v.id("teams"),
    cursorStartedAt: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date", (q: any) =>
        q.eq("teamId", args.teamId).gt("createdAt", args.cursorStartedAt),
      )
      .order("asc")
      .take(args.limit);

    // alreadyPopulated rows: existing prospectEmail in DB — the action
    // skips these but uses their cursor position to advance.
    // toPatch rows: prospectEmail was NULL in DB but we derived a value.
    // The action patches these.
    // No row is returned when we couldn't derive AND nothing's stored — the
    // action's cursor still advances via the highest createdAt seen.
    const out: Array<{
      _id: string;
      startedAt: number | undefined;
      action: "skip-already-populated" | "patch" | "skip-no-derivation";
      derivedEmail: string | null;
      derivedPhone: string | null;
    }> = [];

    // Cache the closer→events lookup across the batch — most batches will
    // span 1-3 closers and we'd otherwise re-fetch their full event list
    // per call (expensive).
    const closerEventsCache = new Map<string, any[]>();
    async function getCloserEvents(closerId: any) {
      const key = String(closerId);
      const cached = closerEventsCache.get(key);
      if (cached) return cached;
      const events = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer", (q: any) => q.eq("closerId", closerId))
        .collect();
      closerEventsCache.set(key, events);
      return events;
    }

    for (const call of calls) {
      if (call.prospectEmail) {
        out.push({
          _id: String(call._id),
          startedAt: call.createdAt,
          action: "skip-already-populated",
          derivedEmail: null,
          derivedPhone: null,
        });
        continue;
      }

      let derivedEmail: string | null = null;
      const derivedPhone: string | null = null;

      // Try scheduledCalls first (most reliable — Calendly/manual).
      if (call.scheduledCallId) {
        const sched = await ctx.db.get(call.scheduledCallId);
        if (sched && (sched as { prospectEmail?: string }).prospectEmail) {
          derivedEmail =
            (sched as { prospectEmail?: string }).prospectEmail ?? null;
        }
      }

      // Fall back to the explicit calendarEventId join.
      if (!derivedEmail && call.calendarEventId) {
        const evt = await ctx.db.get(call.calendarEventId);
        if (
          evt &&
          (evt as { attendees?: Array<{ email: string; isOrganizer?: boolean }> })
            .attendees
        ) {
          const attendees =
            (evt as { attendees?: Array<{ email: string; isOrganizer?: boolean }> })
              .attendees ?? [];
          const guest = attendees.find((a) => a.isOrganizer !== true);
          derivedEmail = (guest ?? attendees[0])?.email ?? null;
        }
      }

      // Last resort: time-based inference. For calls where the desktop app
      // didn't denormalize the event link, look up the closer's calendar
      // events within ±45 min of call.startedAt and pick the closest one
      // with attendees. Discovered 2026-05-31: AICom's setup matches this
      // case for ~all calls. Bounded scan (closer index), so cost stays
      // proportional to the closer's recent event volume — not the whole team's.
      if (!derivedEmail && call.startedAt && call.closerId) {
        const closerEvents = await getCloserEvents(call.closerId);
        const WINDOW_MS = 45 * 60 * 1000;
        const callStart = call.startedAt;
        let best:
          | { event: any; deltaMs: number }
          | null = null;
        for (const evt of closerEvents) {
          const attendees =
            (evt as { attendees?: Array<{ email: string; isOrganizer?: boolean }> })
              .attendees ?? [];
          if (attendees.length === 0) continue;
          const delta = Math.abs(evt.startTime - callStart);
          if (delta > WINDOW_MS) continue;
          if (!best || delta < best.deltaMs) {
            best = { event: evt, deltaMs: delta };
          }
        }
        if (best) {
          const attendees =
            (best.event as { attendees?: Array<{ email: string; isOrganizer?: boolean }> })
              .attendees ?? [];
          const guest = attendees.find((a) => a.isOrganizer !== true);
          derivedEmail = (guest ?? attendees[0])?.email ?? null;
        }
      }

      const normEmail = normalizeEmail(derivedEmail);
      const normPhone = normalizePhone(derivedPhone);
      out.push({
        _id: String(call._id),
        startedAt: call.createdAt,
        action: normEmail || normPhone ? "patch" : "skip-no-derivation",
        derivedEmail: normEmail,
        derivedPhone: normPhone,
      });
    }

    return out;
  },
});

/**
 * Patch a batch of calls with their derived prospect identity. Idempotent
 * inside the patch — only writes the fields when they differ from what's
 * already there.
 */
export const patchBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        callId: v.string(),
        prospectEmail: v.union(v.string(), v.null()),
        prospectPhone: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const item of args.items) {
      const patch: Record<string, unknown> = {};
      if (item.prospectEmail) patch.prospectEmail = item.prospectEmail;
      if (item.prospectPhone) patch.prospectPhone = item.prospectPhone;
      if (Object.keys(patch).length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.db.patch(item.callId as any, patch);
    }
  },
});
