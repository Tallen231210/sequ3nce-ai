import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Income Disclosure — Sequ3nce",
  robots: { index: false, follow: false },
};

export default function IncomeDisclosurePage() {
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

        <h1 className="mb-8 text-4xl font-semibold tracking-tight">Income Disclosure</h1>

        <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            Sequ3nce provides sales education, software, and introductions to companies that hire
            commission-based sales representatives. We do not sell a business opportunity, and we
            do not guarantee employment, placement, or income of any kind.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-foreground">Results are not typical</h2>
          <p>
            Any income figures, compensation ranges, or student results referenced on our pages
            describe specific roles or the experiences of specific individuals. They are
            illustrations of what is possible in commission sales, not what is typical, promised,
            or average. Many people who study sales never take a role; many who take a role earn
            less than the figures shown; some earn nothing.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-foreground">Your results depend on you</h2>
          <p>
            Commission-based sales income depends on factors we do not control, including the
            offer you sell, the company you work with, market conditions, and above all the
            consistency of your own work over months. Nothing on our pages should be read as a
            projection of your earnings.
          </p>
          <h2 className="pt-2 text-xl font-semibold text-foreground">Not professional advice</h2>
          <p>
            Our content is educational. It is not financial, legal, or tax advice. Decisions about
            your career and finances are yours, and we encourage you to make them carefully.
          </p>
          <p>
            Questions? Contact{" "}
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
