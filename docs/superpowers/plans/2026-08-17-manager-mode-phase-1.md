# Manager Mode Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sales manager connects their Google Calendar inside a new Manager Mode tab, an MGMT-branded bot joins every meeting on it, and the recordings and transcripts appear in that tab.

**Architecture:** Manager meetings live in new tables keyed on the manager's `users` id, never on `closerId`. Nothing in the existing closer pipeline is modified — the manager scheduler is a second, separate cron pass. Calendar OAuth reuses the existing Google flow with a manager-tagged `state` parameter.

**Tech Stack:** Convex (queries/mutations/actions/crons), Next.js App Router, Clerk auth, Recall.ai bots, Google Calendar API, Playwright for E2E.

## Global Constraints

- **Zero regression.** No existing table loses a field or changes a field's type. No existing function's behaviour changes. Task 1 captures a baseline; Task 12 proves it.
- **Additive schema only.** New tables and new optional fields. Never remove or rename.
- Convex per-transaction limits: 32k docs scanned, 16 MiB read, 4,096 queries, 1s for queries.
- Crons use `crons.cron`, never `crons.interval`.
- Production deployment is `ideal-ram-982`. All CLI verification uses `--prod`.
- Convex deploys from **disk**, not from the checked-out branch. Never deploy with unrelated work in the tree.
- User-facing errors thrown from Convex must be `ConvexError`, never `Error` — plain Errors are stripped to "Server Error" before reaching the browser.
- Overwatch teams only, matching the closer bot's gating.
- No file over ~300 lines. Split by responsibility.

---

## File Structure

**New — Convex:**

| File | Responsibility |
|---|---|
| `convex/managerBotAvatar.ts` | the MGMT avatar as a base64 JPEG constant, nothing else |
| `convex/managerCalendar.ts` | connect/disconnect a manager's Google Calendar; read connection state |
| `convex/managerCalendarSync.ts` | pull events from Google into `managerCalendarEvents` |
| `convex/managerMeetingBot.ts` | create, cancel and track bots for manager meetings |
| `convex/managerMeetingBotSchedule.ts` | the cron pass that schedules bots from upcoming events |
| `convex/managerMeetingTranscript.ts` | fetch and store transcripts from Recall |
| `convex/managerMeetingQueries.ts` | read manager meetings for the tab |

**New — frontend:**

| File | Responsibility |
|---|---|
| `src/app/dashboard/manager-mode/page.tsx` | the tab shell |
| `src/app/dashboard/manager-mode/components/ConnectCalendar.tsx` | connect / disconnect state |
| `src/app/dashboard/manager-mode/components/MeetingsList.tsx` | recordings list |
| `tests/e2e/manager-mode.spec.ts` | E2E coverage |

**Modified:**

| File | Change |
|---|---|
| `convex/schema.ts` | new tables + new optional fields on `users` and `teams` |
| `convex/crons.ts` | one new cron entry |
| `convex/http.ts` | one new webhook branch for manager bots |
| `src/app/api/auth/google/authorize/route.ts` | accept a manager id as well as a closer id |
| `src/app/api/auth/google/callback/route.ts` | route manager callbacks to the manager mutation |
| `src/components/dashboard/sidebar.tsx` | the nav item |

---

## Task 1: Capture the non-regression baseline

Nothing is built here. This exists so that "did we break anything?" has an answer rather than an opinion.

**Files:**
- Create: `docs/superpowers/plans/baselines/2026-08-17-pre-manager-mode.json`

**Interfaces:**
- Produces: a JSON snapshot later compared by Task 12.

- [ ] **Step 1: Snapshot the live numbers for a real team**

```bash
cd apps/web
T=js728xjb1vdxcfcsxcwme62eh589977x   # ManyJobs
mkdir -p ../../docs/superpowers/plans/baselines
{
  echo "{"
  echo '"teamPerformance":'
  npx convex run --prod closerScorecardData:getCloserScorecardData \
    "{\"teamId\":\"$T\",\"dayKey\":\"2026-08-14\",\"monthKey\":\"2026-08\"}"
  echo ',"eodNudge":'
  npx convex run --prod eodNudge:getEodNudgeData "{\"teamId\":\"$T\",\"dayKey\":\"2026-08-14\"}"
  echo "}"
} > ../../docs/superpowers/plans/baselines/2026-08-17-pre-manager-mode.json
```

- [ ] **Step 2: Record the row counts that must not move**

```bash
cd apps/web
for T in closers calls meetingBots calendarEvents closerCalendarSubscriptions; do
  printf "%s " "$T"
  npx convex data $T --prod --limit 2000 2>/dev/null | grep -c '|'
done
```

