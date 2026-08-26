# Draft reply to Google's Third-Party Data Safety Team (rejection of 2026-08-21)

Send as a direct reply to their email, from the developer contact address.
Ready to send as-is.

---

Hello,

Thank you for the detailed review. Responding to each request:

**1. New demonstration video**

We have recorded a new demonstration video: https://youtu.be/4AH7zgxTMnE
It shows the OAuth consent screen with all requested scopes
fully expanded and readable, and demonstrates the full user-facing
functionality of `https://www.googleapis.com/auth/calendar.events.readonly`:
the user's upcoming meetings appearing in the app with times and titles read
from their calendar, and our meeting notetaker automatically joining a
scheduled meeting at its start time using the event's meeting link — the
core feature the scope exists to power. We request read-only scopes only and
never create, modify, or delete any calendar data, so there are no
source-account changes to demonstrate.

**2. List of third-party AI integrations**

Sequ3nce.ai integrates with the following AI service providers:

- **Anthropic** (Claude API) — used to summarize and analyze sales-call
  recordings and transcripts captured by our own meeting notetaker. Accessed
  directly via the Anthropic API on the standard commercial pay-as-you-go
  API plan (usage-based billing; no free or consumer tier is used).
  Models: `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`.
  Under Anthropic's Commercial Terms of Service, Anthropic does not train
  models on API customer content.
- **Speechmatics** — real-time speech-to-text of call audio captured by our
  notetaker or desktop app, on the standard commercial pay-as-you-go API
  plan (usage-based billing). Speechmatics never receives any Google user
  data of any kind.

**3. Aggregators, gateways, and model hubs**

We do not use any AI aggregators, gateways, or model hubs. Both providers
above are accessed directly through their own first-party APIs.

**4. Self-hosted or offline models**

We do not operate any self-hosted or offline AI models.

**5. Google user data and AI**

Google Calendar data (we hold read-only scopes only) is used to display a
user's upcoming meetings and to schedule our meeting notetaker. It is not
used to train any AI/ML model, ours or a third party's. The only
calendar-derived information that can appear in an AI request is limited
context for a call summary — a meeting title or prospect name — sent to
Anthropic, which is contractually prohibited from training on it. No Google
user data is ever sent to Speechmatics.

**6. Limited Use compliance statement**

Our privacy policy at https://www.sequ3nce.ai/privacy hosts the affirmative
statement in its "Google User Data" section, including the AI-specific
statement: "The use of raw or derived user data received from Workspace APIs
adheres to the Google API Services User Data Policy, including the Limited
Use requirements," together with the disclosure that Google user data is
never used to train AI or machine-learning models.

Please let us know if anything further is needed.

Best regards,
Tyler Allen
Sequ3nce.ai
