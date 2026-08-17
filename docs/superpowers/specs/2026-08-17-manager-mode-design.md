# Manager Mode — design

**Status:** approved design, not yet planned
**Date:** 2026-08-17
**Product:** Sequ3nce for Teams (B2B), web dashboard only

---

## 1. What this is

A tab in the web dashboard, **Manager Mode**, giving a sales manager their own
meeting bot and the tools that hang off it.

The closer bot records prospect-facing sales calls and exists to measure
selling. Manager Mode records the manager's own internal meetings and exists to
help them manage. Nothing about close rates, objections, cash or payment
structure applies here.

A sales manager's week is four kinds of meeting:

1. **One-to-ones** with someone on the sales team
2. **Team meetings** with all the reps
3. **Leadership meetings** with the owner or above
4. **Interviews** — a large share of the total, and the only one where the other
   person isn't in the company

None is a sales call.

Interviews are only ever for two roles, closer or setter, which is what keeps
them a meeting type here rather than a hiring product. "Role" is a dropdown with
two values, not a job-posting system.

## 2. Why it is worth building

Summarising a meeting is table stakes — Fathom and Otter already do it, and a
manager who wants only that will keep using what they have.

The thing only we can do is connect what was *said* in a meeting to what the
sales team then *did*, because we already hold the numbers. A manager can open
Thursday's one-to-one knowing that last Thursday Nick agreed to pitch on every
call, and that his offer rate since is 25%.

That loop — agreement, then evidence — is the feature. Everything else supports it.

## 3. Scope

**In:**

- Manager connects their own Google Calendar, inside this tab
- A bot joins every meeting on that calendar, branded **MGMT**
- Recording, transcript, speaker labels
- Per-meeting summary, topics, action items, and what was agreed
- A **brief** before each meeting: what to bring up, drawn from live account data
- A **debrief** after each meeting
- Clipping a section into a training, and sharing it
- Per-rep view: numbers, history of one-to-ones, agreements held or not

**Out, deliberately:**

- Any inference about whether someone *changed their behaviour*. We can tell you
  Nick agreed to use the new objection handling. We cannot tell you whether he
  did, and we will not pretend to. Only commitments with a number we already
  track get evidence attached.
- **Any assessment, score or opinion on a job candidate.** v1 gives summaries
  and talking points and stops there. Scoring applicants is regulated in some
  places, and a manager who disagrees with one score stops trusting every other
  number on the page. Comparison and scorecards are a later conversation.
- Manager meetings appearing anywhere in sales reporting
- Anything beyond the bot. Further manager tools come later.

Note the existing Recruiting tab is dead and there are no Sequ3nce Personal
users, so neither is a foundation to build on. Interviews start from nothing.

## 4. Access and visibility

**Manager-only by default.** A manager sees their own meetings. No other
manager sees them, no closer sees them, and they do not appear in the closer
app.

Sharing is by link, reusing the existing share mechanism: token URL, optional
password, revocable, full recording or a clip.

Two additions to the existing share model, both because these recordings are
more sensitive than a sales call:

- **Expiry** — a link to a one-to-one about someone's performance should not
  live forever
- **View count** — the manager should be able to see whether it was opened

A clip saved into a Playbook playlist becomes visible to the team by design.
The save dialog states this explicitly, naming the person the clip came from.

## 5. Data model

Manager meetings live in **their own tables**, separate from `calls`.

The alternative — giving managers a hidden `closers` row — was rejected. There
are 83 places that enumerate closers, 57 of them scoped by team: leaderboards,
seat counts, the end-of-day nudge, the daily scoreboard, billing. Every one
would need an exclusion, every one is a chance to leak a manager into an
invoice or a leaderboard, and the trap stays live for anyone writing code later.

New tables:

| Table | Purpose |
|---|---|
| `managerMeetings` | one recorded meeting: manager, times, title, meeting URL, recording, duration, type |
| `managerMeetingBots` | bot lifecycle, mirroring `meetingBots` but far simpler |
| `managerCalendarSubscriptions` | which Google calendars a manager has connected |
| `managerCalendarEvents` | upcoming events read from those calendars |
| `managerMeetingAnalysis` | summary, topics, action items, agreements |

New fields on `users` (managers): Google refresh token, calendar provider,
connected timestamp, auto-join toggle, onboarding-complete flag. Managers have
no calendar concept today; this adds one.

### Shared features

Transcripts, clips, share links and comments already exist and key on
`callId: v.id("calls")`. A Convex ID is typed to its table, so those fields
cannot hold a manager meeting.