Paste the output into the baseline file under a `"rowCounts"` key. These are the tables a mistake would most likely corrupt.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/baselines/
git commit -m "Baseline before Manager Mode, so regression is measurable"
```

---

## Task 2: Schema — manager calendar fields and the new tables

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Produces: tables `managerCalendarSubscriptions`, `managerCalendarEvents`, `managerMeetings`, `managerMeetingTranscripts`, `managerMeetingBots`; new optional fields on `users` and `teams`.

- [ ] **Step 1: Add manager calendar fields to `users`**

Find `users: defineTable({` and add before the closing `})`:

```ts
    // ---- Manager Mode: the manager's own calendar ----
    // Managers had no calendar concept before this. All optional so every
    // existing row still validates.
    googleCalendarRefreshToken: v.optional(v.string()),
    calendarProvider: v.optional(v.string()),      // "google"
    calendarConnectedAt: v.optional(v.number()),
    calendarOnboardingCompleted: v.optional(v.boolean()),
    /** Defaults ON at connect time, never a bare true — see closers. */
    managerAutoJoinEnabled: v.optional(v.boolean()),
```

- [ ] **Step 2: Add the manager bot name to `teams`**

Find `meetingBotName` in `teams` and add directly beneath it:

```ts
    /**
     * Name shown for the MANAGER bot. Separate from meetingBotName because
     * both bots can be in the same meeting, and two identically-named
     * participants is the moment a manager stops trusting either.
     */
    managerMeetingBotName: v.optional(v.string()),
```

- [ ] **Step 3: Add the five new tables**

Add at the end of the schema object, before the final `});`:

```ts
  // ==========================================================================
  // Manager Mode
  //
  // Deliberately separate from calls/meetingBots/calendarEvents rather than
  // reusing them with a manager flag. 83 places enumerate closers, 57 scoped
  // by team — leaderboards, seat counts, the nudge, the scoreboard, billing.
  // A manager hidden among closers needs an exclusion at every one of them,
  // silently, forever. These tables cannot leak because no closer-scoped
  // query can reach them.
  // ==========================================================================

  managerCalendarSubscriptions: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    googleCalendarId: v.string(), // Google's own id — never rewritten by us
    label: v.string(),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_team", ["teamId"]),

  managerCalendarEvents: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    uid: v.string(), // Google event id, for dedup across syncs
    title: v.string(),
    description: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    isAllDay: v.optional(v.boolean()),
    attendees: v.optional(v.string()), // raw JSON; only 16% of events carry any
    excluded: v.optional(v.boolean()), // manager pressed "don't record"
    fetchedAt: v.number(),
  })
    .index("by_user_and_start", ["userId", "startTime"])
    .index("by_uid", ["uid"]),

  managerMeetings: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    calendarEventId: v.optional(v.id("managerCalendarEvents")),
    title: v.string(),
    meetingUrl: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    duration: v.optional(v.number()), // seconds
    recordingUrl: v.optional(v.string()),
    status: v.string(), // "recording" | "completed" | "failed"
    createdAt: v.number(),
  })
    .index("by_user_and_created", ["userId", "createdAt"])
    .index("by_team", ["teamId"]),

  // Transcripts get their own table rather than reusing transcriptSegments,
  // which keys on `callId: v.id("calls")` and cannot hold a manager meeting.
  // Widening that pointer is phase 4 work; phase 1 must not depend on it.
  managerMeetingTranscripts: defineTable({
    meetingId: v.id("managerMeetings"),
    userId: v.id("users"),
    speaker: v.string(),
    text: v.string(),
    startSeconds: v.number(),
    endSeconds: v.optional(v.number()),
  }).index("by_meeting", ["meetingId"]),

  managerMeetingBots: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    calendarEventId: v.id("managerCalendarEvents"),
    meetingId: v.optional(v.id("managerMeetings")),
    recallBotId: v.string(),
    meetingUrl: v.string(),
    meetingTitle: v.string(),
    scheduledStartTime: v.number(),
    status: v.string(), // "scheduled" | "joining" | "active" | "completed" | "failed" | "cancelled"
    joinedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_recall_bot_id", ["recallBotId"])
    .index("by_user", ["userId"])
    // Dedup is on the calendar EVENT, never the meeting URL — one personal
    // meeting room hosts many different meetings.
    .index("by_calendar_event", ["calendarEventId"]),
