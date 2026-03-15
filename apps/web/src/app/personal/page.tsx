"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { AnimatedSection, FAQItem } from "@/components/landing/shared";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Sparkles,
  Film,
  BarChart3,
  Users,
  Check,
  Download,
  Calendar,
  Target,
  GraduationCap,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

/* ─── Data ───────────────────────────────────────── */

const painPoints = [
  {
    text: '"Anyone can claim a 40% close rate on LinkedIn."',
    body: "But can they prove it? Sequ3nce verifies stats from actual recorded calls — not self-reported numbers.",
  },
  {
    text: '"You change companies. Your stats disappear."',
    body: "Your track record follows YOU, not your employer. Build once, carry forever.",
  },
  {
    text: '"Hiring managers can\'t evaluate closers."',
    body: 'Resume says "$2M in sales." From how many calls? What close rate? Sequ3nce shows the real numbers.',
  },
];

const features = [
  {
    icon: Sparkles,
    title: "Call intelligence built for closers",
    description:
      "Every call recorded, transcribed, and analyzed by AI. See exactly which objections you're losing to, where your talk ratio slips, and what you need to work on — purpose-built for high-ticket closers, not generic meeting notes.",
    size: "large" as const,
  },
  {
    icon: Briefcase,
    title: "Get hired by verified companies",
    description:
      "Browse job postings from companies already using Sequ3nce. One click shares your verified profile with hiring managers — no resume, no cover letter, just proof you can close.",
    size: "large" as const,
  },
  {
    icon: GraduationCap,
    title: "World-class sales training",
    description:
      "Access training content from top closers in the industry. Learn the frameworks, objection handling techniques, and closing strategies that actually work in high-ticket sales.",
    size: "small" as const,
  },
  {
    icon: Users,
    title: "Network with elite closers",
    description:
      "Connect with high-performing closers across industries. Share insights, trade strategies, and build relationships with the best in the game.",
    size: "small" as const,
  },
  {
    icon: BadgeCheck,
    title: "A profile that proves it",
    description:
      "Your public profile shows verified close rate, cash collected, and avg deal size — all computed from actual recorded calls, not self-reported.",
    size: "small" as const,
  },
  {
    icon: Target,
    title: "Know exactly what to improve",
    description:
      "5-dimension scoring, objection analysis, chapter breakdowns, and talk/listen ratios. See your weak spots and track your growth over time.",
    size: "small" as const,
  },
];

const steps = [
  {
    number: "01",
    icon: Download,
    title: "Download the app",
    description: "Install Sequ3nce Personal on Mac or Windows. Create your account.",
  },
  {
    number: "02",
    icon: Calendar,
    title: "Record your calls",
    description: "Connect your calendar. Our bot auto-joins Zoom, Meet, and Teams.",
  },
  {
    number: "03",
    icon: BadgeCheck,
    title: "Build your profile",
    description: "Stats verify automatically. Share your profile link anywhere.",
  },
];

const pricingFeatures = [
  "Unlimited call recordings & AI analysis",
  "Objection tracking & performance insights",
  "Verified public closer profile",
  "Highlight reel builder",
  "Job board — get hired by verified companies",
  "World-class sales training from top closers",
  "Networking with elite closers",
  "Stats dashboard & calendar integration",
];

const faqs = [
  {
    question: "What if I already use Sequ3nce through my company?",
    answer:
      "Your Personal subscription is separate. Your profile and stats belong to you, not your employer.",
  },
  {
    question: "How are stats verified?",
    answer:
      "Every call recorded through Sequ3nce is analyzed automatically. Close rate, cash collected, and other metrics are computed from real call data — not self-reported.",
  },
  {
    question: "Can prospects see my recordings?",
    answer:
      "Only clips you explicitly add to your highlight reel are visible. Prospect-side audio is blurred by default. Full recordings stay private.",
  },
  {
    question: "What call platforms are supported?",
    answer:
      "Zoom, Google Meet, and Microsoft Teams. Our bot auto-joins via calendar integration.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. No contracts, no commitments. Cancel directly in the app.",
  },
  {
    question: "How is this different from Gong or Chorus?",
    answer:
      "Those are B2B tools owned by companies. Sequ3nce Personal is for YOU — your stats, your profile, your career. It follows you wherever you go.",
  },
];

/* ─── Component ──────────────────────────────────── */

