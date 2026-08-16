"use client";

import {
  SignInButton,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookDemoButton } from "@/components/ui/calendly-modal";
import { MembershipCard } from "./_landing/MembershipCard";
import { Logo } from "@/components/ui/logo";
import {
  ArrowRight,
  Radio,
  Sparkles,
  BarChart3,
  BookOpen,
  Users,
  Calendar,
  Check,
  Monitor,
  UserPlus,
  Eye,
  ArrowUpRight,
  Video,
  TrendingUp,
  Zap,
  Workflow,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AnimatedSection, FAQItem } from "@/components/landing/shared";

/* ─── Screenshot Tabs ────────────────────────────── */
function ScreenshotTabs() {
  const [activeTab, setActiveTab] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const tabs = [
    { label: "Live Calls", description: "Monitor every active call in real-time", gif: "/screenshots/Live-calls.gif" },
    { label: "Call Details", description: "Review transcripts with AI-extracted ammo", gif: "/screenshots/call-details.gif" },
    { label: "Analytics", description: "Deep insights into team performance", gif: "/screenshots/analytics.gif" },
    { label: "Playbook", description: "Build a training library from real calls", gif: "/screenshots/playbook.gif" },
  ];

  const switchTab = useCallback(
    (index: number) => {
      if (index === activeTab) return;
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveTab(index);
        setIsTransitioning(false);
      }, 150);
    },
    [activeTab]
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap justify-center gap-1 p-1 bg-zinc-100 rounded-xl max-w-fit mx-auto">
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => switchTab(i)}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              activeTab === i
                ? "bg-white text-black shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-5xl mx-auto">
        <div className="absolute -inset-10 bg-gradient-to-b from-zinc-200/50 via-zinc-100/20 to-transparent rounded-3xl blur-3xl" />
        <div className="relative bg-zinc-950 rounded-2xl p-1.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.25)]">
          <div className="bg-zinc-900 rounded-t-xl px-4 py-3 flex items-center">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
            </div>
            <div className="flex-1 mx-16">
              <div className="bg-zinc-800 rounded-lg h-7 max-w-sm mx-auto flex items-center justify-center">
                <span className="text-[11px] text-zinc-500 font-mono">
                  app.sequ3nce.ai
                </span>
              </div>
            </div>
          </div>
          <div
            className={cn(
              "bg-white rounded-b-xl overflow-hidden transition-opacity duration-150",
              isTransitioning ? "opacity-0" : "opacity-100"
            )}
          >
            <img
              src={tabs[activeTab].gif}
              alt={tabs[activeTab].label}
              className="w-full h-auto"
            />
          </div>
        </div>
      </div>

      <p className="text-center text-zinc-500 text-sm">
        {tabs[activeTab].description}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/* PAGE COMPONENT                                     */