```

- [ ] **Step 4: Verify the schema is accepted and nothing existing broke**

```bash
cd apps/web
npx tsc --noEmit
npx convex deploy --yes
```

Expected: `Schema validation complete.` and a successful deploy. Convex validates every existing row against the new schema — if any existing table were narrowed, this fails here.

- [ ] **Step 5: Commit**

```bash
git add apps/web/convex/schema.ts
git commit -m "Manager Mode schema: managers get a calendar, meetings get their own tables"
```

---

## Task 3: The MGMT bot avatar

**Files:**
- Create: `convex/managerBotAvatar.ts`

**Interfaces:**
- Produces: `MANAGER_BOT_AVATAR_JPEG_B64: string`

- [ ] **Step 1: Encode the prepared asset into a constant**

The image already exists at `docs/superpowers/specs/mgmt-bot-avatar.jpg` (1280×720, 32 KB, reads SEQU3NCE.AI / MGMT / [● REC]).

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
python3 - <<'PY'
import base64
b64 = base64.b64encode(open("docs/superpowers/specs/mgmt-bot-avatar.jpg","rb").read()).decode()
open("apps/web/convex/managerBotAvatar.ts","w").write(
'''/**
 * The MGMT bot's in-call tile, base64 JPEG, 1280x720.
 *
 * Same format and dimensions as the closer bot's avatar so both crop the same
 * way in Meet and Zoom. Carries a [# REC] indicator, which is how anyone in
 * the room — including a job candidate who has never seen this product —
 * knows a recording is happening, for the whole meeting rather than a banner
 * they might miss.
 */
export const MANAGER_BOT_AVATAR_JPEG_B64 =
  "''' + b64 + '''";
''')
print("written", len(b64), "base64 chars")
PY
```

- [ ] **Step 2: Verify it decodes back to a valid 1280×720 JPEG**

```bash
cd apps/web
python3 - <<'PY'
import re,base64,io
from PIL import Image
s=open('convex/managerBotAvatar.ts').read()
b=base64.b64decode(re.search(r'"([A-Za-z0-9+/=]{500,})"',s).group(1))
im=Image.open(io.BytesIO(b))
print("decoded OK:", im.format, im.size)
assert im.size == (1280,720), "wrong dimensions"
PY
npx tsc --noEmit
```

Expected: `decoded OK: JPEG (1280, 720)` and a clean typecheck.

- [ ] **Step 3: Commit**

```bash
git add apps/web/convex/managerBotAvatar.ts
git commit -m "MGMT bot avatar, with the REC indicator that makes recording obvious in-room"
```

---

## Task 4: Connect and disconnect a manager's calendar

**Files:**
- Create: `convex/managerCalendar.ts`
- Test: verified via `npx convex run --prod`

**Interfaces:**
- Consumes: `resolveAuthUser` from `./setterGhlOauth`
- Produces:
  - `getManagerCalendarState({ clerkId }) → { connected, connectedAt, autoJoin, canConnect } | null`
  - `saveManagerGoogleConnection({ userId, refreshToken })` (internalMutation)
  - `disconnectManagerCalendar({ clerkId })`
  - `setManagerAutoJoin({ clerkId, enabled })`

- [ ] **Step 1: Write the module**

```ts
import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";

/**
 * A manager's own calendar connection.
 *
 * Mirrors calendarOAuth.ts for closers, with one deliberate difference: the
 * identity is a `users` row, so nothing here can touch a closer record.
 */

export const getManagerCalendarState = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    return {
      userId: user._id,
      connected: !!user.googleCalendarRefreshToken,
      connectedAt: user.calendarConnectedAt ?? null,
      autoJoin: user.managerAutoJoinEnabled ?? false,
      // Overwatch only, matching the closer bot's gating.
      canConnect: (team?.productTier ?? null) === "overwatch",
    };
  },
});

export const saveManagerGoogleConnection = internalMutation({
  args: { userId: v.id("users"), refreshToken: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("No such manager");
    await ctx.db.patch(args.userId, {
      googleCalendarRefreshToken: args.refreshToken,
      calendarProvider: "google",
      calendarConnectedAt: Date.now(),
      // `?? true`, never a bare true: a manager who deliberately switched
      // recording off and later reconnects must not be silently switched on.
      managerAutoJoinEnabled: user.managerAutoJoinEnabled ?? true,
    });
    return { success: true };
  },
});

export const disconnectManagerCalendar = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    await ctx.db.patch(user._id, {
      googleCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarConnectedAt: undefined,
      calendarOnboardingCompleted: undefined,
    });
    return { success: true };
  },
});

export const setManagerAutoJoin = mutation({
  args: { clerkId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    await ctx.db.patch(user._id, { managerAutoJoinEnabled: args.enabled });
    return { success: true };
  },
});
```

- [ ] **Step 2: Deploy and verify the read path against a real manager**

```bash
cd apps/web
npx tsc --noEmit && npx convex deploy --yes
npx convex run --prod managerCalendar:getManagerCalendarState \
  '{"clerkId":"user_3HEfyNvA2z4EtB7jno1ul81AMTY"}'
```

Expected: an object with `connected: false`, `autoJoin: false`, and `canConnect` reflecting that team's tier. A `null` means auth resolution failed — check the clerkId exists in `users`.

- [ ] **Step 3: Verify no closer was touched**

```bash
cd apps/web
npx convex data closers --prod --limit 1000 2>/dev/null | grep -c '|'
```

Expected: identical to the count recorded in Task 1.

- [ ] **Step 4: Commit**

```bash
git add apps/web/convex/managerCalendar.ts
git commit -m "A manager can hold a calendar connection of their own"
```

---

## Task 5: Route Google OAuth for managers

The existing authorize route requires `closerId` and encodes state as `closerId::app::label`. Managers need their own branch without disturbing that.

