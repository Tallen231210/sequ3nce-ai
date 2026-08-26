# Google verification demo video — recording script (v2, after the 2026-08-21 rejection)

**Why v2:** Google rejected the first video for not demonstrating the FULL
functionality of `calendar.events.readonly`. Their words: "your video must
demonstrate the maximum extent of the user facing features using the
scope(s)." So this recording shows the whole chain — calendar connect →
events appearing in the app → the notetaker joining a real meeting from the
calendar — not just the connect flow.

**Length:** 3–5 minutes. **Narration:** helpful — a sentence per step is
plenty. **Upload:** YouTube, Unlisted. Then the link goes in Google Cloud
Console → Google Auth Platform → Data Access → "YouTube link".

**One rule that feels wrong but isn't:** the scary "Google hasn't verified
this app" warning MUST appear on camera. Click "Advanced" → continue, visibly.
Google says this is expected and required.

## Before you hit record

- Test Google account with **2–3 fake "sales call" events** on the calendar,
  each with a real Google Meet link. Make one of them start **5–10 minutes
  from when you record**, so the bot can join it on camera.
- Sign into the web dashboard with your test team. Auto-record ON.
- Browser zoom comfortable; **URL bar must be readable** throughout.
- Have a second tab open on the Meet link of the soon-starting event, so you
  can join the meeting yourself and admit the bot on camera.

## The recording, step by step

1. **Start on sequ3nce.ai** (5–10 sec). Scroll past the hero to the "What
   Sequ3nce.ai actually is" section so the reviewer sees the app name and
   purpose match the OAuth client. Log in.

2. **Show where the connection lives.** Go to the calendar/schedule area and
   click **Connect Google Calendar**.

3. **The consent screen — do not rush this.**
   - URL bar visible.
   - **If the permissions are collapsed or summarized, click "Show all
     services" / expand every scope** so each requested permission is fully
     readable on screen. Linger ~5 seconds. (This was called out explicitly
     in the rejection.)
   - The unverified-app warning appears → click "Advanced" → continue, on
     camera.
   - Click **Allow**.

4. **Calendar-list scope in use.** Show the screen where you **choose which
   calendars Sequ3nce watches** — that's `calendarlist.readonly` doing its
   one job.

5. **Events scope in use — the full feature, not a glimpse.** This is the
   part the rejection was about. Show, in order:
   - The **schedule/upcoming meetings view** with your fake events listed —
     titles and times pulled from the calendar.
   - The **Auto Record toggle** — say/caption: "because the app can read the
     event's start time and meeting link, the notetaker schedules itself."
   - **The payoff, live:** when your 5-minutes-away event starts, join the
     Meet yourself, and **show the Sequ3nce notetaker knocking/joining**.
     Admit it. Say a few sentences into the call so there's something to
     transcribe.
   - Back in the dashboard: show the call appearing (live view or the
     completed call afterwards) **attributed to the right salesperson** —
     say/caption: "event title and attendee data from the calendar is how
     the call lands on the right rep."

6. **Read-only, on the record.** Say/caption one line: "Access is read-only —
   the app never creates, edits, or deletes calendar events." (We hold no
   write scopes, so the 'show changes in the source account' requirement
   doesn't apply — but saying this out loud helps the reviewer tick the box.)

7. **Show disconnection** (10 sec). The disconnect button for the calendar
   connection. Done.

## After uploading

Send me the YouTube link. Alongside the video, Google also wants a reply
email with our AI-provider disclosures — the draft is in
`google-verification-email-reply.md` at the repo root; the privacy policy
already carries the required AI/Limited-Use statement (deployed).
