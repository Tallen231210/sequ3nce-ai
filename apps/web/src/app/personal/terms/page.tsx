import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowLeft } from "lucide-react";

// B2C-ONLY legal page for Sequ3nce Personal. The B2B product has its own
// pages at /privacy and /terms — never merge or cross-link the two sets.

export const metadata = {
  title: "Terms of Service — Sequ3nce Personal",
};

const h2 = "text-xl font-semibold mb-4";
const p = "text-muted-foreground mb-4";
const ul = "list-disc list-inside text-muted-foreground space-y-2 mb-4";

export default function PersonalTermsPage() {
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

        <h1 className="mb-2 text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Sequ3nce Personal — the individual product. Last updated August 25, 2026.
        </p>

        <div className="space-y-2">
          <section className="mb-8">
            <h2 className={h2}>1. Acceptance and scope</h2>
            <p className={p}>
              These terms govern Sequ3nce Personal: the desktop app, community, public closer
              profiles, job board, training content, and the pages at sequ3nce.ai/personal and
              sequ3nce.ai/start. By creating an account or using the service you accept them.
              You must be at least 18. Sequ3nce&apos;s team product for businesses is governed
              by its own{" "}
              <Link href="/terms" className="underline hover:text-foreground">
                separate terms
              </Link>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>2. The service</h2>
            <p className={p}>
              Sequ3nce Personal is software for individual sales professionals: call recording,
              transcription, AI analysis and scoring, personal statistics, a community, an
              optional public closer profile, a board of third-party sales roles, and sales
              training content. Some of these are provided at no extra charge alongside a paid
              software subscription.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>3. Accounts</h2>
            <ul className={ul}>
              <li>One account per person. Your account is created when you subscribe (or when we provision access for you) and is yours alone — don&apos;t share credentials or let others use it.</li>
              <li>You are responsible for activity on your account and for keeping your password secure.</li>
              <li>Give us accurate information, including on lead forms and anything you submit for verification.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={h2}>4. Call recording compliance</h2>
            <p className={p}>
              <strong>
                You are solely responsible for complying with all laws that apply to recording
                calls.
              </strong>{" "}
              That includes obtaining consent from participants before recording, understanding
              one-party versus two-party consent rules in your jurisdiction and your
              prospects&apos;, making disclosures required by law, and keeping records of
              consent where required. Sequ3nce does not provide legal advice — if in doubt,
              consult counsel before recording.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>5. Subscription and payment</h2>
            <ul className={ul}>
              <li>Paid plans are billed up front for the term you choose and renew automatically until cancelled.</li>
              <li>Payments are processed by our payment provider; prices are shown at checkout.</li>
              <li>You can cancel any time from the billing portal. Cancelling stops future renewals; your access continues to the end of the period you paid for.</li>
              <li>Except where the law requires otherwise, fees already paid are non-refundable.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={h2}>6. No placement or income guarantee</h2>
            <p className={p}>
              The training, role board, and introductions are provided to help you build a
              sales career. <strong>We do not guarantee you a role, an interview, or any level
              of income.</strong> Roles on the board are offered by third-party companies;
              they make their own hiring decisions, set their own compensation, and are not our
              agents or employers of our making. Any figures on our pages are illustrations,
              not promises — see our{" "}
              <Link href="/personal/income-disclosure" className="underline hover:text-foreground">
                Income Disclosure
              </Link>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>7. Acceptable use</h2>
            <ul className={ul}>
              <li>Don&apos;t use the service to break the law, or record calls unlawfully.</li>
              <li>Don&apos;t harass, spam, or defraud other members in the community or over direct messages.</li>
              <li>Don&apos;t submit fake results, doctored recordings, or misleading information for verification or leaderboards.</li>
              <li>Don&apos;t scrape, resell, or republish the job board, community content, or other members&apos; data.</li>
              <li>Don&apos;t probe, overload, or interfere with the service&apos;s security or operation.</li>
            </ul>
            <p className={p}>We may remove content or suspend accounts that break these rules.</p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>8. Your content and profile</h2>
            <p className={p}>
              Your recordings, transcripts, and the content you post remain yours. You grant us
              the license needed to host, process, and display them to operate the service —
              including showing your community posts to other members and, if you enable a
              public profile, displaying what you choose to publish there. Public profiles are
              opt-in and you can unpublish at any time. If you submit a highlight for a
              community feature (for example, a call of the week), you allow us to display it
              within the community.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>9. Intellectual property</h2>
            <p className={p}>
              The software, training materials, and everything else we provide remain the
              property of Sequ3nce. Your subscription grants you a personal, non-transferable
              right to use them while it&apos;s active. Don&apos;t copy, resell, or
              redistribute the training program or the software.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>10. Availability, warranties, and liability</h2>
            <p className={p}>
              We work to keep the service reliable, but it is provided &quot;as is&quot; and
              &quot;as available,&quot; without warranties of any kind, express or implied. To
              the maximum extent permitted by law, Sequ3nce is not liable for indirect,
              incidental, special, or consequential damages — including lost income or lost
              opportunities — and our total liability for any claim is limited to the amount
              you paid us in the twelve months before the claim arose.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>11. Indemnification</h2>
            <p className={p}>
              You agree to indemnify Sequ3nce against claims arising from your violation of
              these terms — including recording calls without required consent — or your
              violation of any law or third-party right.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>12. Termination</h2>
            <p className={p}>
              You can stop using the service and cancel at any time. We may suspend or
              terminate accounts that violate these terms. On termination, your right to use
              the software ends; you can request deletion of your data as described in the{" "}
              <Link href="/personal/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>13. Governing law and changes</h2>
            <p className={p}>
              These terms are governed by the laws of the United States, without regard to
              conflict of law principles, and disputes shall be resolved in the courts of the
              United States. If we change these terms materially we&apos;ll update this page
              and the date at the top; continuing to use the service after a change means you
              accept it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={h2}>14. Contact</h2>
            <p className={p}>
              Questions about these terms:{" "}
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