**Files:**
- Modify: `src/app/api/auth/google/authorize/route.ts`
- Modify: `src/app/api/auth/google/callback/route.ts`

**Interfaces:**
- Consumes: `saveManagerGoogleConnection` from Task 4
- Produces: `/api/auth/google/authorize?managerId=<usersId>` starts a manager connection

- [ ] **Step 1: Accept a manager id in the authorize route**

In `route.ts`, replace the `closerId` guard:

```ts
  const closerId = url.searchParams.get("closerId");
  const managerId = url.searchParams.get("managerId");

  if (!closerId && !managerId) {
    return NextResponse.json(
      { error: "Missing closerId or managerId" },
      { status: 400 },
    );
  }
```

Then replace the state construction:

```ts
  // Manager state is prefixed so the callback can tell the two apart without
  // guessing from id shape. Closer state is byte-for-byte unchanged — the
  // desktop app builds these URLs and installed builds must keep working.
  let state: string;
  if (managerId) {
    state = `mgr::${managerId}`;
  } else {
    state = closerId!;
    if (app) state += `::${app}`;
    else state += `::`;
    if (calendarLabel) state += `::${encodeURIComponent(calendarLabel)}`;
  }
```

- [ ] **Step 2: Handle the manager branch in the callback**

In the callback route, immediately after the state is read and before any existing closer parsing:

```ts
  // Manager connections short-circuit here. Everything below this block is
  // the untouched closer path.
  if (state?.startsWith("mgr::")) {
    const managerId = state.slice(5);
    await convex.mutation(internal.managerCalendar.saveManagerGoogleConnection, {
      userId: managerId as Id<"users">,
      refreshToken: tokens.refresh_token,
    });
    return NextResponse.redirect(
      new URL("/dashboard/manager-mode?connected=1", req.url),
    );
  }
```

- [ ] **Step 3: Verify the closer path is byte-identical**

```bash
cd apps/web
npx tsc --noEmit
curl -s -o /dev/null -w "closer authorize: %{http_code}\n" \
  "http://localhost:3000/api/auth/google/authorize?closerId=jd7c39wxd1h9jyn5tnzaqjxrs58995ks"
curl -s -o /dev/null -w "missing both:     %{http_code}\n" \
  "http://localhost:3000/api/auth/google/authorize"
```

Expected: `307` for the closer (unchanged redirect to Google), `400` when neither id is given.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/auth/google/
git commit -m "Google OAuth can now identify a manager, without changing the closer path"
```

---

## Task 6: Sync a manager's calendar events

**Files:**
- Create: `convex/managerCalendarSync.ts`

**Interfaces:**
- Consumes: `saveManagerGoogleConnection`'s stored refresh token
- Produces: `syncManagerCalendar({ userId })` (internalAction) → `{ fetched, upserted }`

- [ ] **Step 1: Write the sync**

Mirror `googleCalendar.ts`'s token exchange and event fetch. Key rules, all learned from the closer bot:

```ts
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** How far ahead we look. Matches the closer scheduler's horizon. */
const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

export const getManagerForSync = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => await ctx.db.get(args.userId),
});

export const upsertManagerEvent = internalMutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
    uid: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    isAllDay: v.optional(v.boolean()),
    attendees: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("managerCalendarEvents")
      .withIndex("by_uid", (q) => q.eq("uid", args.uid))
      .first();
    const now = Date.now();
    if (existing) {
      // Preserve `excluded` — a manager who said "don't record this" must not
      // have that undone by the next sync.
      await ctx.db.patch(existing._id, { ...args, fetchedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("managerCalendarEvents", { ...args, fetchedAt: now });
  },
});
```

The action itself: exchange the refresh token for an access token, call
`https://www.googleapis.com/calendar/v3/calendars/primary/events` with
`timeMin=now`, `timeMax=now+LOOKAHEAD_MS`, `singleEvents=true`,
`orderBy=startTime`, then for each item:

- skip when `event.status === "cancelled"` or the summary starts with `Canceled:`
- skip all-day events (`start.date` present rather than `start.dateTime`)
- extract the meeting URL from `hangoutLink`, `conferenceData`, or a URL in the description
- upsert via `upsertManagerEvent`

- [ ] **Step 2: Deploy and dry-run against a connected manager**

```bash
cd apps/web
npx tsc --noEmit && npx convex deploy --yes
npx convex run --prod managerCalendarSync:syncManagerCalendar '{"userId":"<a connected manager>"}'
```

Expected: `{ fetched: N, upserted: N }` with N > 0 once a real calendar is connected. Before any manager has connected, expect a clean `{ fetched: 0, upserted: 0 }` rather than a throw.

- [ ] **Step 3: Confirm the events landed and look sane**

```bash
cd apps/web
npx convex data managerCalendarEvents --prod --limit 20
```

Check: titles are real, `startTime` values are in the future, no all-day rows, no `Canceled:` rows.

