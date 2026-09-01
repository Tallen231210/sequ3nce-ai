# Coach Classrooms — Design Spec

**Date:** 2026-09-01 · **Status:** Approved direction, Phase 1 ready to build
**First coach:** Ben Byrne (the funnel's face — his wins section is live on /start)

## The vision (Tyler + Ben, 2026-09-01)

Sequ3nce Personal hosts many sales coaches. Each coach gets a **classroom**:

- **Free classroom** — anyone in the app can join. This is the coach's own
  funnel inside our product: their training videos, their community space,
  their live coaching calls.
- **Premium classroom** (later) — the coach's upsell. Higher-level content,
  smaller community, and member-only powers — most importantly
  **"Share call with Coach"**: a member consents to share a recorded call
  and the coach reviews it. (Every Ben testimonial on the funnel is "Ben
  reviewed my call" — this is the moat feature. Premium-only, never free.)
- Users pick a coach, or join several classrooms. Coaches bring their
  audiences in; the app gives them what Skool/Discord can't (real call
  recordings + AI scoring).

Upsell/payments are explicitly OUT of scope for now (will ride Polar when
it happens — the `tier` field is the only forward provision).

## What already exists (deep-dive 2026-09-01)

| Piece | State |
|---|---|
| Badge system | `b2cUsers.badges: string[]` — `"coach"` already recognized by `isCoachOrAdmin()` in `b2cCoachingCalls.ts`; unlocks call scheduling/hosting. All other gates are founder/admin-only. |
| Coaching calls | FULL system, already multi-coach (`coachUserId` on every call): scheduling, live rooms (`CoachingCallRoom.tsx`), attendance w/ coach/attendee roles, replay-watched tracking, daily digest. |
| Training library | `b2cTrainingModules` + `b2cTrainingLessons` (videoUrl, order, isPublished, thumbnails) + ModuleCard/LessonList UI. **Global — no owner.** Founder-managed. |
| Community channels | `b2cCommunityChannels` (slug, order, isDefault) + posts keyed by channel. No ownership/visibility concept. |
| DMs | `b2cDirectMessageThreads` — coach↔student messaging works today. |
| Badge UI | Founder chip renders in community (MemberCard etc.); coach chip needs styling. |

## Data model changes (ALL additive)

1. **`b2cCoaches`** (new): `userId` (b2cUsers), `slug`, `displayName`, `bio`,
   `headline`, `avatarStorageId?`, `isActive`, `createdAt`. One row per coach.
2. **`b2cClassroomMemberships`** (new): `coachId`, `userId`,
   `tier: "free" | "premium"`, `joinedAt`. Index by user and by coach.
   Supports pick-one AND join-many.
3. **`b2cTrainingModules` += `coachId?` + `tier?`** ("free" default).
   `undefined coachId` = the existing global Sequ3nce library (untouched,
   keeps working — zero migration).
4. **`b2cCommunityChannels` += `coachId?` + `tier?`** — a classroom's
   community is a coach-owned channel; queries hide coach channels from
   non-members (free tier = any member).
5. **`b2cCoachingCalls` += `tier?`** — a call can be premium-only later.
6. Phase 3 only: `b2cSharedCallReviews` (memberId, coachId, callId,
   consentAt, status, coachNotes) — NOT built now.

## Coach powers (the badge, enhanced)

Coach badge + owning `b2cCoaches` row grants, scoped to their OWN classroom:
- Manage their modules/lessons (create/edit/publish) — extend the existing
  founder-only training CRUD with an "or owning coach" check.
- Post + pin in their classroom channel.
- Schedule/host coaching calls (already works).
- See their member list.
- **Promote a replay to a module** — turn a raw classroom replay into a
  curated lesson in their own training library.
- **Push a replay to the house Training tab** (Tyler 2026-09-01):
  self-serve button on their replays, copy spelling out the consequence —
  "Share with all users — this pushes the recording to the general
  Training tab, visible to every Sequ3nce member, not just your
  classroom." Confirm step before it fires. Founder can un-feature
  anything (safety valve).
Explicitly NOT: any admin surface, other classrooms, member private data.
Founder retains god-mode everywhere.

## Calls & recordings routing (decided 2026-09-01)

The recording pipeline (auto-record → process → replay) is UNTOUCHED —
every call already carries `coachUserId`, so scoping is a query-level
visibility layer, not a rewire:

- **Coach's call** → shows on their classroom members' Schedules, joins in
  the shared in-app room, replay lands automatically on the classroom's
  **Replays shelf** (new UI). From there the coach curates: promote to
  module, and/or push to the house Training tab (buttons above).
- **House call** (founder-run, no coach classroom) → exactly today's
  behavior: general Schedule + general Training replay section. All
  existing replays/modules stay put — zero migration.
- Free classrooms cost nothing to join, so coach calls stay effectively
  open — but joining is the doorway that builds the coach's member list
  and later carries the premium tier (a premium call = a call whose tier
  only some members hold).

## Phasing

**Phase 1 (build now, single-coach UI):**
- Schema changes above (minus phase-3 table). Deploy.
- Provision Ben: REAL account (comped `subscriptionStatus: "active"`,
  `isTestAccount` ABSENT — he must be visible), badges `["coach"]`,
  `b2cCoaches` row. Variant of `provisionTestAccount` or manual patch.
- Coach chip in community UI (distinct from founder chip).
- Classroom area in Community: Ben's modules (owned content), his channel,
  his coaching calls — since he's the only coach, every member sees it
  (auto-membership on first visit; the picker waits for coach #2).
- Coach-side management UI: reuse the founder training-management surfaces,
  scoped to own coachId.
- Classroom Replays shelf + promote-to-module + push-to-house-Training
  actions (the only genuinely new pipeline UI).
- Videos v1 = embed URLs (Loom/YouTube unlisted — wherever Ben's content
  lives). Proper hosting only when premium gating demands it.

**Phase 2 (coach #2 in sight):** coach directory + join/leave classroom UI,
membership-driven visibility, per-coach member counts.

**Phase 3 (with Ben's upsell):** premium tier live (Polar checkout),
share-call-with-coach (consent flow + coach review surface), premium-only
content/channels/calls.

## Open questions (blocking Phase 1 build)

1. Ben's email for the account.
2. Where Ben's training videos live today (Loom / YT / files).
3. Coaching calls v1: in-app rooms (existing) or external links?

## Rules honored

- Additive-only schema; global training library untouched.
- B2C only — nothing crosses into desktop/web B2B surfaces.
- Verify both apps build after schema deploy.
