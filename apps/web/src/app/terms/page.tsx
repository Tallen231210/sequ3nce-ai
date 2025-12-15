import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
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
          Terms of Service
        </h1>

        <div className="prose prose-zinc max-w-none">
          <p className="text-muted-foreground text-lg mb-8">
            Last updated: December 2024
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing or using Seq3nce.ai, you agree to be bound by these Terms
              of Service. If you do not agree to these terms, please do not use our
              service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground">
              Seq3nce.ai provides sales call intelligence software that enables
              real-time call monitoring, transcription, and analytics for sales teams.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. User Responsibilities</h2>
            <p className="text-muted-foreground mb-4">You agree to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Provide accurate account information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Comply with all applicable laws regarding call recording</li>
              <li>Obtain necessary consent from call participants where required by law</li>
              <li>Not misuse or abuse the service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Payment Terms</h2>
            <p className="text-muted-foreground">
              Fees are billed monthly in advance. All fees are non-refundable unless
              otherwise specified. We reserve the right to change pricing with 30 days
              notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Intellectual Property</h2>
            <p className="text-muted-foreground">
              The service and its original content, features, and functionality are
              owned by Seq3nce.ai and are protected by international copyright,
              trademark, and other intellectual property laws.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              Seq3nce.ai shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages resulting from your use of or
              inability to use the service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Termination</h2>
            <p className="text-muted-foreground">
              We may terminate or suspend your account at any time for violations of
              these terms. You may cancel your account at any time by contacting us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Contact</h2>
            <p className="text-muted-foreground">
              For questions about these Terms, please contact us at legal@sequ3nce.ai
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