- [ ] **Step 4: Commit**

```bash
git add apps/web/convex/managerCalendarSync.ts
git commit -m "Read a manager's upcoming meetings from Google"
```

---

## Task 7: Create an MGMT bot for a manager meeting

**Files:**
- Create: `convex/managerMeetingBot.ts`

**Interfaces:**
- Consumes: `MANAGER_BOT_AVATAR_JPEG_B64` (Task 3), `managerCalendarEvents` (Task 6)
- Produces: `createManagerBot({ calendarEventId }) → { botId } | { skipped: string }`

- [ ] **Step 1: Write the bot creator**

```ts
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { MANAGER_BOT_AVATAR_JPEG_B64 } from "./managerBotAvatar";

const RECALL_BASE = "https://us-west-2.recall.ai/api/v1";

export const createManagerBot = internalAction({
  args: { calendarEventId: v.id("managerCalendarEvents") },
  handler: async (ctx, args): Promise<{ botId?: string; skipped?: string }> => {
    const ev = await ctx.runQuery(internal.managerMeetingBot.getEvent, {
      calendarEventId: args.calendarEventId,
    });
    if (!ev) return { skipped: "event gone" };
    if (ev.excluded) return { skipped: "manager excluded this meeting" };
    if (!ev.meetingUrl) return { skipped: "no meeting url" };

    // Dedup on the calendar EVENT, never the URL — one personal meeting room
    // hosts many different meetings, and keying on the URL silently skipped
    // 13 of 14 real meetings when the closer bot did it.
    const existing = await ctx.runQuery(internal.managerMeetingBot.getBotForEvent, {
      calendarEventId: args.calendarEventId,
    });
    if (existing) return { skipped: "already scheduled" };

    const team = await ctx.runQuery(internal.managerMeetingBot.getTeam, {
      teamId: ev.teamId,
    });
    const botName = team?.managerMeetingBotName || "Sequ3nce MGMT";

    const res = await fetch(`${RECALL_BASE}/bot/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.RECALL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meeting_url: ev.meetingUrl,
        bot_name: botName,
        // Without join_at the bot dispatches immediately and sits in an empty
        // room until it times out. This is why the closer bot was disabled for
        // eight months.
        join_at: new Date(ev.startTime).toISOString(),
        automatic_video_output: {
          in_call_recording: { kind: "jpeg", b64_data: MANAGER_BOT_AVATAR_JPEG_B64 },
          in_call_not_recording: { kind: "jpeg", b64_data: MANAGER_BOT_AVATAR_JPEG_B64 },
        },
        automatic_leave: { everyone_left_timeout: 15 },
      }),
    });
    if (!res.ok) {
      throw new Error(`Recall rejected the bot: ${res.status} ${await res.text()}`);
    }
    const bot = await res.json();
    await ctx.runMutation(internal.managerMeetingBot.recordBot, {
      userId: ev.userId,
      teamId: ev.teamId,
      calendarEventId: args.calendarEventId,
      recallBotId: bot.id,
      meetingUrl: ev.meetingUrl,
      meetingTitle: ev.title,
      scheduledStartTime: ev.startTime,
    });
    return { botId: bot.id };
  },
});
```

Add the three internal helpers it calls (`getEvent`, `getBotForEvent`, `getTeam`) and `recordBot`, which inserts into `managerMeetingBots` with `status: "scheduled"`.

- [ ] **Step 2: Deploy and create one bot against a real future meeting**

```bash
cd apps/web
npx tsc --noEmit && npx convex deploy --yes
npx convex run --prod managerMeetingBot:createManagerBot '{"calendarEventId":"<a real future event>"}'
```

Expected: `{ botId: "<uuid>" }`.

- [ ] **Step 3: Confirm Recall accepted it and shows the right name**

```bash
cd apps/web
KEY=$(npx convex env get RECALL_API_KEY --prod | tr -d '\r\n')
curl -s -H "Authorization: Token $KEY" \
  "https://us-west-2.recall.ai/api/v1/bot/<botId>/" \
 | python3 -c "import sys,json; d=json.load(sys.stdin); print('name:',d.get('bot_name'),'| join_at:',d.get('join_at'))"
```

Expected: `name: Sequ3nce MGMT` and a `join_at` matching the meeting's start.

- [ ] **Step 4: Confirm calling it twice does not create a second bot**

```bash
npx convex run --prod managerMeetingBot:createManagerBot '{"calendarEventId":"<same event>"}'
```

Expected: `{ skipped: "already scheduled" }`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/convex/managerMeetingBot.ts
git commit -m "An MGMT bot can be sent to a manager's meeting, once"
```

---

## Task 8: The scheduling cron

**Files:**
- Create: `convex/managerMeetingBotSchedule.ts`
- Modify: `convex/crons.ts`

