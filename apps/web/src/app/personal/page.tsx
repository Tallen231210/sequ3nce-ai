"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { AnimatedSection, FAQItem } from "@/components/landing/shared";
import {
  ArrowRight,
  Brain,
  BadgeCheck,
  Briefcase,
  Film,
  Users,
  Check,
  Play,
  Zap,
  Target,
  GraduationCap,
  Mic,
} from "lucide-react";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/* ─── Data ───────────────────────────────────────── */

// Manually-updated spot counter. Bump this constant as signups come in.
// Wire to live GHL contact count in Phase 2 (see landing-page plan).
const SPOTS_TAKEN = 67;
const SPOTS_TOTAL = 100;
const SPOTS_REMAINING = SPOTS_TOTAL - SPOTS_TAKEN;

// Doc's 3-block headline/body format — replaces the 4-bullet shorthand.
const proofBlocks = [
  {
    headline: "Anyone can claim a 40% close rate on LinkedIn.",
    body: "Almost nobody can prove it. Sequ3nce verifies your stats from real recorded calls — not a number you typed into a resume.",
  },
  {
    headline: "Change companies, and your track record disappears.",
    body: "Not here. Your stats follow YOU, not your employer. Build it once. Carry it forever.",
  },
  {
    headline: "Hiring managers can't tell a real closer from a good talker.",
    body: '"I did $2M in sales." From how many calls? At what close rate? Sequ3nce shows the receipts.',
  },
];

// Full 8-feature list per the latest doc.
const features = [
  {
    icon: Brain,
    title: "Call intelligence built for closers",
    description:
      "Every call recorded, transcribed, and analyzed. See which objections are killing your deals, where your talk ratio slips, and exactly what to fix next. Built for high-ticket closers — not generic meeting notes.",
  },
  {
    icon: Briefcase,
    title: "Get hired by verified companies",
    description:
      "Browse roles from companies already running Sequ3nce. One click sends your verified profile to the hiring manager. No resume. No cover letter. Just proof you can close.",
  },
  {
    icon: BadgeCheck,
    title: "A profile that proves it",
    description:
      "Your public profile shows verified close rate, cash collected, and average deal size — all computed from real recorded calls. Self-reported numbers are dead.",
  },
  {
    icon: Target,
    title: "Know exactly what to improve",
    description:
      "5-dimension scoring, objection analysis, chapter breakdowns, and talk/listen ratios. See your weak spots. Track your growth. Watch the line go up.",
  },
  {
    icon: Film,
    title: "Highlight reel builder",
    description:
      "Stack your best moments into a reel that does the talking for you. Prospect-side audio blurred by default — only what you choose to show gets shown.",
  },
  {
    icon: Mic,
    title: "Sequ3nce Stream — voice dictation for closers",
    description:
      "Hold a key, speak, release. Your words land wherever your cursor is. Follow-up emails, CRM notes, proposals, call notes — all by voice, at the speed closers actually work.",
  },
  {
    icon: GraduationCap,
    title: "World-class sales training",
    description:
      "Frameworks, objection handling, and closing strategy from the top closers in the game. The stuff that actually works on high-ticket calls.",
  },
  {
    icon: Users,
    title: "Network with elite closers",
    description:
      "Trade strategy with the best in the industry. The room you're in is the rate you'll close at.",
  },
];