/* ═══════════════════════════════════════════════════ */
export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  /* ─── Data ─────────────────────────────────────── */
  const features = [
    {
      icon: Radio,
      title: "Know what's happening right now",
      description: "See every live call on your team. Who's on, how long they've been on, and what's being said — in real-time.",
      size: "large" as const,
    },
    {
      icon: Sparkles,
      title: "Catch buying signals instantly",
      description: 'AI extracts key quotes as they\'re spoken. When a prospect says "money isn\'t the issue," you\'ll know before the call ends.',
      size: "small" as const,
    },
    {
      icon: BarChart3,
      title: "Identify who's costing you deals",
      description: "Talk-to-listen ratios, close rates, and cash collected. Spot underperformers before they burn through your leads.",
      size: "small" as const,
    },
    {
      icon: BookOpen,
      title: "Clone your best closer",
      description: "Save winning call moments and build a training library from real closes. New hires learn from what actually works.",
      size: "large" as const,
    },
    {
      icon: Users,
      title: "Hold closers accountable",
      description: 'Full call recordings, transcripts, and stats. No more "the lead was bad" — you have the proof.',
      size: "small" as const,
    },
    {
      icon: Calendar,
      title: "Never miss a scheduled call",
      description: "Track scheduled calls and follow-ups. Know exactly when calls should happen and if they actually did.",
      size: "small" as const,
    },
    {
      icon: Workflow,
      title: "See the whole funnel — not just the call",
      description: "Other tools stop at the closer. Sequ3nce traces every lead from the setter who booked it to the closer who took it — including time-to-dial, who's leaking pipeline, and which setter brings the best closes from which ad.",
      size: "large" as const,
    },
  ];

  const painPoints = [
    { text: "Deal fell through? You'll never know if your closer fumbled or if the lead was bad.", bold: "never know" },
    { text: "Your top performer is closing 3x more — but you can't replicate what they're doing.", bold: "3x more" },
    { text: "You're spending $50k/month on leads, but have zero proof when they no-show.", bold: "$50k/month on leads" },
    { text: "Coaching is a guessing game. You're giving feedback on calls you never heard.", bold: "never heard" },
  ];

  const steps = [
    { icon: UserPlus, num: "01", title: "Create your team", description: "Set up your account and add your closers in minutes." },
    { icon: Monitor, num: "02", title: "Closers connect a calendar", description: "Nothing to install — it runs in the browser. The bot joins their calls on its own from there." },
    { icon: Eye, num: "03", title: "You see everything", description: "Watch calls live, review transcripts, track performance. Full visibility from day one." },
  ];

  const faqs = [
    { question: "How do I get access to Sequ3nce?", answer: "You don't buy it. Sequ3nce belongs to a private community of 7-figure entrepreneurs using it to scale, and membership starts with a conversation. If you're doing $100k a month or more, book a call and we'll work out whether this is a fit — both ways." },
    { question: "What does it cost?", answer: "It depends how much of your sales operation you want us running. Some members take the software and the room; others hand us the floor entirely — recruiting, coaching and day-to-day management. We'll talk numbers on the call, once we both know what you actually need." },
    { question: "What types of calls does Sequ3nce work with?", answer: "Zoom, Google Meet, Microsoft Teams — any video call platform. Our bot can join scheduled calls through your Google Calendar automatically, or we can work from whatever your team already records with. Either way it fits the way you sell today." },
    { question: "How does the meeting bot work?", answer: "Closers connect their Google Calendar once, and the bot joins their calls to record and transcribe — hands-free, nobody has to remember to hit record. If your team already records everything, you can skip the bot entirely and we'll use what you have." },
    { question: "Is my call data secure?", answer: "Yes, all calls are encrypted in transit and at rest. You own your data, and we never share it with third parties." },
    { question: "What if my closers aren't tech-savvy?", answer: "There is nothing for them to learn. Setup is one step — log in and connect a calendar — and it runs in the browser, so nothing gets installed. After that the AI reads each call and fills in the outcome, the money and the objections on its own. Your closers don't fill in forms." },
    { question: "Do you integrate with my CRM?", answer: "Yes — we integrate with GoHighLevel (GHL) and Hyros. Call outcomes, lead quality scores, objections, and AI summaries sync automatically to your GHL contacts after every call. For Hyros, we push call intelligence data so your ad platforms can optimize for leads that actually close, not just leads that book calls." },
  ];

  return (
    <main className="min-h-screen bg-white overflow-x-hidden relative">
      {/* ─── B2C Banner ─── */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-zinc-950 text-zinc-400 h-9 flex items-center justify-center text-[13px]">
        <Link href="/personal" className="hover:text-white transition-colors">
          <span className="hidden sm:inline">Individual closer? Try Sequ3nce Personal — your sales career, verified.</span>
          <span className="sm:hidden">Closer? Try Sequ3nce Personal</span>
          <span className="text-white ml-1">&rarr;</span>
        </Link>
      </div>

      {/* ─── Global grid pattern ─── */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* ═══════════════════════════════════════════ */}
      {/* NAV                                         */}
      {/* ═══════════════════════════════════════════ */}
      <header
        className={cn(
          "fixed left-0 right-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isScrolled
            ? "top-[52px] px-4 sm:px-6 lg:px-8"
            : "top-9 px-0"
        )}
      >
        <div
          className={cn(
            "mx-auto transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isScrolled
              ? "max-w-5xl bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)] rounded-full px-6"
              : "max-w-7xl px-6"
          )}
        >
          <div className={cn(
            "flex items-center justify-between transition-all duration-500",
            isScrolled ? "h-14" : "h-16"
          )}>
            <Logo href="/" height={28} />
            <nav
              className={cn(
                "hidden md:flex items-center transition-all duration-500",
                isScrolled ? "gap-5" : "gap-8",
              )}
            >
              {[
                "features",
                "setter-data",
                "integrations",
                "how-it-works",
                "pricing",
              ].map((id) => (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors whitespace-nowrap"
                >
                  {id === "how-it-works"
                    ? "How It Works"
                    : id === "setter-data"
                      ? "Setter Data"
                      : id === "integrations"
                        ? "Integrations"
                        : id === "pricing"
                          ? "Membership"
                          : id.charAt(0).toUpperCase() + id.slice(1)}
                </button>
              ))}
              <Link
                href="/personal"
                className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors whitespace-nowrap"
              >
                For Closers
              </Link>
            </nav>
            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton mode="modal">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                  >
                    Log in
                  </Button>
                </SignInButton>
                <BookDemoButton>See if you qualify</BookDemoButton>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard">
                  <Button size="sm">
                    Dashboard
                    <ArrowRight className="h-3 w-3 ml-1" strokeWidth={1.5} />
                  </Button>
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════ */}
      {/* HERO                                        */}
      {/* ═══════════════════════════════════════════ */}
      <section className="relative pt-36 pb-32 overflow-hidden z-10">
        {/* Subtle gradient wash for hero depth */}
        <div className="absolute top-0 left-[-20%] w-[60vw] h-[60vw] rounded-full bg-zinc-100/80 blur-[150px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[50vw] h-[50vw] rounded-full bg-zinc-50/60 blur-[120px] pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-6">
          {/* Badge */}
          <AnimatedSection>
            <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-xs font-medium tracking-widest uppercase text-zinc-500 mb-10 border border-zinc-200 bg-white/60 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Private community · By application
            </div>
          </AnimatedSection>

          {/* Massive headline */}
          <AnimatedSection delay={100}>
            <h1 className="text-[3.5rem] sm:text-[5rem] md:text-[6.5rem] lg:text-[8rem] xl:text-[9rem] font-semibold tracking-[-0.04em] leading-[0.9] text-zinc-950 max-w-6xl">
              Sequ3nce isn&apos;t
              <br />
              for{" "}
              <span className="font-serif italic font-normal">sale</span>
              <span className="text-zinc-300">.</span>
            </h1>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <p className="text-xl sm:text-2xl text-zinc-400 mt-6 tracking-wide font-light">
              It&apos;s what our members use.
            </p>
          </AnimatedSection>

          {/* Subtext + CTA */}
          <AnimatedSection delay={300}>
            <div className="mt-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 max-w-6xl">
              <p className="text-lg text-zinc-500 max-w-lg leading-relaxed">
                A private community of 7-figure entrepreneurs using Sequ3nce to
                scale. Members get the software, our AI agents, and a team that
                runs their sales floor — closers recruited, trained and managed.
                Minimum $100k per month to be considered.
              </p>
              <div className="flex flex-wrap items-center gap-4 shrink-0">
                <SignedOut>
                  <BookDemoButton size="lg">
                    See if you qualify
                    <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                  </BookDemoButton>
                </SignedOut>
                <SignedIn>
                  <Link href="/dashboard">
                    <Button size="lg">
                      Go to Dashboard
                      <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                    </Button>
                  </Link>
                </SignedIn>
                <button
                  onClick={() => scrollToSection("how-it-works")}
                  className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors flex items-center gap-1.5"
                >
                  See How It Works
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </AnimatedSection>

          {/* Stat bar */}
          <AnimatedSection delay={400}>
            <div className="mt-20 grid grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden divide-x divide-zinc-200 border border-zinc-200 bg-white/60 backdrop-blur-sm">
              {[
                { value: "100%", label: "Call visibility" },
                { value: "<3min", label: "Setup time" },
                { value: "50+", label: "Calls analyzed" },
                { value: "24/7", label: "Automatic recording" },
              ].map((stat, i) => (
                <div key={i} className="px-6 py-7 lg:py-9 text-center">
                  <div className="text-2xl lg:text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1.5 uppercase tracking-[0.2em] font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>

          {/* The hero video used to sit here. Its poster was Live-calls.gif —
              the same screenshot that opens the tabs section immediately
              below, so the page showed the identical product shot twice
              before saying anything. Removed rather than re-postered: we're
              selling the outcome now, and leading with a software demo argues
              the opposite. */}

          {/* Platform logos */}
          <AnimatedSection delay={600}>
            <div className="flex flex-wrap items-center justify-center gap-8 mt-20">
              <span className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium">
                Works with
              </span>
              {[
                { icon: <Video className="h-4 w-4" strokeWidth={1.5} />, name: "Zoom" },
                {
                  icon: (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="12" height="12" rx="2" />
                      <path d="M14 9l6-3v12l-6-3" />
                    </svg>
                  ),
                  name: "Google Meet",
                },
                { icon: <Users className="h-4 w-4" strokeWidth={1.5} />, name: "Teams" },
                { icon: <Calendar className="h-4 w-4" strokeWidth={1.5} />, name: "Google Calendar" },
                { icon: <TrendingUp className="h-4 w-4" strokeWidth={1.5} />, name: "Hyros" },
                { icon: <Zap className="h-4 w-4" strokeWidth={1.5} />, name: "GoHighLevel" },
              ].map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-zinc-400">
                  {p.icon}
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* SCREENSHOTS                                 */}
      {/* ═══════════════════════════════════════════ */}
      <section className="py-32 relative z-10">
        <div className="relative mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center max-w-3xl mx-auto">
              <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                Platform
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
                You stop finding
                <br />
                out too{" "}
                <span className="font-serif italic font-normal">late</span>
                <span className="text-zinc-300">.</span>
              </h2>
              <p className="mt-6 text-zinc-500 text-lg leading-relaxed">
                Every call, every closer, every deal — while there&apos;s still
                time to do something about it.
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100} className="mt-16">
            <ScreenshotTabs />
          </AnimatedSection>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* PAIN POINTS                                 */}
      {/* ═══════════════════════════════════════════ */}
      <section className="py-32 relative z-10">
        <div className="relative mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-12 mb-20">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                  The Problem
                </div>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] text-zinc-950">
                  You&apos;re running a
                  <br />
                  sales team{" "}
                  <span className="font-serif italic font-normal">blind</span>
                  <span className="text-zinc-300">.</span>
                </h2>
              </div>
              <p className="text-zinc-500 text-lg max-w-md lg:pt-12 leading-relaxed">
                Right now, you only know what your closers choose to tell you.
                Here&apos;s what that actually looks like.
              </p>
            </div>
          </AnimatedSection>

          {/* Asymmetric grid */}
          <div className="grid lg:grid-cols-12 gap-4">
            {/* Featured pain point */}
            <AnimatedSection delay={100} className="lg:col-span-7">
              <div className="relative p-10 lg:p-14 rounded-2xl border border-zinc-200 bg-white/60 backdrop-blur-sm h-full flex flex-col justify-end group hover:border-zinc-300 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.08)] transition-all min-h-[320px]">
                <div className="text-[140px] lg:text-[180px] font-semibold leading-none text-zinc-100 select-none absolute top-2 right-8 pointer-events-none">
                  &ldquo;
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-400 mb-6 tracking-widest">
                    01
                  </div>
                  <p className="text-2xl lg:text-3xl font-medium leading-snug text-zinc-700 relative z-10 max-w-lg">
                    Deal fell through? You&apos;ll{" "}
                    <span className="text-zinc-950 font-semibold">never know</span> if your
                    closer fumbled or if the lead was bad.
                  </p>
                </div>
              </div>
            </AnimatedSection>

            {/* Stacked pain points */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {painPoints.slice(1).map((pain, index) => (
                <AnimatedSection key={index} delay={200 + index * 100}>
                  <div className="p-8 rounded-2xl border border-zinc-200 bg-white/60 backdrop-blur-sm hover:border-zinc-300 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.08)] transition-all group">
                    <div className="text-[10px] font-mono text-zinc-400 mb-4 tracking-widest">
                      {String(index + 2).padStart(2, "0")}
                    </div>
                    <p className="text-lg font-medium leading-relaxed text-zinc-600">
                      {pain.text.split(pain.bold).map((part, i, arr) => (
                        <span key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <span className="text-zinc-950 font-semibold">
                              {pain.bold}
                            </span>
                          )}
                        </span>
                      ))}
                    </p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* FEATURES — Bento grid                       */}
      {/* ═══════════════════════════════════════════ */}
      <section id="features" className="py-32 relative z-10">
        <div className="relative mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-16">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                  Features
                </div>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
                  Stop guessing.
                  <br />
                  Start{" "}
                  <span className="font-serif italic font-normal">knowing</span>
                  <span className="text-zinc-300">.</span>
                </h2>
              </div>
              <p className="text-zinc-500 max-w-md text-lg leading-relaxed">
                You get a sales floor that runs at your standard whether
                you&apos;re watching it or not.
              </p>
            </div>
          </AnimatedSection>

          {/* Bento grid */}
          <div className="grid lg:grid-cols-6 gap-4">
            {features.map((feature, index) => {
              // Large items span 4 of 6 cols, small items span 2.
              // Indices 4-5 are the small row pair — each spans 3 to fill the row.
              // Index 6 is the Setter Intelligence large card spanning all 6
              // cols as a featured row of its own.
              const isLastSmallRow =
                (index === 4 || index === 5) && feature.size === "small";
              const isSetterRow = index === 6;
              const colSpan = isSetterRow
                ? "lg:col-span-6"
                : feature.size === "large"
                  ? "lg:col-span-4"
                  : isLastSmallRow
                    ? "lg:col-span-3"
                    : "lg:col-span-2";
              return (
              <AnimatedSection
                key={index}
                delay={index * 80}
                className={colSpan}
              >
                <div
                  className={cn(
                    "group relative rounded-2xl border border-zinc-200 bg-white/60 backdrop-blur-sm hover:bg-white hover:border-zinc-300 transition-all duration-300 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.1)] h-full",
                    feature.size === "large" ? "p-10 lg:p-12" : "p-8"
                  )}
                >
                  <div
                    className={cn(
                      "flex gap-8",
                      feature.size === "large"
                        ? "flex-col lg:flex-row lg:items-start"
                        : "flex-col"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-xl bg-zinc-950 flex items-center justify-center shrink-0",
                        feature.size === "large" ? "w-14 h-14" : "w-11 h-11"
                      )}
                    >
                      <feature.icon
                        className={cn(
                          "text-white",
                          feature.size === "large" ? "h-7 w-7" : "h-5 w-5"
                        )}
                        strokeWidth={1.5}
                      />
                    </div>
                    <div>
                      <h3
                        className={cn(
                          "font-semibold mb-3",
                          feature.size === "large" ? "text-xl" : "text-[15px]"
                        )}
                      >
                        {feature.title}
                      </h3>
                      <p
                        className={cn(
                          "text-zinc-500 leading-relaxed",
                          feature.size === "large" ? "text-base" : "text-sm"
                        )}
                      >
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* SETTER DATA — funnel-wide visibility differentiator */}
      {/* ═══════════════════════════════════════════ */}
      <section id="setter-data" className="py-32 relative z-10">
        <div className="relative mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-16">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                  Setter Data
                </div>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
                  Your money leaks
                  <br />
                  before the{" "}
                  <span className="font-serif italic font-normal">call</span>
                  <span className="text-zinc-300">.</span>
                </h2>
              </div>
              <p className="text-zinc-500 max-w-md text-lg leading-relaxed">
                Every lead has a setter behind it. We join what they did to what
                actually closed — so you find the leak instead of arguing about
                whose fault it is.
              </p>
            </div>
          </AnimatedSection>

          {/* 4-stat grid showing the unique setter-side metrics */}
          <AnimatedSection delay={100}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
              {[
                {
                  label: "Time to first dial",
                  description:
                    "Catch leads going cold. Median dial time per setter, per source.",
                },
                {
                  label: "Closer-side show rate",
                  description:
                    "Match every booked lead to the call that actually happened. Who's no-showing on which setter's pipeline.",
                },
                {
                  label: "Setter × closer routing",
                  description:
                    "Which closer converts which setter's leads best. Route smarter — close more.",
                },
                {
                  label: "Ad-source attribution",
                  description:
                    "Joined with Hyros: see which closer turns which ad creative into deals. Not just bookings — closes.",
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-zinc-200 bg-white/60 backdrop-blur-sm p-7 hover:border-zinc-300 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all"
                >
                  <h3 className="text-base font-semibold text-zinc-950 mb-2 tracking-tight">
                    {stat.label}
                  </h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed">
                    {stat.description}
                  </p>
                </div>
              ))}
            </div>
          </AnimatedSection>

          {/* Featured callout — the positioning shot */}
          <AnimatedSection delay={200}>
            <div className="relative rounded-2xl border border-zinc-200 bg-zinc-950 text-white p-10 lg:p-14 overflow-hidden">
              <div
                aria-hidden
                className="absolute inset-0 -z-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, rgb(63 63 70) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                  maskImage:
                    "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
                }}
              />
              <div className="relative grid lg:grid-cols-2 gap-10 items-center">
                <div>
                  <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-500 font-medium mb-5">
                    The Setter Data tab
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-semibold tracking-tight leading-snug mb-5">
                    The metric Gong and Chorus can&apos;t show you:{" "}
                    <span className="font-serif italic font-normal text-white">
                      who lost the lead before the call ever happened.
                    </span>
                  </h3>
                  <p className="text-zinc-400 leading-relaxed">
                    Sales call tools see the call. CRM tools see the contact.
                    Nothing sees the gap between them — the hours your lead sat
                    waiting, the setter who never followed up, the closer who
                    got the wrong booking. The Setter Data tab does. Every lead
                    in your pipeline, matched to the setter who booked it and
                    the closer who took it, with the operational signals you
                    need to fix what&apos;s broken.
                  </p>
                </div>
                <div className="space-y-4">
                  {[
                    "Untouched-lead alerts → catch dropped leads in real time",
                    "Coverage-gap digest → see which hours your team isn't dialing",
                    "Per-setter scorecards → speed-to-lead, dial cadence, lead age decay",
                    "Routing matrix → best closer per ad creative, automatically",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 mt-0.5">
                        <Check
                          className="h-3 w-3 text-zinc-950"
                          strokeWidth={2.5}
                        />
                      </div>
                      <span className="text-sm text-zinc-300 leading-relaxed">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* INTEGRATIONS                                  */}
      {/* ═══════════════════════════════════════════ */}
      <section id="integrations" className="py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                Integrations
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
                Stop paying for leads
                <br />
                that never{" "}
                <span className="font-serif italic font-normal">close</span>
                <span className="text-zinc-300">.</span>
              </h2>
              <p className="mt-6 text-zinc-500 text-lg leading-relaxed">
                What gets said on your calls flows back into your ad platform
                and your CRM — so your spend follows the leads that turn into
                money, not the ones that just book.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid lg:grid-cols-12 gap-4">
            {/* Hyros — Primary emphasis */}
            <AnimatedSection delay={100} className="lg:col-span-7">
              <div className="relative p-10 lg:p-14 rounded-2xl border border-zinc-200 bg-white/60 backdrop-blur-sm h-full group hover:border-zinc-300 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.08)] transition-all">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-11 h-11 rounded-xl bg-zinc-950 flex items-center justify-center">
                    <TrendingUp
                      className="h-5 w-5 text-white"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Hyros</h3>
                    <p className="text-xs text-zinc-400">Ad Attribution</p>
                  </div>
                </div>

                <p className="text-2xl lg:text-3xl font-medium leading-snug text-zinc-700 mb-8 max-w-lg">
                  Your ad platforms are{" "}
                  <span className="text-zinc-950 font-semibold">guessing</span>{" "}
                  which leads are worth pursuing.
                </p>

                <p className="text-zinc-500 leading-relaxed mb-6">
                  Hyros tracks which ad brought the lead — but treats the sales
                  call as a black box. Campaign A closed at 20% while Campaign B
                  closed at 6%. Was it bad leads, or a bad closer? Without
                  Sequ3nce, you&apos;re guessing.
                </p>

                <p className="text-zinc-500 leading-relaxed mb-8">
                  Sequ3nce pushes call quality scores, lead qualification data,
                  and objection patterns directly into Hyros. Facebook and
                  Google&apos;s algorithms learn to find more of your best leads
                  — not just leads that book calls, but leads that actually{" "}
                  <span className="text-zinc-700 font-medium">close</span>.
                </p>

                <div className="flex items-center justify-center gap-8 mb-8 py-6 px-8 rounded-xl bg-zinc-950 text-white">
                  <div className="text-center">
                    <div className="text-2xl font-semibold">25%</div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">
                      Lower CPA
                    </div>
                  </div>
                  <div className="w-px h-10 bg-zinc-800" />
                  <div className="text-center">
                    <div className="text-2xl font-semibold">20%</div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">
                      Less wasted spend
                    </div>
                  </div>
                  <div className="w-px h-10 bg-zinc-800" />
                  <div className="text-center">
                    <div className="text-2xl font-semibold">15-25%</div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">
                      Better ROAS
                    </div>
                  </div>
                </div>

                <p className="text-sm text-zinc-400 mb-8 -mt-4">
                  Average results when training ad algorithms on leads that
                  close — not just leads that book.
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    "Call quality scores → ad optimization",
                    "Lead qualification from real conversations",
                    "Objection patterns by traffic source",
                    "Rep performance by ad campaign",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-zinc-950 flex items-center justify-center shrink-0 mt-0.5">
                        <Check
                          className="h-3 w-3 text-white"
                          strokeWidth={2.5}
                        />
                      </div>
                      <span className="text-sm text-zinc-600">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AnimatedSection>

            {/* GoHighLevel — Secondary */}
            <AnimatedSection delay={200} className="lg:col-span-5">
              <div className="relative p-10 lg:p-14 rounded-2xl border border-zinc-200 bg-white/60 backdrop-blur-sm h-full group hover:border-zinc-300 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.08)] transition-all">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-11 h-11 rounded-xl bg-zinc-950 flex items-center justify-center">
                    <Zap
                      className="h-5 w-5 text-white"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">GoHighLevel</h3>
                    <p className="text-xs text-zinc-400">CRM Automation</p>
                  </div>
                </div>

                <p className="text-xl font-medium leading-snug text-zinc-700 mb-6">
                  Your CRM, updated{" "}
                  <span className="text-zinc-950 font-semibold">
                    automatically
                  </span>
                  .
                </p>

                <p className="text-zinc-500 leading-relaxed mb-8">
                  Stop manually updating contacts after every call. Sequ3nce
                  auto-syncs call outcomes, lead quality scores, objections, and
                  AI summaries directly into your GHL contacts — triggering your
                  follow-up automations with real context instead of blind
                  guesswork.
                </p>

                <div className="space-y-4">
                  {[
                    "Auto-sync after every call",
                    "Custom fields & tags on contacts",
                    "AI call summaries as notes",
                    "Trigger automations with context",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-zinc-950 flex items-center justify-center shrink-0 mt-0.5">
                        <Check
                          className="h-3 w-3 text-white"
                          strokeWidth={2.5}
                        />
                      </div>
                      <span className="text-sm text-zinc-600">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* HOW IT WORKS — Giant numbers                 */}
      {/* ═══════════════════════════════════════════ */}
      <section id="how-it-works" className="py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center mb-24">
              <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                Setup
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight">
                Running in days<span className="text-zinc-300">.</span>{" "}
                <span className="font-serif italic font-normal">Not quarters</span>
                <span className="text-zinc-300">.</span>
              </h2>
            </div>
          </AnimatedSection>

          <div className="space-y-0">
            {steps.map((step, index) => (
              <AnimatedSection key={index} delay={index * 150}>
                <div
                  className={cn(
                    "flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-16 py-16",
                    index < steps.length - 1 && "border-b border-zinc-200"
                  )}
                >
                  <div className="text-[7rem] sm:text-[9rem] lg:text-[12rem] font-semibold leading-none tracking-[-0.05em] text-zinc-100 select-none shrink-0 -my-4">
                    {step.num}
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-zinc-950 flex items-center justify-center shrink-0">
                    <step.icon className="h-7 w-7 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-2xl lg:text-3xl font-semibold mb-3">
                      {step.title}
                    </h3>
                    <p className="text-zinc-500 text-lg leading-relaxed max-w-md">
                      {step.description}
                    </p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* MEMBERSHIP — Split layout                   */}
      {/* ═══════════════════════════════════════════ */}
      <section id="pricing" className="py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="max-w-2xl">
              <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                Membership
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
                There&apos;s one
                <br />
                <span className="font-serif italic font-normal">way</span> in
                <span className="text-zinc-300">.</span>
              </h2>
              <p className="mt-8 text-zinc-500 text-lg leading-relaxed">
                No plans, no checkout, no free trial. Sequ3nce belongs to a
                private community of 7-figure entrepreneurs using it to scale,
                and the only way in is a conversation. If you&apos;re doing
                $100k a month or more, that conversation is worth having.
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={150}>
            <div className="mt-16">
              <MembershipCard />
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* FAQ — Two-column                             */}
      {/* ═══════════════════════════════════════════ */}
      <section id="faq" className="py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-[1fr,1.5fr] gap-16 max-w-6xl mx-auto">
            <AnimatedSection>
              <div className="lg:sticky lg:top-32">
                <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                  FAQ
                </div>
                <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] text-zinc-950">
                  Questions?
                  <br />
                  We&apos;ve got
                  <br />
                  <span className="font-serif italic font-normal">answers</span>
                  <span className="text-zinc-300">.</span>
                </h2>
                <p className="mt-6 text-zinc-500 text-lg leading-relaxed">
                  Everything you need to know about getting started with
                  Sequ3nce.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={100}>
              <div>
                {faqs.map((faq, index) => (
                  <FAQItem key={index} index={index} question={faq.question} answer={faq.answer} />
                ))}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* FINAL CTA (dark — visual rhythm break + premium close) */}
      {/* ═══════════════════════════════════════════ */}
      <section className="py-32 lg:py-44 relative z-10 overflow-hidden bg-zinc-950 text-white">
        {/* Subtle dot grid in dark, mirrors the global pattern */}
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
        <div className="relative mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center">
              <h2 className="text-5xl sm:text-6xl lg:text-7xl xl:text-[8rem] font-semibold tracking-[-0.03em] leading-[0.9]">
                Doing $100k
                <span className="text-zinc-600">?</span>
                <br />
                Let&apos;s{" "}
                <span className="font-serif italic font-normal">talk</span>
                <span className="text-zinc-600">.</span>
              </h2>
              <p className="mt-10 text-lg lg:text-xl text-zinc-400 max-w-xl mx-auto leading-relaxed">
                One conversation decides whether this is a fit. If it is,
                you&apos;re in the room — and we get to work on your sales
                floor.
              </p>
              <div className="mt-14">
                <SignedOut>
                  <BookDemoButton
                    size="lg"
                    className="bg-white text-zinc-900 hover:bg-zinc-100"
                  >
                    See if you qualify
                    <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                  </BookDemoButton>
                </SignedOut>
                <SignedIn>
                  <Link href="/dashboard">
                    <Button
                      size="lg"
                      className="bg-white text-zinc-900 hover:bg-zinc-100"
                    >
                      Go to Dashboard
                      <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                    </Button>
                  </Link>
                </SignedIn>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* FOOTER                                       */}
      {/* ═══════════════════════════════════════════ */}
      <footer className="border-t border-zinc-200 relative z-10">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="md:col-span-2">
              <Logo height={28} />
              <p className="mt-4 text-sm text-zinc-500 max-w-xs leading-relaxed">
                Sales call intelligence for high-ticket teams. Full visibility
                into every call, every closer, every deal.
              </p>
            </div>

            <div>
              <h4 className="text-[10px] font-medium tracking-[0.25em] uppercase text-zinc-400 mb-5">
                Product
              </h4>
              <ul className="space-y-3 text-sm text-zinc-500">
                {["features", "how-it-works", "pricing", "faq"].map((id) => (
                  <li key={id}>
                    <button
                      onClick={() => scrollToSection(id)}
                      className="hover:text-zinc-900 transition-colors"
                    >
                      {id === "how-it-works"
                        ? "How It Works"
                        : id.toUpperCase() === "FAQ"
                          ? "FAQ"
                          : id === "pricing"
                            ? "Membership"
                            : id.charAt(0).toUpperCase() + id.slice(1)}
                    </button>
                  </li>
                ))}
                <li>
                  <Link href="/personal" className="hover:text-zinc-900 transition-colors">
                    Sequ3nce Personal
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] font-medium tracking-[0.25em] uppercase text-zinc-400 mb-5">
                Account
              </h4>
              <ul className="space-y-3 text-sm text-zinc-500">
                <li>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="hover:text-zinc-900 transition-colors">
                        Log in
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Link href="/dashboard" className="hover:text-zinc-900 transition-colors">
                      Dashboard
                    </Link>
                  </SignedIn>
                </li>
                <li>
                  <Link href="/download" className="hover:text-zinc-900 transition-colors">
                    Download App
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-zinc-200 mt-16 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-zinc-400">
              &copy; 2026 Sequ3nce.ai. All rights reserved.
            </p>
            <div className="flex gap-6 text-xs text-zinc-400">
              <Link href="/privacy" className="hover:text-zinc-900 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-zinc-900 transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
