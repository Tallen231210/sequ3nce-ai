import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6">
          <div className="flex h-16 items-center justify-between">
            <Logo href="/" height={20} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>

        <h1 className="text-4xl font-semibold tracking-tight mb-8">
          Privacy Policy
        </h1>

        <div className="prose prose-zinc max-w-none">
          <p className="text-muted-foreground text-lg mb-8">
            Last updated: August 20, 2026
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Information We Collect</h2>
            <p className="text-muted-foreground mb-4">
              We collect information you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li><strong>Account Information:</strong> Name, email address, company name, and login credentials</li>
              <li><strong>Team Member Information:</strong> Names and email addresses of sales representatives added to your team</li>
              <li><strong>Call Recordings:</strong> Audio recordings of sales calls captured through our desktop application</li>
              <li><strong>Transcripts:</strong> Text transcriptions of recorded calls generated through our speech-to-text processing</li>
              <li><strong>Call Metadata:</strong> Call duration, timestamps, speaker identification, and outcome data</li>
              <li><strong>Google Calendar Data (optional):</strong> If you connect your Google Calendar, we access your list of calendars and, for the calendars you select, event start and end times, meeting links, event titles, and attendee email addresses — read-only. See &quot;Google User Data&quot; below for exactly how this is used.</li>
              <li><strong>Payment Information:</strong> Billing details processed securely through our payment providers (Stripe and Polar)</li>
              <li><strong>Usage Data:</strong> Information about how you interact with our services</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. How We Use Your Information</h2>
            <p className="text-muted-foreground mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Provide real-time call transcription and analysis services</li>
              <li>Generate AI-powered insights, coaching suggestions, and call summaries</li>
              <li>Display analytics and performance metrics in your dashboard</li>
              <li>Process payments and manage your subscription</li>
              <li>Send important service updates and notifications</li>
              <li>Improve our services and develop new features</li>
              <li>Respond to your support requests</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. AI Processing</h2>
            <p className="text-muted-foreground mb-4">
              Our service uses artificial intelligence to analyze your call data. This includes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Extracting key moments and quotes from conversations</li>
              <li>Detecting objections, budget discussions, and timeline mentions</li>
              <li>Generating call summaries and coaching recommendations</li>
              <li>Identifying patterns across your team&apos;s performance</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              AI processing is performed using industry-standard providers. Your data is not used to train general AI models.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Google User Data</h2>
            <p className="text-muted-foreground mb-4">
              Sequ3nce.ai offers an optional Google Calendar connection. This
              section describes exactly what we do with data obtained through
              Google&apos;s APIs.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li><strong>What we access:</strong> your list of calendars (so you can choose which ones Sequ3nce.ai watches) and, for the calendars you select, event start and end times, meeting links, event titles, and attendee email addresses. Access is read-only — we never create, modify, or delete calendar events.</li>
              <li><strong>How we use it:</strong> to display your upcoming scheduled sales calls inside the app, to send our meeting notetaker to join the right meeting at the right time, and to attribute each recorded call to the correct salesperson and prospect. We do not use Google user data for advertising, and we do not use it to train AI models.</li>
              <li><strong>How we store it:</strong> event details for your scheduled calls are stored in our database (hosted on Convex) and associated with your account; your Google access tokens are stored encrypted and used only to perform the reads described above.</li>
              <li><strong>How we share it:</strong> we never sell Google user data. It is shared only with the service providers listed below as needed to run the product (for example, Recall.ai receives a meeting&apos;s link and start time so the notetaker can join). Humans do not read your Google Calendar data except with your explicit consent, for security or abuse investigation, to comply with law, or when aggregated and anonymized.</li>
              <li><strong>Revoking access:</strong> you can disconnect Google Calendar inside the app at any time, or from your Google Account security settings at myaccount.google.com/permissions. On disconnection we delete your Google access tokens, and calendar-derived data is removed under the retention schedule below.</li>
            </ul>
            <p className="text-muted-foreground">
              Sequ3nce.ai&apos;s use and transfer to any other app of information
              received from Google APIs will adhere to the{" "}
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
            <p className="text-muted-foreground mt-4">
              <strong>Artificial intelligence.</strong> Sequ3nce.ai uses AI
              models provided by Anthropic to summarize and analyze the call
              recordings and transcripts captured by our notetaker. Limited
              calendar-derived context — such as a meeting title or a
              prospect&apos;s name — may be included in those requests to make
              a summary accurate. The use of raw or derived user data received
              from Workspace APIs adheres to the Google API Services User Data
              Policy, including the Limited Use requirements. Google user data
              is never used to train AI or machine-learning models: our
              agreement with Anthropic prohibits the use of our data for model
              training, we access Anthropic directly rather than through any
              aggregator or model hub, and we do not operate self-hosted
              models.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Third-Party Services</h2>
            <p className="text-muted-foreground mb-4">
              We use trusted third-party services to operate our platform:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Stripe and Polar:</strong> Payment processing</li>
              <li><strong>Amazon Web Services:</strong> Secure storage for call recordings</li>
              <li><strong>Recall.ai:</strong> Meeting notetaker infrastructure — receives the meeting link and start time of a scheduled call so the notetaker can join it</li>
              <li><strong>Speechmatics:</strong> Speech-to-text transcription of call audio captured by the notetaker or desktop app — never receives Google user data</li>
              <li><strong>Anthropic:</strong> AI analysis and insights — contractually barred from training models on our data</li>
              <li><strong>Clerk:</strong> Authentication and user management</li>
              <li><strong>Convex:</strong> Database and real-time data infrastructure</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Each provider maintains their own privacy practices and security certifications.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Data Security</h2>
            <p className="text-muted-foreground mb-4">
              We implement robust security measures to protect your data:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>All data is encrypted in transit using TLS 1.2+</li>
              <li>Call recordings are stored encrypted at rest in secure cloud storage</li>
              <li>Access controls limit data access to authorized personnel only</li>
              <li>Regular security assessments and monitoring</li>
              <li>Multi-tenant architecture ensures your data is isolated from other customers</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Data Retention</h2>
            <p className="text-muted-foreground mb-4">
              We retain your data as follows:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Active Accounts:</strong> Data is retained while your account is active</li>
              <li><strong>Call Recordings:</strong> Retained according to your account settings (default 90 days)</li>
              <li><strong>Google Calendar Data:</strong> Deleted when you disconnect your Google Calendar or delete your account, subject to the backup window below</li>
              <li><strong>Account Deletion:</strong> Upon request, we will delete your data within 30 days</li>
              <li><strong>Backup Retention:</strong> Backups may persist for up to 90 days after deletion</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Your Rights</h2>
            <p className="text-muted-foreground mb-4">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              To exercise these rights, contact us at privacy@sequ3nce.ai
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">9. Cookies</h2>
            <p className="text-muted-foreground">
              We use essential cookies required for the service to function, including
              authentication and session management. We do not use advertising or
              tracking cookies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">10. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you
              of any material changes by posting the new policy on this page and updating
              the &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">11. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have questions about this Privacy Policy or our data practices,
              please contact us at privacy@sequ3nce.ai
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