const steps = [
  {
    number: "01",
    title: "Get your link",
    description:
      "Enter your email. We send your download link instantly. Install Sequ3nce on Mac or Windows in under two minutes.",
  },
  {
    number: "02",
    title: "Record your calls",
    description: "Connect your calendar. Our bot auto-joins Zoom, Meet, and Teams.",
  },
  {
    number: "03",
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
    question: "Do I need a computer to use Sequ3nce?",
    answer:
      "Yes — Sequ3nce runs on Mac and Windows so it can sit on your calls and capture everything cleanly. Enter your email and we'll send your install link instantly, so it's waiting for you the moment you're at your desk.",
  },
  {
    question: "What if I already use Sequ3nce through my company?",
    answer:
      "Your Personal subscription is separate. Your profile and stats belong to you, not your employer.",
  },
  {
    question: "How are stats verified?",
    answer:
      "Every call recorded through Sequ3nce is analyzed automatically. Close rate, cash collected, and other metrics are computed from real call data — never self-reported.",
  },
  {
    question: "Can prospects see my recordings?",
    answer:
      "Only clips you add to your highlight reel. Prospect-side audio is blurred by default. Full recordings stay private.",
  },
  {
    question: "What call platforms are supported?",
    answer:
      "Zoom, Google Meet, and Microsoft Teams. Our bot auto-joins via calendar integration.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. No contracts, no commitments. Cancel right in the app.",
  },
  {
    question: "How is this different from Gong or Chorus?",
    answer:
      "Those are B2B tools owned by your company. Sequ3nce Personal is for YOU — your stats, your profile, your career. It follows you wherever you go.",
  },
];

/* ─── Component ──────────────────────────────────── */

export default function PersonalLandingPage() {
  return (
    <Suspense>
      <PersonalLandingPageInner />
    </Suspense>
  );
}