**Interfaces:**
- Consumes: `createManagerBot` (Task 7), `syncManagerCalendar` (Task 6)
- Produces: `autoScheduleManagerBots({ dryRun }) → { synced, scheduled, skipped, dryRun }`

- [ ] **Step 1: Write the pass**

A separate action from `autoScheduleBotsForAllClosers`. It must not import from it or modify it.

For every user with `googleCalendarRefreshToken` set, `managerAutoJoinEnabled === true`, and whose team is Overwatch:

1. `syncManagerCalendar`
2. Find events starting in the next 30 minutes, not `excluded`, with a `meetingUrl`
3. `createManagerBot` for each
4. Enforce a daily cap per manager (default 20) and log loudly if hit
5. Cancel bots whose event has moved or vanished

`dryRun` returns what it *would* do without calling Recall.

- [ ] **Step 2: Add the cron**

In `crons.ts`, after the closer bot's entry:

```ts
// Manager Mode's own pass. Deliberately a separate cron from
// auto-schedule-meeting-bots rather than a branch inside it — the closer
// scheduler is the most bug-prone code in the product and must not be
// touched. Offset by two minutes so the two never contend.
crons.cron(
  "auto-schedule-manager-bots",
  "9,24,39,54 * * * *",
  internal.managerMeetingBotSchedule.autoScheduleManagerBots,
  {},
);
```

- [ ] **Step 3: Deploy and dry-run**

```bash
cd apps/web
npx tsc --noEmit && npx convex deploy --yes
npx convex run --prod managerMeetingBotSchedule:autoScheduleManagerBots '{"dryRun":true}'
```

Expected: `{ synced: N, scheduled: 0, skipped: N, dryRun: true }` and a list of what it would have done. Read that list before running it for real.

- [ ] **Step 4: Confirm the closer scheduler is untouched**

```bash
cd apps/web
git diff --stat HEAD -- convex/meetingBot.ts
npx convex run --prod meetingBot:autoScheduleBotsForAllClosers '{"dryRun":true}'
```

Expected: **no diff at all** on `meetingBot.ts`, and the closer dry-run returning the same shape it did before this work.

- [ ] **Step 5: Commit**

```bash
git add apps/web/convex/managerMeetingBotSchedule.ts apps/web/convex/crons.ts
git commit -m "Schedule manager bots on their own pass, leaving the closer scheduler alone"
```

---

## Task 9: Receive the recording

**Files:**
- Modify: `convex/http.ts`

**Interfaces:**
- Consumes: `managerMeetingBots.recallBotId`
- Produces: `managerMeetings` rows with recordings

- [ ] **Step 1: Branch the existing Recall webhook**

At the top of the webhook handler, before any closer lookup:

```ts
    // Manager bots first. If the id belongs to a manager bot, this is not a
    // sales call and none of the closer handling below should run.
    const managerBot = await ctx.runQuery(
      internal.managerMeetingBot.getBotByRecallId,
      { recallBotId },
    );
    if (managerBot) {
      await ctx.runMutation(internal.managerMeetingBot.applyWebhook, {
        recallBotId,
        event: eventType,
        subCode: eventData?.data?.sub_code ?? null,
      });
      return new Response("ok", { status: 200 });
    }
```

`applyWebhook` maps events to state:

- `bot.joining_call` → `status: "joining"`
- `bot.in_call_recording` → `status: "active"`, `joinedAt`, and create the `managerMeetings` row
- `bot.call_ended` → `status: "completed"`, `endedAt`; when `sub_code` is `bot_kicked_from_call`, `bot_kicked_from_waiting_room`, `timeout_exceeded_noone_joined` or `timeout_exceeded_waiting_room`, mark the meeting failed and store the reason rather than leaving a silent gap
- `bot.done` → attach `recordingUrl` and `duration`

- [ ] **Step 2: Deploy and confirm closer webhooks still work**

```bash
cd apps/web
npx tsc --noEmit && npx convex deploy --yes
npx convex data meetingBots --prod --limit 5 --order desc
```

Expected: the most recent closer bots still show their normal statuses. A closer bot's id will not match `getBotByRecallId`, so the new branch is inert for them.

- [ ] **Step 3: Verify end to end with a real meeting**

Put a real meeting on a connected manager's calendar five minutes out, let the cron fire, join the meeting and admit the bot.

```bash
cd apps/web
npx convex data managerMeetingBots --prod --limit 5 --order desc
npx convex data managerMeetings --prod --limit 5 --order desc
```

Expected: the bot moves `scheduled → joining → active → completed`, and a `managerMeetings` row appears with a `recordingUrl`. If it stalls at `joining` for 20 minutes with `timeout_exceeded_waiting_room`, nobody admitted it — that is the customer's waiting-room setting, not a bug.

- [ ] **Step 4: Commit**

```bash
git add apps/web/convex/http.ts
git commit -m "Manager bot webhooks land in manager tables, never in calls"
```

---

## Task 10: Fetch the transcript

**Files:**
- Create: `convex/managerMeetingTranscript.ts`