export default function PersonalLandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <main className="min-h-screen bg-white relative overflow-hidden">
      {/* ═══ NAV ═══ */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          isScrolled
            ? "top-4 mx-4 rounded-2xl bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-lg shadow-zinc-200/20 h-14"
            : "bg-white/60 backdrop-blur-sm h-16"
        )}
      >
        <div className="mx-auto max-w-7xl h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Logo href="/personal" height={22} />
            <nav className="hidden md:flex items-center gap-8">
              {[
                { label: "Features", id: "features" },
                { label: "Pricing", id: "pricing" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className="text-[13px] text-zinc-500 hover:text-zinc-900 transition-colors tracking-wide"
                >
                  {item.label}
                </button>
              ))}
              <Link
                href="/"
                className="text-[13px] text-zinc-400 hover:text-zinc-900 transition-colors tracking-wide"
              >
                For Teams &rarr;
              </Link>
            </nav>
          </div>
          <Link
            href="/personal/download"
            className="bg-zinc-900 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Download App
          </Link>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="pt-36 pb-20 lg:pt-44 lg:pb-28 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-semibold tracking-[-0.03em] text-zinc-950 leading-[0.95]">
                Your sales career
                <span className="text-zinc-300">,</span>
                <br />
                verified
                <span className="text-zinc-300">.</span>
              </h1>
              <p className="mt-8 text-lg lg:text-xl text-zinc-500 max-w-2xl mx-auto leading-relaxed">

                The call recording tool that makes Fathom look like a toy — built
                specifically for high-performing closers. Record every call, verify
                your stats, build your profile, and get discovered by top companies. $129.99/mo.
              </p>
              <div className="mt-10">
                <Link
                  href="/personal/download"
                  className="inline-flex items-center bg-zinc-900 text-white font-medium px-8 py-4 rounded-xl text-[15px] hover:bg-zinc-800 transition-colors"
                >
                  Download the App
                  <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          </AnimatedSection>

          {/* Stats strip */}
          <AnimatedSection delay={200}>
            <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-2xl mx-auto">
              {[
                { label: "$129.99/mo", sub: "Everything included" },
                { label: "AI Analysis", sub: "After every call" },
                { label: "Elite Training", sub: "From top closers" },
                { label: "Job Board", sub: "Verified companies" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="text-center py-4 px-3 rounded-xl bg-zinc-50 border border-zinc-100"
                >
                  <div className="text-lg font-semibold text-zinc-900">
                    {s.label}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ PAIN POINTS ═══ */}
      <section className="py-24 lg:py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-zinc-950 leading-tight">
                Your track record should
                <br />
                be verifiable
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid lg:grid-cols-12 gap-5">
            {/* Featured card */}
            <AnimatedSection className="lg:col-span-7">
              <div className="h-full rounded-2xl border border-zinc-200 bg-zinc-50 p-8 lg:p-10 flex flex-col justify-center">
                <span className="text-6xl lg:text-7xl font-serif text-zinc-200 leading-none mb-4">
                  &ldquo;
                </span>
                <p className="text-xl lg:text-2xl font-medium text-zinc-900 leading-snug mb-4">
                  {painPoints[0].text.replace(/"/g, "")}
                </p>
                <p className="text-[15px] text-zinc-500 leading-relaxed">
                  {painPoints[0].body}
                </p>
              </div>
            </AnimatedSection>

            {/* Stacked cards */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              {painPoints.slice(1).map((pp, i) => (
                <AnimatedSection key={i} delay={(i + 1) * 100}>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-7">
                    <p className="font-medium text-zinc-900 mb-2">
                      {pp.text.replace(/"/g, "")}
                    </p>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      {pp.body}
                    </p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES BENTO ═══ */}
      <section id="features" className="py-24 lg:py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-zinc-950 leading-tight">
                Train harder
                <span className="text-zinc-300">.</span>
                {" "}Close better
                <span className="text-zinc-300">.</span>
                <br />
                Get hired
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              const colSpan = feature.size === "large" ? "lg:col-span-3" : "lg:col-span-2";
              const isFirst = feature.size === "large";
              return (
                <AnimatedSection
                  key={feature.title}
                  className={cn("sm:col-span-1", colSpan)}
                  delay={i * 80}
                >
                  <div
                    className={cn(
                      "group h-full rounded-2xl border border-zinc-200 bg-white p-7 transition-all duration-200 hover:shadow-lg hover:shadow-zinc-100 hover:border-zinc-300",
                      isFirst && "sm:col-span-2 lg:col-span-3"
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mb-5 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <h3 className="font-semibold text-zinc-900 text-[15px] mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-24 lg:py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center mb-20">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-zinc-950 leading-tight">
                Three steps
                <span className="text-zinc-300">.</span>
                {" "}That&apos;s it
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12 max-w-5xl mx-auto">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <AnimatedSection key={step.number} delay={i * 150}>
                  <div className="text-center md:text-left">
                    <div className="text-[100px] lg:text-[120px] font-semibold text-zinc-100 leading-none tracking-tighter mb-2">
                      {step.number}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-zinc-900 text-white flex items-center justify-center mb-5">
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <h3 className="font-semibold text-zinc-900 text-lg mb-2">
                      {step.title}
                    </h3>
                    <p className="text-[15px] text-zinc-500 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="hidden md:block border-r border-zinc-200 absolute right-0 top-[120px] h-[calc(100%-140px)]" />
                  )}
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="py-24 lg:py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-zinc-950 leading-tight">
                One plan
                <span className="text-zinc-300">.</span>
                <br />
                Everything included
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <div className="max-w-md mx-auto rounded-2xl border-2 border-zinc-900 bg-white p-8 lg:p-10">
              <div className="text-center mb-8">
                <div className="text-5xl lg:text-6xl font-bold text-zinc-900">
                  $129
                  <span className="text-3xl font-bold">.99</span>
                  <span className="text-2xl font-medium text-zinc-400">/mo</span>
                </div>
                <p className="text-sm text-zinc-500 mt-2">
                  Cancel anytime. No contracts.
                </p>
              </div>

              <div className="space-y-3 mb-8">
                {pricingFeatures.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-zinc-600" strokeWidth={2.5} />
                    </div>
                    <span className="text-[15px] text-zinc-700">{f}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/personal/download"
                className="block w-full bg-zinc-900 text-white text-center font-medium py-3.5 rounded-xl hover:bg-zinc-800 transition-colors"
              >
                Download &amp; Get Started
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="py-24 lg:py-32 relative z-10">
        <div className="mx-auto max-w-3xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-zinc-950">
                Questions? We&apos;ve got answers.
              </h2>
            </div>
            <div>
              {faqs.map((faq, index) => (
                <FAQItem key={index} index={index} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="py-32 lg:py-44 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center">
              <h2 className="text-5xl sm:text-6xl lg:text-7xl xl:text-[8rem] font-semibold tracking-[-0.03em] text-zinc-950 leading-[0.9]">
                Your stats
                <span className="text-zinc-300">.</span>
                <br />
                Your profile
                <span className="text-zinc-300">.</span>
                <br />
                Your career
                <span className="text-zinc-300">.</span>
              </h2>
              <p className="mt-10 text-lg lg:text-xl text-zinc-500 max-w-xl mx-auto leading-relaxed">
                Start building your verified track record today.
              </p>
              <div className="mt-14">
                <Link
                  href="/personal/download"
                  className="inline-flex items-center bg-zinc-900 text-white font-medium px-8 py-4 rounded-xl text-[15px] hover:bg-zinc-800 transition-colors"
                >
                  Download Sequ3nce Personal
                  <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-zinc-200 relative z-10">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="md:col-span-2">
              <Logo height={28} />
              <p className="mt-4 text-sm text-zinc-500 max-w-xs leading-relaxed">
                Sales career tools for individual high-ticket closers.
                Verified stats, AI coaching, and a profile that proves it.
              </p>
            </div>

            <div>
              <h4 className="text-[10px] font-medium tracking-[0.25em] uppercase text-zinc-400 mb-5">
                Product
              </h4>
              <ul className="space-y-3 text-sm text-zinc-500">
                {[
                  { label: "Features", id: "features" },
                  { label: "Pricing", id: "pricing" },
                  { label: "FAQ", id: "faq" },
                ].map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => scrollToSection(item.id)}
                      className="hover:text-zinc-900 transition-colors"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] font-medium tracking-[0.25em] uppercase text-zinc-400 mb-5">
                Links
              </h4>
              <ul className="space-y-3 text-sm text-zinc-500">
                <li>
                  <Link href="/" className="hover:text-zinc-900 transition-colors">
                    For Teams
                  </Link>
                </li>
                <li>
                  <Link href="/personal/download" className="hover:text-zinc-900 transition-colors">
                    Download App
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-zinc-900 transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-zinc-900 transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-zinc-200 mt-16 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-zinc-400">
              &copy; 2026 Sequ3nce.ai. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