**Widen rather than duplicate.** Those pointer fields become
`v.union(v.id("calls"), v.id("managerMeetings"))`. Duplicating the tables would
mean every future fix to sharing or clipping has to be made twice, and the
second one is the one that gets forgotten.

Widening a field is additive — every existing row still validates — and is
allowed under the additive-only schema rule. TypeScript then flags every place
that reads the field, which is the point: the compiler produces the list of
things to think about rather than us hoping we remembered them all.

## 6. Calendar connection

A manager connects Google Calendar from inside Manager Mode, reusing the
existing OAuth flow and its scopes.

Several managers per team are supported. Each owns their calendar and their
meetings; none sees another's. This is the natural shape of the model — one
manager would be more work, not less.

**Quota:** the Google project is unverified and capped at 100 connections for
its lifetime, with roughly 26 used. Every manager who connects consumes one
permanently.

## 7. The bot

Deliberately simple. It joins every meeting on the connected calendar.

The complexity of the closer bot does not apply:

- **No attribution.** The meeting belongs to the manager whose calendar it is.
- **No cross-participant dedup.** One manager per calendar.
- **No sales extraction.** No outcome, money, objections or post-call form.

What carries over from the closer bot, because it was learned the hard way:

- `join_at` must be sent, or the bot arrives immediately rather than on time
- Dedup keyed on the calendar event, never the meeting URL — one personal
  meeting room can host many different meetings
- Skip events titled `Canceled:` and all-day events
- Cancel the bot when a meeting moves or disappears
- A daily cap per manager, as a runaway detector

**Opting out is kicking the bot.** A manager who does not want a meeting
recorded removes the bot, exactly as closers do today, and the recording is
discarded rather than counted. There is also a "don't record" control on each
upcoming meeting in the tab.

**Branding:** `bot_name` and the avatar image are per-bot parameters on the
Recall call. Manager bots send an MGMT name and logo. This is independent of
everything else in the design.

**Waiting rooms** are the customer's own Zoom or Meet setting. A bot left
waiting is not a bug and needs no handling beyond what exists.

## 8. Analysis output

One format for the three internal types — they differ in content, not in shape.
Interviews use the same four fields with a different prompt, described below:

- **Summary** — what the meeting was about
- **Topics** — what was covered
- **Action items** — who owes what
- **Agreements** — commitments made, each with the person's name

Agreements are listed whether or not we can check them. Evidence is attached
only where we already hold the number, and nothing is said otherwise. The
manager ticks items off themselves.

Commitments we can evidence today: end-of-day filing, outstanding balances
clearing, whether a named prospect had a follow-up call, and any setter-side
activity metric.

### Interviews

Same four fields, different prompt. A summary of the conversation and the big
talking points — what they claimed about their numbers, what they said about why
they left, what they asked about. **No assessment, no score, no recommendation.**

Two fields are stored on the meeting: **role** (closer or setter) and the
**candidate's name**. That is the whole of it — no candidate profile, no status,
no pipeline. It costs almost nothing and buys three things: a manager can find
the six people they interviewed for closer rather than scrolling a mixed list;
candidates can never surface where reps belong; and if comparison is built
later, the recordings are already grouped rather than needing to be sorted by
hand.

Which meetings are interviews is decided by the existing call classifier, which
already separates recruitment from internal — it was built after a hiring
interview was once recorded as a closed deal.

## 9. The brief

Before each meeting, the tab shows what is worth raising, refreshed until the
meeting starts.

Drawn only from things we know:

- Rate movements per rep — offer, show, close — and their direction
- Objections that keep appearing on that rep's calls
- Missing end-of-day submissions
- Outstanding balances
- Calls taken with no outcome logged
- Reps who have never had a one-to-one
- What was agreed at the last one-to-one with that person

Each suggestion can be dismissed. The manager can add their own notes.

**Identifying who a meeting is with**, in order:

1. The invite, if it names someone on the team
2. The title, matched against team member names
3. The manager tags it once; the tag is remembered for the recurring series

This matters because only 16% of real calendar events carry any attendee list,
and those observed are prospects rather than colleagues. Manager calendars may
differ — internal meetings are usually invited by hand — but the design must
work either way, and it degrades to asking rather than guessing.

## 10. The debrief

After a meeting ends, the same card becomes the debrief: what was covered, what
was agreed as tickable items, and a marker on the ones we will track. Open items
carry into the next brief for that person automatically.

## 11. Clipping and training

From a manager meeting: select a range on the transcript or waveform, title it,
and either save it to a Playbook playlist or share it as a link.

This reuses `highlights` and the training playlists that already exist. The save
dialog states plainly that a clip placed in a playlist becomes visible to the
team, naming whose meeting it came from.

