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
              By accessing or using Sequ3nce.ai, you agree to be bound by these Terms
              of Service. If you do not agree to these terms, please do not use our
              service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground mb-4">
              Sequ3nce.ai provides sales call intelligence software that enables
              real-time call monitoring, transcription, and analytics for sales teams.
              Our service includes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Desktop Application:</strong> Software for capturing and streaming audio from sales calls</li>
              <li><strong>Real-time Transcription:</strong> Automatic speech-to-text conversion of recorded calls</li>
              <li><strong>AI Analysis:</strong> Automated detection of objections, buying signals, and key moments</li>
              <li><strong>Web Dashboard:</strong> Interface for reviewing calls, transcripts, and analytics</li>
              <li><strong>Team Management:</strong> Tools for managing sales team members and their performance</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. User Accounts</h2>
            <p className="text-muted-foreground mb-4">
              When you create an account with us, you must provide accurate and complete information.
              You are responsible for:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized access</li>
              <li>Ensuring team members added to your account comply with these terms</li>
            </ul>
            <p className="text-muted-foreground">
              You may not share account credentials or allow multiple individuals to use a single account
              unless specifically authorized by your subscription plan.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Call Recording Compliance</h2>
            <p className="text-muted-foreground mb-4">
              <strong>You are solely responsible for compliance with all applicable laws regarding call recording.</strong>
              This includes but is not limited to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li>Obtaining all necessary consents from call participants before recording</li>
              <li>Understanding and complying with one-party vs. two-party consent requirements in your jurisdiction</li>
              <li>Providing appropriate disclosures to call participants as required by law</li>
              <li>Maintaining records of consent where required</li>
            </ul>
            <p className="text-muted-foreground">
              Sequ3nce.ai does not provide legal advice. We strongly recommend consulting with legal
              counsel to ensure your use of our service complies with applicable laws in your jurisdiction.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Acceptable Use</h2>
            <p className="text-muted-foreground mb-4">You agree not to use the service to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Record calls without proper consent or in violation of applicable laws</li>
              <li>Engage in any fraudulent, deceptive, or misleading activity</li>
              <li>Harass, abuse, or harm another person</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Attempt to gain unauthorized access to any portion of the service</li>
              <li>Use automated means to access the service without our permission</li>
              <li>Upload or transmit viruses or malicious code</li>
              <li>Resell or redistribute the service without authorization</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Subscription and Payment</h2>
            <p className="text-muted-foreground mb-4">
              Our service is offered on a subscription basis with the following terms:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li><strong>Billing Cycle:</strong> Fees are billed monthly in advance based on your selected plan</li>
              <li><strong>Payment Processing:</strong> All payments are processed securely through Stripe</li>
              <li><strong>Seat-Based Pricing:</strong> Additional team members may incur additional fees per your plan</li>
              <li><strong>Failed Payments:</strong> We may suspend service after repeated failed payment attempts</li>
              <li><strong>Price Changes:</strong> We will provide 30 days notice before any pricing changes take effect</li>
            </ul>
            <p className="text-muted-foreground">
              Refunds may be provided at our discretion for annual subscriptions cancelled within 14 days of
              purchase. Monthly subscriptions are non-refundable.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Data Ownership</h2>
            <p className="text-muted-foreground mb-4">
              You retain all rights to the content you upload or create through our service, including
              call recordings, transcripts, and associated data. By using our service, you grant us a
              limited license to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li>Process your audio for transcription and analysis</li>
              <li>Store your data securely on our systems</li>
              <li>Display your data back to you through our interface</li>
              <li>Generate aggregated, anonymized insights for service improvement</li>
            </ul>
            <p className="text-muted-foreground">
              We will never sell your data or use your recordings to train AI models for third parties.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Intellectual Property</h2>
            <p className="text-muted-foreground mb-4">
              The service and its original content, features, and functionality are owned by
              Sequ3nce.ai and are protected by international copyright, trademark, and other
              intellectual property laws. This includes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Our software, including the desktop application and web dashboard</li>
              <li>Our AI models and analysis algorithms</li>
              <li>Our brand, logos, and trademarks</li>
              <li>Our documentation and training materials</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">9. Service Availability</h2>
            <p className="text-muted-foreground mb-4">
              We strive to maintain high availability but do not guarantee uninterrupted service.
              We may:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Perform scheduled maintenance with reasonable advance notice</li>
              <li>Experience occasional outages due to factors beyond our control</li>
              <li>Modify or discontinue features with reasonable notice</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
              EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
              ERROR-FREE, OR COMPLETELY SECURE. TRANSCRIPTION AND AI ANALYSIS ARE PROVIDED FOR
              INFORMATIONAL PURPOSES AND MAY CONTAIN ERRORS. YOU ARE RESPONSIBLE FOR VERIFYING
              THE ACCURACY OF ANY INFORMATION BEFORE RELYING ON IT.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">11. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SEQU3NCE.AI SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li>Any indirect, incidental, special, consequential, or punitive damages</li>
              <li>Loss of profits, data, business opportunities, or goodwill</li>
              <li>Damages resulting from transcription or analysis errors</li>
              <li>Damages resulting from unauthorized access to your account</li>
              <li>Any amount exceeding the fees paid by you in the 12 months preceding the claim</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">12. Indemnification</h2>
            <p className="text-muted-foreground">
              You agree to indemnify and hold harmless Sequ3nce.ai, its officers, directors, employees,
              and agents from any claims, damages, losses, or expenses (including reasonable attorney
              fees) arising from your use of the service, your violation of these terms, or your
              violation of any applicable law, including call recording laws.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">13. Termination</h2>
            <p className="text-muted-foreground mb-4">
              Either party may terminate this agreement:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
              <li><strong>By You:</strong> Cancel your subscription at any time through your account settings or by contacting us</li>
              <li><strong>By Us:</strong> We may suspend or terminate your account for violation of these terms, non-payment, or other reasonable cause with notice</li>
              <li><strong>Immediate Termination:</strong> We may terminate immediately for serious violations including illegal activity</li>
            </ul>
            <p className="text-muted-foreground">
              Upon termination, you may request export of your data within 30 days. After this period,
              we may delete your data in accordance with our retention policies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">14. Governing Law</h2>
            <p className="text-muted-foreground">
              These terms shall be governed by and construed in accordance with the laws of the
              United States, without regard to conflict of law principles. Any disputes shall be
              resolved in the courts of the United States.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">15. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We may update these Terms from time to time. We will notify you of material changes
              by posting the new terms on this page and updating the &quot;Last updated&quot; date. Your
              continued use of the service after changes become effective constitutes acceptance
              of the revised terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">16. Contact</h2>
            <p className="text-muted-foreground">
              For questions about these Terms of Service, please contact us at legal@sequ3nce.ai
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