**Interfaces:**
- Consumes: `managerMeetings.recallBotId` via `managerMeetingBots`
- Produces: `fetchManagerTranscript({ meetingId })` (internalAction) → `{ segments: number }`

- [ ] **Step 1: Write the fetch**

```ts
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const RECALL_BASE = "https://us-west-2.recall.ai/api/v1";

/**
 * Defined here rather than in managerMeetingQueries, which doesn't exist until
 * the next task. Each task must be completable in order without reaching
 * forward into one that hasn't been written yet.
 */
export const getMeetingWithBot = internalQuery({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) return null;
    const bot = await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_user", (q) => q.eq("userId", meeting.userId))
      .filter((q) => q.eq(q.field("meetingId"), args.meetingId))
      .first();
    return {
      userId: meeting.userId,
      recallBotId: bot?.recallBotId ?? null,
    };
  },
});

export const saveSegments = internalMutation({
  args: {
    meetingId: v.id("managerMeetings"),
    userId: v.id("users"),
    segments: v.array(
      v.object({
        speaker: v.string(),
        text: v.string(),
        startSeconds: v.number(),
        endSeconds: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Replace rather than append — Recall can deliver a transcript twice and
    // a doubled transcript is worse than a missing one.
    const existing = await ctx.db
      .query("managerMeetingTranscripts")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const s of args.segments) {
      await ctx.db.insert("managerMeetingTranscripts", {
        meetingId: args.meetingId,
        userId: args.userId,
        ...s,
      });
    }
    return { saved: args.segments.length };
  },
});

export const fetchManagerTranscript = internalAction({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (ctx, args): Promise<{ segments: number }> => {
    const meeting = await ctx.runQuery(
      internal.managerMeetingTranscript.getMeetingWithBot,
      { meetingId: args.meetingId },
    );
    if (!meeting?.recallBotId) return { segments: 0 };

    const res = await fetch(
      `${RECALL_BASE}/bot/${meeting.recallBotId}/transcript/`,
      { headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` } },
    );
    if (!res.ok) {
      throw new Error(`Recall transcript fetch failed: ${res.status}`);
    }
    const raw = await res.json();

    // Recall returns one entry per speaker turn, each with word-level timings.
    const segments = (Array.isArray(raw) ? raw : []).flatMap((turn: any) => {
      const words = turn.words ?? [];
      if (words.length === 0) return [];
      return [{
        speaker: turn.speaker ?? "Unknown",
        text: words.map((w: any) => w.text).join(" "),
        startSeconds: words[0].start_timestamp?.relative ?? 0,
        endSeconds: words[words.length - 1].end_timestamp?.relative ?? undefined,
      }];
    });

    await ctx.runMutation(internal.managerMeetingTranscript.saveSegments, {
      meetingId: args.meetingId,
      userId: meeting.userId,
      segments,
    });
    return { segments: segments.length };
  },
});
```

- [ ] **Step 2: Call it when the bot finishes**

In `applyWebhook` (Task 9), on `bot.done`, after storing `recordingUrl`:

```ts
        await ctx.scheduler.runAfter(
          0,
          internal.managerMeetingTranscript.fetchManagerTranscript,
          { meetingId },
        );