## 12. UI

A tab named **Manager Mode**, under a Manager heading in the dashboard sidebar,
visible only to managers on Overwatch teams.

Four screens, approved as mockups:

- **Overview** — next meeting as a hero card with its brief; below it a card per
  rep with numbers, six-week trend, when they were last spoken to, and what they
  agreed. Sorted by who needs attention. On a day with no meetings, the rep list
  stands alone.
- **After a meeting** — the hero becomes the debrief.
- **A rep's page** — their numbers, and the history of one-to-ones with each
  agreement marked held or not held where we have evidence.
- **Cutting a training** — video, waveform with a draggable selection,
  transcript alongside, save or share.

## 13. Non-regression rules

The existing product must behave identically. These are requirements, not
aspirations:

1. **No existing table loses a field or changes a field's type.** Only new
   tables, new optional fields, and widened unions.
2. **No manager meeting is reachable from any closer-scoped query.** Manager
   meetings are not in `calls`, so no closer query can return one.
3. **Seat counting and billing are untouched.** Managers are not closers and do
   not consume seats.
4. **The closer bot's scheduling path is not modified.** Manager scheduling is a
   separate pass.
5. **Every shared feature that gets widened keeps its existing behaviour for
   calls**, verified by exercising it on a call before and after.
6. **Before/after snapshot.** Team Performance, Closer Stats, Analytics,
   Collections and the daily notifications are captured for a live team before
   the work starts and compared after. Any difference must be explained or
   fixed. This is the same technique that proved the extraction refactor and the
   setter engine safe.

## 14. Gating and cost

Overwatch only, matching the closer bot.

Recall bills $0.50 per recording hour from the moment a bot joins. Manager
meetings are longer than sales calls; a manager in fifteen hours of meetings a
week is roughly $30/month. Absorbed into the price, not surfaced.

## 15. Build order

This is too large for one sitting, and the phases are separable. Each is usable
on its own, and each is verified before the next begins.

1. **Connect and record.** Manager calendar connection, the new tables, the bot,
   MGMT branding, recordings and transcripts appearing in a bare tab. At the end
   of this a manager's meetings are being captured. Nothing else exists yet.
2. **Read the meeting.** Summary, topics, action items, agreements. The
   interview variant with its role and candidate tags. The debrief card.
   **Interviews are fully usable at the end of this phase** — they need nothing
   from phases 3 or 5, which is why they come first.
3. **The brief.** Meeting-to-rep identification, the suggestion sources, the
   overview screen with rep cards.
4. **Clip and share.** Widening the shared pointers, the training studio, link
   expiry and view counts.
5. **The rep page.** History of one-to-ones, agreements held or not.

Interviews land before the coaching side deliberately. They're a large share of
the volume, they're useful from the very first one, and phase 3's value depends
on a manager having had several one-to-ones with the same person before the
history is worth reading.

Phase 4 is the one that touches existing code, and is deliberately late — by
then everything else is proven, so a regression there is unambiguous.

### Assets ready

The MGMT bot avatar is done: the supplied logo converted to 1280×720 JPEG on
black, matching the closer bot's format, at 32 KB. It reads SEQU3NCE.AI / MGMT /
[● REC]. The recording indicator is visible to everyone in the meeting for its
whole duration, which is how a candidate knows they're being recorded.

The bot's displayed name is stored per team in `meetingBotName`, not per bot
type, so the manager bot needs its own field rather than reusing that one.

## 16. Known risks

- **Attendee data may be too sparse** to identify who a one-to-one is with,
  making the brief manual more often than we would like. Mitigated by the
  three-step fallback, but unknown until a real manager connects.
- **Widening shared pointers touches working code.** Mitigated by rule 5 above.
- **A manager's calendar is more personal than a closer's.** Kicking the bot is
  the opt-out, and it works, but the first time a bot sits in a meeting someone
  did not expect will be a conversation.
- **Google connection quota** is finite and unverified.

## 17. Deliberately deferred

- Manager tools beyond the meeting bot
- Any behavioural verification of coaching
- Cross-manager visibility
- Anything in the closer or Personal apps

---

## Appendix — the ManyJobs case

Their sales manager, Gianni, both manages and takes sales calls, and exists
today as both a `users` row and a `closers` row on the same email. He wants the
two kept separate.

The design does not accommodate this and should not. Manager meetings and sales
calls are separate objects, which is what he wants; the only genuine conflict is
that his two records share an email address, and the closer email index is
global and resolves with `.first()`.

Resolution is operational, not architectural: change his dashboard login to a
different address. Agreed 2026-08-17.