function PersonalLandingPageInner() {
  const searchParams = useSearchParams();
  const refParam = searchParams.get("ref") || undefined;
  void refParam; // affiliate attribution moved with the lead form; param kept for future use
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setIsScrolled(y > 10);
      // Sticky CTA appears after the hero form passes (~600px) and hides
      // before the footer CTA so it doesn't overlap the dark close.
      const doc = document.documentElement;
      const nearBottom =
        y + window.innerHeight > doc.scrollHeight - window.innerHeight * 0.8;
      setShowStickyCta(y > 600 && !nearBottom);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // The landing page stopped being a funnel (2026-08-21): no lead capture,
  // no nurture entry — a visitor who wants in goes straight to checkout.
  // Rep-driven acquisition lives at /start; this page is the public face
  // and the self-serve door. Name kept so every CTA call-site updates at once.
  const scrollToForm = useCallback(() => {
    router.push("/personal/checkout");
  }, [router]);

  return (
    <main className="min-h-screen bg-white relative overflow-hidden">
      {/* ═══ URGENCY BANNER (sticky top) ═══ */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-zinc-900 text-white text-center text-[12px] sm:text-[13px] font-medium py-2 px-4 shadow-sm">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span>
            Plans from $83/mo — cancel anytime
          </span>
          <span className="mx-1.5 hidden text-zinc-600 sm:inline">·</span>
          <Link
            href="/login"
            className="hidden text-zinc-400 underline underline-offset-2 transition-colors hover:text-white sm:inline"
          >
            On a company team? Log in here
          </Link>
        </span>
      </div>

      {/* ═══ NAV ═══ */}
      <header
        className={cn(
          "fixed left-0 right-0 z-50 transition-all duration-300",
          // Sits below the urgency banner (which is ~32px tall)
          isScrolled
            ? "top-[40px] sm:top-[36px] mx-4 rounded-2xl bg-white/85 backdrop-blur-xl border border-zinc-200/60 shadow-lg shadow-zinc-200/20 h-14"
            : "top-[32px] bg-white/70 backdrop-blur-sm h-16",
        )}
      >
        <div className="mx-auto max-w-7xl h-full px-5 sm:px-6 flex items-center justify-between">
          <Logo href="/personal" height={22} />
          <button
            onClick={scrollToForm}
            className="bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-semibold px-4 sm:px-5 py-2.5 rounded-lg transition-colors"
          >
            Get Access
          </button>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="pt-32 sm:pt-36 lg:pt-44 pb-16 lg:pb-20 relative z-10 overflow-hidden">
        {/* Background: faint dot grid + radial fade (Vercel-style) */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-white/60 to-white"
        />
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <AnimatedSection>
            <div className="text-center">
              {/* Scarcity pill */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-200 bg-zinc-50 text-[12px] font-medium text-zinc-700 mb-7">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-900 opacity-50" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-900" />
                </span>
                Built by closers doing $50k+ months
              </div>

              {/* Eyebrow */}
              <p className="text-[12px] sm:text-[13px] uppercase tracking-[0.22em] text-zinc-500 mb-4 sm:mb-5">
                The app top closers won&apos;t work without.
              </p>

              {/* Headline */}
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.04em] text-zinc-950 leading-[0.95]">
                The world&apos;s first{" "}
                <span className="font-serif italic font-normal">personal</span>{" "}
                sales tracker built by top{" "}
                <span className="font-serif italic font-normal">performers</span>
                <span className="text-zinc-300">.</span>
              </h1>

              {/* Subheadline (doc body) */}
              <p className="mt-8 text-base sm:text-lg text-zinc-600 max-w-xl mx-auto leading-relaxed">
                Record every call. Verify your real numbers. Build a profile that
                proves you can close — and get found by the companies paying the
                highest commissions. Training wheels if you&apos;re starting out — jet
                fuel if you&apos;re already closing.
              </p>

              {/* Pricing line — separate visual emphasis */}
              <p className="mt-5 text-[13px] sm:text-sm text-zinc-700 max-w-md mx-auto leading-relaxed">
                Plans from{" "}
                <span className="font-semibold text-zinc-900">$83/mo</span>{" "}
                billed annually — or month-to-month at $150. Pick your plan, set
                your password, download the app. Five minutes to your first
                recorded call.
              </p>
            </div>
          </AnimatedSection>

          {/* Direct CTA — the lead form is gone; buying is the only step. */}
          <AnimatedSection delay={100}>
            <div className="mt-10 text-center">
              <button
                onClick={scrollToForm}
                className="inline-block bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors"
              >
                Get Access →
              </button>
              <p className="mt-3 text-[12px] text-zinc-500">
                Pick a plan, set your password, download the app.
              </p>
            </div>
          </AnimatedSection>

          {/* Demo video — hidden behind button, lazy-load on click */}
          <AnimatedSection delay={200}>
            <div className="mt-12 max-w-2xl mx-auto">
              {!videoOpen ? (
                <button
                  onClick={() => setVideoOpen(true)}
                  className="inline-flex items-center gap-2 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 transition-colors mx-auto"
                  style={{ display: "flex" }}
                >
                  <span className="w-9 h-9 rounded-full bg-zinc-900 text-white flex items-center justify-center">
                    <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
                  </span>
                  Watch how it works — 2 min demo
                </button>
              ) : (
                <div
                  className="relative w-full rounded-2xl overflow-hidden border border-zinc-200/60 shadow-xl shadow-zinc-200/30 bg-zinc-50"
                  style={{ paddingBottom: "56.25%" }}
                >
                  <iframe
                    src="https://share.descript.com/embed/I65Zekf6Wkg"
                    className="absolute inset-0 w-full h-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    frameBorder="0"
                  />
                </div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ MARQUEE STRIP — scrolling brand words for motion + emphasis ═══ */}
      <section
        aria-hidden
        className="relative z-10 py-4 sm:py-5 overflow-hidden border-y border-zinc-200 bg-zinc-50/60"
      >
        <div className="marquee-track flex whitespace-nowrap will-change-transform">
          {Array.from({ length: 2 }).map((_, dup) => (
            <div
              key={dup}
              className="flex items-center gap-10 sm:gap-14 pr-10 sm:pr-14 text-[12px] sm:text-[13px] font-semibold uppercase tracking-[0.25em] text-zinc-400 shrink-0"
            >
              {[
                "Verified Stats",
                "Live AI Coaching",
                "Portable Career",
                "Elite Community",
                "Highlight Reels",
                "Real Numbers",
                "Job Board Access",
              ].map((word) => (
                <span key={`${dup}-${word}`} className="flex items-center gap-10 sm:gap-14">
                  <span>{word}</span>
                  <span aria-hidden className="text-zinc-300">
                    ✦
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <style jsx>{`
          .marquee-track {
            animation: marquee 38s linear infinite;
          }
          @keyframes marquee {
            from {
              transform: translateX(0);
            }
            to {
              transform: translateX(-50%);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .marquee-track {
              animation: none;
            }
          }
        `}</style>
      </section>

      {/* ═══ PROOF BAR ═══ */}
      <section className="pt-12 lg:pt-16 pb-12 lg:pb-16 relative z-10">
        <div className="mx-auto max-w-4xl px-5 sm:px-6">
          <AnimatedSection>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto">
              {[
                { label: "From $83/mo", sub: "Cancel anytime" },
                { label: "AI Analysis", sub: "After every call" },
                { label: "Elite Training", sub: "From top closers" },
                { label: "Job Board", sub: "Verified companies" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="text-center py-4 px-2 sm:px-3 rounded-xl bg-zinc-50 border border-zinc-100"
                >
                  <div className="text-base sm:text-lg font-semibold text-zinc-900">
                    {s.label}
                  </div>
                  <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">
                    {s.sub}
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ INLINE URGENCY CALLOUT ═══ */}
      <section className="pb-16 lg:pb-20 relative z-10">
        <div className="mx-auto max-w-2xl px-5 sm:px-6">
          <AnimatedSection>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 sm:p-6">
              <p className="text-[14px] sm:text-[15px] text-zinc-900 leading-relaxed">
                <span className="mr-1.5">🔒</span>
                <span className="font-semibold">Commit longer, pay less.</span>{" "}
                Month-to-month is $150. A quarter drops it to $133/mo, six months
                to $100/mo, and the yearly plan is $1,000 flat — under $84 a month.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ PROBLEM SECTION (dark — second visual rhythm break) ═══ */}
      <section className="py-24 lg:py-36 relative z-10 bg-zinc-950 text-white overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(63 63 70) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%)",
          }}
        />
        <div className="mx-auto max-w-3xl px-5 sm:px-6 relative">
          <AnimatedSection>
            <h2 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.04em] leading-[0.95] text-center mb-14 lg:mb-20">
              Your sales career
              <span className="text-zinc-600">,</span>
              <br />
              <span className="font-serif italic font-normal">verified</span>
              <span className="text-zinc-600">.</span>
            </h2>
          </AnimatedSection>
          <div className="space-y-4 sm:space-y-5">
            {proofBlocks.map((block, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="rounded-2xl bg-zinc-900/50 backdrop-blur border border-zinc-800 p-6 sm:p-8 transition-colors hover:border-zinc-700">
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-3 leading-tight">
                    {block.headline}
                  </h3>
                  <p className="text-[14px] sm:text-[15px] text-zinc-400 leading-relaxed">
                    {block.body}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES (8) ═══ */}
      <section id="features" className="py-20 lg:py-28 relative z-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <AnimatedSection>
            <div className="text-center mb-12 lg:mb-16">
              <h2 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.04em] text-zinc-950 leading-[0.95]">
                Train harder
                <span className="text-zinc-300">.</span>
                <br />
                Close better
                <span className="text-zinc-300">.</span>{" "}
                <span className="font-serif italic font-normal">Get hired</span>
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>

          {/* Bento grid: first card (Call intelligence) spans 2 cols as the
              hero feature, then 6 standard cards fill in around it on a
              4-col desktop / 2-col tablet grid. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              const isFeatured = i === 0;
              return (
                <AnimatedSection
                  key={feature.title}
                  delay={i * 60}
                  className={cn(
                    isFeatured && "sm:col-span-2 lg:col-span-2 lg:row-span-2",
                  )}
                >
                  <div
                    className={cn(
                      "group h-full rounded-2xl border border-zinc-200 bg-white p-6 transition-all duration-200",
                      "hover:shadow-xl hover:shadow-zinc-200/40 hover:border-zinc-300 hover:-translate-y-0.5",
                      isFeatured && "p-7 sm:p-9 flex flex-col justify-between",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-xl bg-zinc-100 text-zinc-900 flex items-center justify-center transition-colors group-hover:bg-zinc-900 group-hover:text-white",
                        isFeatured ? "w-12 h-12 mb-6" : "w-10 h-10 mb-4",
                      )}
                    >
                      <Icon
                        className={isFeatured ? "h-6 w-6" : "h-5 w-5"}
                        strokeWidth={2}
                      />
                    </div>
                    <div className={isFeatured ? "mt-6" : ""}>
                      <h3
                        className={cn(
                          "font-semibold text-zinc-900 mb-2",
                          isFeatured
                            ? "text-xl sm:text-2xl tracking-tight"
                            : "text-[15px]",
                        )}
                      >
                        {feature.title}
                      </h3>
                      <p
                        className={cn(
                          "text-zinc-600 leading-relaxed",
                          isFeatured ? "text-[14px] sm:text-[15px]" : "text-[13px]",
                        )}
                      >
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-24 lg:py-36 relative z-10 bg-zinc-50/60">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <AnimatedSection>
            <div className="text-center mb-16 lg:mb-24">
              <h2 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.04em] text-zinc-950 leading-[0.95]">
                Three steps
                <span className="text-zinc-300">.</span>{" "}
                <span className="font-serif italic font-normal">That&apos;s it</span>
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-10 md:gap-6">
            {steps.map((step, i) => (
              <AnimatedSection key={step.number} delay={i * 140}>
                <div className="text-center md:text-left">
                  <div className="text-[120px] sm:text-[160px] lg:text-[200px] font-semibold text-zinc-200/90 leading-[0.85] tracking-[-0.08em] mb-3 select-none">
                    {step.number}
                  </div>
                  <h3 className="font-semibold text-zinc-900 text-lg sm:text-xl mb-2 tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-[14px] sm:text-[15px] text-zinc-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="py-24 lg:py-32 relative z-10">
        <div className="mx-auto max-w-md px-5 sm:px-6">
          <AnimatedSection>
            <div className="text-center mb-12">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.04em] text-zinc-950 leading-[0.95]">
                One plan
                <span className="text-zinc-300">.</span>
                <br />
                <span className="font-serif italic font-normal">Everything</span>{" "}
                included
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <div className="rounded-2xl border-2 border-zinc-900 bg-white p-7 sm:p-8">
              <div className="text-center mb-7">
                <div className="inline-block bg-zinc-900 text-white text-[10px] font-semibold px-3 py-1 rounded-full mb-5 tracking-[0.18em]">
                  FROM
                </div>
                <div className="text-7xl sm:text-8xl font-semibold text-zinc-900 leading-none tracking-[-0.04em]">
                  $83
                  <span className="text-2xl sm:text-3xl font-medium text-zinc-400 tracking-tight">
                    /mo
                  </span>
                </div>
                <p className="text-[13px] text-zinc-500 mt-3 leading-relaxed">
                  billed annually · cancel anytime · no contracts
                </p>
              </div>

              {/* The four terms, honestly */}
              <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3.5 mb-6">
                <div className="space-y-1.5 text-[12px] text-zinc-700">
                  <div className="flex justify-between"><span>Monthly</span><span className="font-semibold text-zinc-900">$150/mo</span></div>
                  <div className="flex justify-between"><span>3 months</span><span className="font-semibold text-zinc-900">$400</span></div>
                  <div className="flex justify-between"><span>6 months</span><span className="font-semibold text-zinc-900">$600</span></div>
                  <div className="flex justify-between"><span>Yearly</span><span className="font-semibold text-zinc-900">$1,000</span></div>
                </div>
              </div>

              <div className="space-y-2.5 mb-7">
                {pricingFeatures.map((f) => (
                  <div key={f} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-2.5 w-2.5 text-zinc-700" strokeWidth={3} />
                    </div>
                    <span className="text-[13px] text-zinc-700">{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={scrollToForm}
                className="block w-full bg-zinc-900 hover:bg-zinc-800 text-white text-center font-semibold py-3.5 rounded-xl transition-colors"
              >
                Get Access →
              </button>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="py-20 lg:py-28 relative z-10 bg-zinc-50/50">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <AnimatedSection>
            <div className="text-center mb-12">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.04em] text-zinc-950 leading-[0.95]">
                Questions?{" "}
                <span className="font-serif italic font-normal">Answers</span>.
              </h2>
            </div>
            <div>
              {faqs.map((faq, index) => (
                <FAQItem
                  key={index}
                  index={index}
                  question={faq.question}
                  answer={faq.answer}
                />
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ FOOTER CTA (dark section for visual rhythm + premium close) ═══ */}
      <section className="py-28 lg:py-40 relative z-10 bg-zinc-950 text-white overflow-hidden">
        {/* Subtle dot grid in dark, mirrors the hero */}
        <div
          aria-hidden
          className="absolute inset-0 -z-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(63 63 70) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 50%, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 50%, black 40%, transparent 80%)",
          }}
        />
        <div className="mx-auto max-w-3xl px-5 sm:px-6 relative">
          <AnimatedSection>
            <div className="text-center">
              <h2 className="text-5xl sm:text-7xl lg:text-8xl xl:text-9xl font-semibold tracking-[-0.05em] leading-[0.9]">
                Your{" "}
                <span className="font-serif italic font-normal">stats</span>
                <span className="text-zinc-600">.</span>
                <br />
                Your{" "}
                <span className="font-serif italic font-normal">profile</span>
                <span className="text-zinc-600">.</span>
                <br />
                Your{" "}
                <span className="font-serif italic font-normal">career</span>
                <span className="text-zinc-600">.</span>
              </h2>
              <p className="mt-8 text-base sm:text-[17px] text-zinc-400 max-w-md mx-auto leading-relaxed">
                Start building your verified track record today.
              </p>
              <div className="mt-10">
                <button
                  onClick={scrollToForm}
                  className="inline-flex items-center gap-2 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold px-8 py-4 rounded-xl text-[15px] transition-colors"
                >
                  Get Access
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              <p className="mt-6 text-[12px] text-zinc-500">
                Plans from $83/mo — five minutes from paying to recording
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-zinc-200 relative z-10">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 py-12">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
            <Logo height={24} />
            <ul className="flex items-center gap-6 text-[13px] text-zinc-500">
              <li>
                <Link href="/" className="hover:text-zinc-900 transition-colors">
                  For Teams
                </Link>
              </li>
              <li>
                <Link
                  href="/personal/privacy"
                  className="hover:text-zinc-900 transition-colors"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/personal/terms" className="hover:text-zinc-900 transition-colors">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/personal/ftc-disclosure" className="hover:text-zinc-900 transition-colors">
                  FTC Disclosure
                </Link>
              </li>
              <li>
                <Link href="/personal/income-disclosure" className="hover:text-zinc-900 transition-colors">
                  Income Disclosure
                </Link>
              </li>
            </ul>
          </div>
          <div className="border-t border-zinc-200 mt-8 pt-6">
            <p className="text-[12px] text-zinc-400 text-center">
              &copy; 2026 Sequ3nce.ai. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA — appears after hero, hides near the dark footer
          CTA so it doesn't overlap. Mobile-only. */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 md:hidden transition-transform duration-300",
          showStickyCta ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="bg-white/95 backdrop-blur-md border-t border-zinc-200 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            onClick={scrollToForm}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-3.5 rounded-xl text-[14px] flex items-center justify-center gap-2 transition-colors"
          >
            Get Access
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </main>
  );
}
