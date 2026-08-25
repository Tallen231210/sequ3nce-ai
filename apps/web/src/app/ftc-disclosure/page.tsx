import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "FTC Disclosure — Sequ3nce",
  robots: { index: false, follow: false },
};

export default function FtcDisclosurePage() {
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
          className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Link>

        <h1 className="mb-8 text-4xl font-semibold tracking-tight">FTC Disclosure</h1>

        <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            This disclosure is provided in accordance with the Federal Trade Commission&rsquo;s
            guidelines concerning the use of endorsements and testimonials in advertising
            (16 CFR Part 255).
          </p>
          <h2 className="pt-2 text-xl font-semibold text-foreground">How we make money</h2>
          <p>
            Sequ3nce is a software company. The training program, role board, and community
            referenced on our pages are provided at no charge; we earn revenue from the software
            subscription required to use them, and from businesses that subscribe to our team
            products. When our pages say the training is free, that is the arrangement being
            described: the education costs nothing, and the software subscription is the only
            purchase involved.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-foreground">Testimonials and results</h2>
          <p>
            Any student results, income figures, or testimonials shown on our pages reflect the
            experiences of specific individuals. They are not typical, are provided for
            illustration only, and are not a promise or guarantee of your own results. See our{" "}
            <Link href="/income-disclosure" className="underline">
              Income Disclosure
            </Link>{" "}
            for more detail.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-foreground">Affiliates and referrals</h2>
          <p>
            Some people who share Sequ3nce may receive compensation if you subscribe through
            their link. If a creator, publisher, or member of our community refers you to us,
            you should assume they have a material connection to Sequ3nce and may be compensated
            for the referral. This does not change the price you pay.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-foreground">Questions</h2>
          <p>
            If anything on our pages is unclear, contact us at{" "}
            <a href="mailto:privacy@sequ3nce.ai" className="underline">
              privacy@sequ3nce.ai
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
