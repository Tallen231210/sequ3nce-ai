// One-off demo data seeder for filming the B2C Personal app demo
// video on Zion's account. NOT for production use beyond the demo
// shoot — delete this file once the cleanup has run.
//
// Targets:
//   200 calls over the last 90 days
//   ~45% close rate (90 closed / 95 not-closed / 15 no-show)
//   $500,000 cash collected total
//   ~$5,500 avg deal size on closed deals
//   ~30 min avg call duration
//   ~48% closer talk ratio (good closers talk less)

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Hardcoded — this script writes ONLY to Zion's personal workspace.
// Any other closerId/teamId combo is rejected.
const ZION_CLOSER_ID = "jd71xk2j24e03tcrzwv8gwasc982tcnc" as Id<"closers">;
const ZION_TEAM_ID = "js79e7wyh83djyva8ht8xk9r3n82ttv9" as Id<"teams">;

const FIRST_NAMES = [
  "James", "Sarah", "Michael", "Jennifer", "Robert", "Linda", "David",
  "Patricia", "John", "Elizabeth", "William", "Barbara", "Richard",
  "Susan", "Joseph", "Jessica", "Thomas", "Karen", "Charles", "Nancy",
  "Christopher", "Lisa", "Daniel", "Margaret", "Matthew", "Betty",
  "Anthony", "Sandra", "Mark", "Ashley", "Donald", "Emily", "Steven",
  "Donna", "Paul", "Carol", "Andrew", "Ruth", "Joshua", "Sharon",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate `count` cash amounts summing to exactly `target`. Each
// amount rounds to nearest $100. Variance of ±40% so totals look
// natural (some $3k closes, some $9k closes) rather than every deal
// hitting the same number.
function generateCashAmounts(count: number, target: number): number[] {
  const baseline = target / count;
  const amounts: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    const variance = 0.6 + Math.random() * 0.8;
    amounts.push(Math.max(500, Math.round((baseline * variance) / 100) * 100));
  }
  const sum = amounts.reduce((a, b) => a + b, 0);
  const remainder = Math.max(500, Math.round((target - sum) / 100) * 100);
  amounts.push(remainder);
  return amounts;
}

/**
 * Seeds ~200 fake calls onto Zion's personal workspace. Returns the
 * list of inserted IDs — caller MUST save this list so cleanup can
 * find what to delete later.
 */
export const seedZionDemoCalls = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

    // 90 closed + 95 not_closed + 15 no_show = 200 total
    // Close rate (excluding no-shows): 90 / 185 = 48.6%
    // Close rate (incl. no-shows): 90 / 200 = 45%
    const outcomes: string[] = [
      ...Array(90).fill("closed"),
      ...Array(95).fill("not_closed"),
      ...Array(15).fill("no_show"),
    ];
    // Fisher-Yates shuffle so outcomes spread randomly across time.
    for (let i = outcomes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
    }

    const cashAmounts = generateCashAmounts(90, 500_000);
    let cashIdx = 0;

    const insertedIds: Id<"calls">[] = [];

    for (const outcome of outcomes) {
      const startedAt =
        ninetyDaysAgo + Math.floor(Math.random() * (now - ninetyDaysAgo));

      // No-shows are short (prospect doesn't show), real calls are
      // 25-45 min.
      const duration =
        outcome === "no_show" ? rand(120, 300) : rand(1500, 2700);
      const endedAt = startedAt + duration * 1000;

      // Closer talk time 42-54% of the call. Healthy ratio for
      // discovery-heavy sales.
      const closerTalkTime = Math.floor(
        duration * (0.42 + Math.random() * 0.12),
      );
      const prospectTalkTime = duration - closerTalkTime;

      const cashCollected = outcome === "closed" ? cashAmounts[cashIdx++] : 0;
      const contractValue = cashCollected;

      const id = await ctx.db.insert("calls", {
        closerId: ZION_CLOSER_ID,
        teamId: ZION_TEAM_ID,
        prospectName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        status: "completed",
        outcome,
        cashCollected,
        contractValue,
        dealValue: contractValue,
        startedAt,
        endedAt,
        duration,
        speakerCount: 2,
        recordingType: "video",
        closerTalkTime,
        prospectTalkTime,
        completedAt: endedAt + 60_000,
        createdAt: startedAt,
      });

      insertedIds.push(id);
    }

    return {
      inserted: insertedIds.length,
      ids: insertedIds,
      summary: {
        totalCalls: 200,
        closed: 90,
        notClosed: 95,
        noShow: 15,
        cashCollectedTarget: 500_000,
      },
    };
  },
});

/**
 * Delete a list of demo call IDs. Pass the `ids` array returned from
 * the seed mutation. Refuses to delete any call whose closerId is not
 * Zion's — defensive guard against accidentally wiping real data.
 */
export const cleanupZionDemoCalls = mutation({
  args: { ids: v.array(v.id("calls")) },
  handler: async (ctx, args) => {
    let deleted = 0;
    let skipped = 0;
    for (const id of args.ids) {
      const call = await ctx.db.get(id);
      if (!call) {
        skipped++;
        continue;
      }
      if (call.closerId !== ZION_CLOSER_ID) {
        skipped++;
        continue;
      }
      await ctx.db.delete(id);
      deleted++;
    }
    return { deleted, skipped };
  },
});

/**
 * Cleanup by recency — deletes every call on Zion's closer that was
 * created after `createdAfter` ms (epoch). Safer than tracking IDs by
 * hand: we just pass the timestamp we ran the seed at, and it sweeps
 * everything created since. Hardcoded closerId guard prevents
 * accidentally hitting another closer's data.
 */
export const cleanupZionDemoCallsAfter = mutation({
  args: { createdAfter: v.number() },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", ZION_CLOSER_ID))
      .collect();

    let deleted = 0;
    for (const call of calls) {
      if (call._creationTime >= args.createdAfter) {
        await ctx.db.delete(call._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

/**
 * List Zion's demo calls created after a timestamp. Pure read,
 * useful for sanity-checking before running the destructive cleanup.
 */
export const listZionDemoCallsAfter = mutation({
  args: { createdAfter: v.number() },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", ZION_CLOSER_ID))
      .collect();

    const recent = calls.filter((c) => c._creationTime >= args.createdAfter);
    return {
      total: recent.length,
      sample: recent.slice(0, 3).map((c) => ({
        _id: c._id,
        prospectName: c.prospectName,
        outcome: c.outcome,
        cashCollected: c.cashCollected,
        createdAt: new Date(c._creationTime).toISOString(),
      })),
    };
  },
});