```

- [ ] **Step 3: Deploy and verify against a real recorded meeting**

```bash
cd apps/web
npx tsc --noEmit && npx convex deploy --yes
npx convex run --prod managerMeetingTranscript:fetchManagerTranscript '{"meetingId":"<a completed meeting>"}'
npx convex data managerMeetingTranscripts --prod --limit 10
```

Expected: `{ segments: N }` with N > 0, and rows with real speaker names and text.

- [ ] **Step 4: Confirm running it twice does not double the transcript**

```bash
npx convex run --prod managerMeetingTranscript:fetchManagerTranscript '{"meetingId":"<same>"}'
npx convex data managerMeetingTranscripts --prod --limit 200 2>/dev/null | grep -c '|'
```

Expected: the same count as after the first run.

- [ ] **Step 5: Commit**

```bash
git add apps/web/convex/managerMeetingTranscript.ts apps/web/convex/http.ts
git commit -m "Manager meetings get transcripts, in their own table"
```

---

## Task 11: The Manager Mode tab

**Files:**
- Create: `src/app/dashboard/manager-mode/page.tsx`
- Create: `src/app/dashboard/manager-mode/components/ConnectCalendar.tsx`
- Create: `src/app/dashboard/manager-mode/components/MeetingsList.tsx`
- Create: `convex/managerMeetingQueries.ts`
- Modify: `src/components/dashboard/sidebar.tsx`

**Interfaces:**
- Consumes: `getManagerCalendarState`, `disconnectManagerCalendar`, `setManagerAutoJoin`
- Produces: `listManagerMeetings({ clerkId }) → Array<{ _id, title, startedAt, duration, status, recordingUrl }>`

- [ ] **Step 1: Write the read query**

```ts
export const listManagerMeetings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];
    // Scoped to the manager, not the team. One manager never sees another's.
    return await ctx.db
      .query("managerMeetings")
      .withIndex("by_user_and_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});
```

- [ ] **Step 2: Build the tab**

Three states, and all three must be handled — an unhandled empty state is how a new tab reads as broken:

- **Not Overwatch** — explain the tab needs Overwatch, no connect button
- **Not connected** — a Connect Google Calendar button linking to
  `/api/auth/google/authorize?managerId=${userId}`, plus a line saying the bot
  will join every meeting on the calendar and can be removed from any of them
- **Connected** — an Auto Record switch (reuse the pattern from
  `AutoJoinToggle.tsx`), the meetings list, and a disconnect option

- [ ] **Step 3: Add the sidebar item**

A `Manager` group heading with a single `Manager Mode` item, rendered only when the user's role is admin or manager **and** the team is Overwatch.

- [ ] **Step 4: Write the E2E test**

```ts
import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

test.describe("Manager Mode", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("tab loads and offers a calendar connection", async ({ page }) => {
    await page.goto("/dashboard/manager-mode");
    await expect(page.getByRole("heading", { name: /manager mode/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /connect google calendar/i }),
    ).toBeVisible();
  });

  test("says the bot joins every meeting, so it is never a surprise", async ({ page }) => {
    await page.goto("/dashboard/manager-mode");
    await expect(page.getByText(/every meeting on your calendar/i)).toBeVisible();
  });
});
```

- [ ] **Step 5: Run it**

```bash
cd apps/web
npx tsc --noEmit && npx next build
npx playwright test tests/e2e/manager-mode.spec.ts
```

Expected: both tests pass, build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/manager-mode apps/web/convex/managerMeetingQueries.ts \
        apps/web/src/components/dashboard/sidebar.tsx apps/web/tests/e2e/manager-mode.spec.ts
git commit -m "Manager Mode tab: connect a calendar, see what was recorded"
```

---

## Task 12: Prove nothing regressed

**Files:**
- Modify: `docs/superpowers/plans/baselines/2026-08-17-pre-manager-mode.json` (append the after-state)

This task is the reason the phase exists in this order. It is not optional.

- [ ] **Step 1: Re-run the baseline commands**

```bash
cd apps/web
T=js728xjb1vdxcfcsxcwme62eh589977x
npx convex run --prod closerScorecardData:getCloserScorecardData \
  "{\"teamId\":\"$T\",\"dayKey\":\"2026-08-14\",\"monthKey\":\"2026-08\"}" > /tmp/after-tp.json
npx convex run --prod eodNudge:getEodNudgeData "{\"teamId\":\"$T\",\"dayKey\":\"2026-08-14\"}" > /tmp/after-eod.json
```

- [ ] **Step 2: Diff against the baseline**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
python3 - <<'PY'
import json
base=json.load(open("docs/superpowers/plans/baselines/2026-08-17-pre-manager-mode.json"))
after={"teamPerformance":json.load(open("/tmp/after-tp.json")),
       "eodNudge":json.load(open("/tmp/after-eod.json"))}
for k in ("teamPerformance","eodNudge"):
    same = json.dumps(base[k],sort_keys=True)==json.dumps(after[k],sort_keys=True)
    print(f"  {k}: {'IDENTICAL' if same else '*** CHANGED — investigate before shipping ***'}")
PY
```

Expected: both `IDENTICAL`. Anything else must be explained or fixed before this phase is considered done — these numbers depend on nothing Manager Mode touches.

- [ ] **Step 3: Confirm the row counts**

```bash
cd apps/web
for T in closers calls meetingBots calendarEvents closerCalendarSubscriptions; do
  printf "%s " "$T"
  npx convex data $T --prod --limit 2000 2>/dev/null | grep -c '|'
done
```

Expected: `closers`, `calendarEvents` and `closerCalendarSubscriptions` unchanged from Task 1. `calls` and `meetingBots` may have grown from ordinary customer activity — check any growth corresponds to real sales calls, not manager meetings.

- [ ] **Step 4: Run the whole existing E2E suite**

```bash
cd apps/web
npx playwright test
```

Expected: everything that passed before still passes.

- [ ] **Step 5: Commit the evidence**

```bash
git add docs/superpowers/plans/baselines/
git commit -m "Manager Mode phase 1 changed nothing about the closer product"
```

---

## What phase 1 does not include

Deliberately absent, and planned separately once the bot is real:

- Summaries, topics, action items, agreements (phase 2)
- Speaker identification beyond whatever Recall labels them (phase 2)
- Interview role and candidate tags (phase 2)
- The brief and rep cards (phase 3)
- Clipping, sharing, widening the shared pointers (phase 4)
- The rep page (phase 5)

At the end of phase 1 a manager can connect their calendar and see their meetings recorded, with transcripts. That is genuinely useful on its own and it proves the riskiest part before anything is built on top of it.
