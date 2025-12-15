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
            Last updated: December 2024
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Information We Collect</h2>
            <p className="text-muted-foreground mb-4">
              We collect information you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Account information (name, email, company)</li>
              <li>Call recordings and transcripts</li>
              <li>Usage data and analytics</li>
              <li>Payment information</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. How We Use Your Information</h2>
            <p className="text-muted-foreground mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. Data Security</h2>
            <p className="text-muted-foreground">
              We take reasonable measures to help protect your personal information from
              loss, theft, misuse, unauthorized access, disclosure, alteration, and
              destruction. All data is encrypted in transit and at rest.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your information for as long as your account is active or as
              needed to provide you services. You can request deletion of your data at
              any time by contacting us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have any questions about this Privacy Policy, please contact us at
              privacy@sequ3nce.ai
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
