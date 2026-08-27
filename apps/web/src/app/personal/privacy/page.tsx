import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowLeft } from "lucide-react";

// B2C-ONLY legal page for Sequ3nce Personal. The B2B product has its own
// pages at /privacy and /terms — never merge or cross-link the two sets.

export const metadata = {
  title: "Privacy Policy — Sequ3nce Personal",
};

const h2 = "text-xl font-semibold mb-4";
const p = "text-muted-foreground mb-4";
const ul = "list-disc list-inside text-muted-foreground space-y-2 mb-4";

export default function PersonalPrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6">
          <div className="flex h-16 items-center gap-2.5">
            <Logo href="/personal" height={20} />
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em] text-white">
              PERSONAL
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/personal"
          className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sequ3nce Personal
        </Link>

        <h1 className="mb-2 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Sequ3nce Personal — the individual product. Last updated August 25, 2026.
        </p>

        <div className="space-y-2">
          <section className="mb-8">
            <h2 className={h2}>1. Who this policy covers</h2>
            <p className={p}>
              This policy covers Sequ3nce Personal: the desktop app, the community, public
              closer profiles, the job board, and the pages at sequ3nce.ai/personal and
              sequ3nce.ai/start. Sequ3nce&apos;s team product for businesses has its own{" "}
              <Link href="/privacy" className="underline hover:text-foreground">
                separate privacy policy
              </Link>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>2. Information we collect</h2>
            <ul className={ul}>
              <li><strong>Account information:</strong> your name, email address, phone number, and password (stored as a cryptographic hash, never in plain text).</li>
              <li><strong>Lead form information:</strong> if you fill out one of our forms, the name, email, and phone number you provide, along with which page you came from.</li>
              <li><strong>Call recordings and transcripts:</strong> audio you choose to record with the app, the transcripts we generate from it, and the AI analysis built on top (summaries, scores, statistics).</li>
              <li><strong>Calendar data:</strong> if you connect a calendar, the event details described in the Google section below.</li>
              <li><strong>Community and profile content:</strong> posts, comments, messages, results you submit, and anything you choose to put on a public profile.</li>
              <li><strong>Payment information:</strong> handled by our payment processor. We store your subscription status and plan — never your card number.</li>
              <li><strong>Usage and device data:</strong> app version, basic device information, and error reports that help us fix problems.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={h2}>3. How we use it</h2>
            <ul className={ul}>
              <li>To run the product: record and transcribe your calls, generate AI analysis and coaching, track your stats, and power the community and job board.</li>
              <li>To contact you about your account and onboarding, by email and — if you opted in on a form — by text message. Text consent is never a condition of purchase, and you can reply STOP at any time.</li>
              <li>To verify results you ask us to verify for a public profile.</li>
              <li>To improve the product and keep it secure.</li>
              <li>We do not sell your personal information.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={h2}>4. AI processing</h2>
            <p className={p}>
              Call recordings and transcripts are processed by AI services to produce
              transcription, summaries, scoring, and coaching feedback. This processing is
              automated. Our AI providers are contractually limited to processing your data to
              provide the service and are not permitted to use it to train their models.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>5. Google user data</h2>
            <p className={p}>
              Sequ3nce Personal offers an optional Google Calendar connection. If you connect
              one: we access your list of calendars and, for the calendars you select, event
              start and end times, meeting links, event titles, and attendee email addresses.
              Access is read-only — we never create, modify, or delete events. We use this data
              to show your upcoming calls in the app, to send the meeting notetaker to the right
              meeting at the right time, and to attribute recordings to the right call. We do
              not use Google user data for advertising and do not use it to train AI models. We
              never sell it, and it is shared only with the service providers needed to run the
              product. You can disconnect at any time inside the app or at
              myaccount.google.com/permissions; on disconnection we delete your Google access
              tokens.
            </p>
            <p className={p}>
              Sequ3nce&apos;s use and transfer to any other app of information received from
              Google APIs will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>6. Public profiles are opt-in</h2>
            <p className={p}>
              Nothing about you is public by default. If you enable a public closer profile,
              the details you choose to show (name, photo, stats, verification badge) become
              visible at your profile link. You can edit or unpublish it at any time.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>7. Who we share data with</h2>
            <p className={p}>
              Only service providers that run parts of the product for us: hosting and database
              infrastructure, transcription and AI providers, our meeting notetaker service,
              our payment processor, and email/SMS delivery providers. Each receives only what
              it needs for its job. We may also disclose information if required by law, or to
              protect the safety and integrity of the service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>8. Security and retention</h2>
            <p className={p}>
              Data is encrypted in transit, access tokens are stored encrypted, and passwords
              are hashed. We keep your data while your account is active. If you delete your
              account, we delete your personal data, recordings, and calendar-derived data
              within a reasonable period, except records we are legally required to keep.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>9. Your rights</h2>
            <p className={p}>
              You can access, correct, export, or delete your personal information, withdraw
              consent to texts (reply STOP), disconnect your calendar, and unpublish your
              profile — from inside the app or by emailing us. Depending on where you live, you
              may have additional rights under local law; we honor requests to exercise them.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>10. Changes and contact</h2>
            <p className={p}>
              If this policy changes materially, we&apos;ll update this page and note the new
              date at the top. Questions and requests:{" "}
              <a href="mailto:privacy@sequ3nce.ai" className="underline hover:text-foreground">
                privacy@sequ3nce.ai
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
