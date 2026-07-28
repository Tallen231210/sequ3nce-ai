// ============================================================================
// The daily nudge.
//
// The queue on the dashboard only works on a closer who opens the app, and on
// the tiers without our bot they have little reason to — the recording happens
// elsewhere, or there is no recording at all. Calls would sit unanswered and
// the scoreboard would stay empty while everyone assumed it was working.
//
// One email a day, only to people who actually have something outstanding.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/** Below this it isn't worth an email; they'll catch it next time they log in. */
const MIN_CALLS_TO_NUDGE = 1;

/**
 * Who has calls waiting.
 *
 * Scoped by "has calls needing an outcome", not by "has Fathom connected".
 *
 * The Fathom version was a real bug: Overview teams have no Fathom connection
 * by definition, so the tier that depends MOST on closers reporting outcomes —
 * it has no recording at all, the queue is the only way numbers ever arrive —
 * was the one tier that never got reminded. Opt-in is still what protects
 * people's inboxes; the connection was never the right gate.
 */
export const findClosersToNudge = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Array<{
      closerId: string;
      email: string;
      name: string;
      waiting: number;
    }> = [];

    // Only closers who opted in — that list is short, and starting from it
    // avoids walking every team on every run.
    const CAP = 1000;
    const scanned = await ctx.db.query("closers").take(CAP);
    if (scanned.length === CAP) {
      console.error(
        `[fathom] hit the ${CAP}-closer cap while finding reminder ` +
          `recipients — some opted-in closers are being skipped.`,
      );
    }
    const optedIn = scanned.filter((c) => c.outcomeRemindersEnabled === true);
    if (optedIn.length === 0) return [];

    {
      const closers = optedIn;

      for (const closer of closers) {
        // Only people actually working here. A deactivated closer must not
        // receive mail from us, and a pending one has never signed in.
        if (!closer.email || closer.status !== "active") continue;
        // And only people who asked for it. Opt-in, so absent means no.
        if (closer.outcomeRemindersEnabled !== true) continue;
        const calls = await ctx.db
          .query("calls")
          .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
          .order("desc")
          .take(200);
        const waiting = calls.filter(
          (c) =>
            (c.source === "fathom" || c.source === "calendar") &&
            !c.outcome &&
            c.classifiedAs !== "internal" &&
            c.duration !== undefined,
        ).length;
        if (waiting >= MIN_CALLS_TO_NUDGE) {
          out.push({
            closerId: String(closer._id),
            email: closer.email,
            name: closer.name ?? "there",
            waiting,
          });
        }
      }
    }
    return out;
  },
});

/**
 * Send one closer their reminder.
 *
 * Deliberately plain. This is a nudge, not a report — the numbers live in the
 * app, and an email that tries to be a dashboard gets filtered as marketing.
 */
export const sendNudge = internalAction({
  args: { email: v.string(), name: v.string(), waiting: v.number() },
  handler: async (ctx, args): Promise<{ sent: boolean }> => {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error("[fathom] RESEND_API_KEY not configured — no nudge sent");
      return { sent: false };
    }

    const n = args.waiting;
    const subject =
      n === 1 ? "1 call needs an outcome" : `${n} calls need an outcome`;
    const firstName = args.name.split(" ")[0] || "there";

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#111;line-height:1.55;max-width:520px">
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>
          You have <strong>${n} ${n === 1 ? "call" : "calls"}</strong> waiting
          on an outcome. They don't count toward your numbers until you say how
          they went.
        </p>
        <p style="margin:22px 0">
          <a href="https://sequ3nce.ai/app/dashboard"
             style="background:#000;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">
            Add outcomes
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          Takes about fifteen seconds each.
        </p>
      </div>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Sequ3nce <noreply@noreply.sequ3nce.ai>",
          to: args.email,
          subject,
          html,
        }),
      });
      if (!res.ok) {
        console.error(`[fathom] nudge to ${args.email} failed: ${res.status}`);
        return { sent: false };
      }
      return { sent: true };
    } catch (error) {
      console.error(`[fathom] nudge to ${args.email} threw:`, error);
      return { sent: false };
    }
  },
});

/**
 * The daily run.
 *
 * One pass, one email each, and a failure for one person cannot stop the rest.
 */
export const runDailyNudges = internalAction({
  args: {},
  handler: async (ctx): Promise<{ candidates: number; sent: number }> => {
    const people = await ctx.runQuery(
      internal.fathomNudge.findClosersToNudge,
      {},
    );

    let sent = 0;
    for (const person of people) {
      try {
        const result = await ctx.runAction(internal.fathomNudge.sendNudge, {
          email: person.email,
          name: person.name,
          waiting: person.waiting,
        });
        if (result.sent) sent++;
      } catch (error) {
        console.error(`[fathom] nudge failed for ${person.email}:`, error);
      }
    }
    return { candidates: people.length, sent };
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
