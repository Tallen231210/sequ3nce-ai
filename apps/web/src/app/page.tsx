"use client";

import {
  SignInButton,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookDemoButton } from "@/components/ui/calendly-modal";
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
  ];

  const painPoints = [
    { text: "Deal fell through? You'll never know if your closer fumbled or if the lead was bad.", bold: "never know" },
    { text: "Your top performer is closing 3x more — but you can't replicate what they're doing.", bold: "3x more" },
    { text: "You're spending $50k/month on leads, but have zero proof when they no-show.", bold: "$50k/month on leads" },
    { text: "Coaching is a guessing game. You're giving feedback on calls you never heard.", bold: "never heard" },
  ];

  const steps = [
    { icon: UserPlus, num: "01", title: "Create your team", description: "Set up your account and add your closers in minutes." },
    { icon: Monitor, num: "02", title: "Closers install the app", description: "One download, one login. The bot auto-joins their calls. That's it." },
    { icon: Eye, num: "03", title: "You see everything", description: "Watch calls live, review transcripts, track performance. Full visibility from day one." },
  ];

  const faqs = [
    { question: "What types of calls does Sequ3nce work with?", answer: "Zoom, Google Meet, Microsoft Teams — any video call platform. Our bot automatically joins scheduled calls through your Google Calendar, so it works with whatever platform your team uses." },
    { question: "How does the meeting bot work?", answer: "Closers connect their Google Calendar once. Our bot automatically detects upcoming calls and joins them to record, transcribe, and provide live coaching — completely hands-free." },
    { question: "Is my call data secure?", answer: "Yes, all calls are encrypted in transit and at rest. You own your data, and we never share it with third parties." },
    { question: "What if my closers aren't tech-savvy?", answer: "The setup is dead simple. Download the app, log in, connect your Google Calendar. After that, everything is automatic — no buttons to press, no recording to start." },
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
              ? "max-w-4xl bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)] rounded-full px-6"
              : "max-w-7xl px-6"
          )}
        >
          <div className={cn(
            "flex items-center justify-between transition-all duration-500",
            isScrolled ? "h-14" : "h-16"
          )}>
            <Logo href="/" height={28} />
            <nav className="hidden md:flex items-center gap-8">
              {["features", "integrations", "how-it-works", "pricing"].map((id) => (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors"
                >
                  {id === "how-it-works"
                    ? "How It Works"
                    : id === "integrations"
                      ? "Integrations"
                      : id.charAt(0).toUpperCase() + id.slice(1)}
                </button>
              ))}
              <Link
                href="/personal"
                className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors"
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
                <BookDemoButton>Book a Demo</BookDemoButton>
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
              Now with automatic meeting bot
            </div>
          </AnimatedSection>

          {/* Massive headline */}
          <AnimatedSection delay={100}>
            <h1 className="text-[3.5rem] sm:text-[5rem] md:text-[6.5rem] lg:text-[8rem] xl:text-[9rem] font-semibold tracking-[-0.04em] leading-[0.9] text-zinc-950 max-w-6xl">
              Finally see why
              <br />
              deals close
              <span className="text-zinc-300">.</span>
            </h1>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <p className="text-xl sm:text-2xl text-zinc-400 mt-6 tracking-wide font-light">
              And why they don&apos;t.
            </p>
          </AnimatedSection>

          {/* Subtext + CTA */}
          <AnimatedSection delay={300}>
            <div className="mt-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 max-w-6xl">
              <p className="text-lg text-zinc-500 max-w-lg leading-relaxed">
                Stop managing your sales team blind. See every call as it
                happens, know exactly what&apos;s being said, and make decisions
                based on data — not what your closers tell you after the fact.
              </p>
              <div className="flex flex-wrap items-center gap-4 shrink-0">
                <SignedOut>
                  <BookDemoButton size="lg">
                    Book a Demo
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

          {/* Hero video */}
          <AnimatedSection delay={500} className="mt-20">
            <div className="relative">
              {/* Glow behind video */}
              <div className="absolute -inset-6 bg-gradient-to-b from-zinc-200/50 via-zinc-100/20 to-transparent rounded-3xl blur-2xl" />
              <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-[0_50px_100px_-30px_rgba(0,0,0,0.15)]">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="w-full h-auto"
                >
                  <source src="/videos/hero.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </AnimatedSection>

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
                Your sales floor,
                <br />
                in one dashboard<span className="text-zinc-300">.</span>
              </h2>
              <p className="mt-6 text-zinc-500 text-lg leading-relaxed">
                Real-time visibility into every call, every closer, every deal.
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
                  sales team blind<span className="text-zinc-300">.</span>
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
                  <span className="text-zinc-300">Start knowing.</span>
                </h2>
              </div>
              <p className="text-zinc-500 max-w-md text-lg leading-relaxed">
                Everything you need to manage a high-performing sales team —
                without sitting on every call.
              </p>
            </div>
          </AnimatedSection>

          {/* Bento grid */}
          <div className="grid lg:grid-cols-6 gap-4">
            {features.map((feature, index) => {
              // Large items span 4 of 6 cols, small items span 2
              // Last two small items (index 4,5) each span 3 to fill the row
              const isLastRow = index >= 4 && feature.size === "small";
              const colSpan = feature.size === "large"
                ? "lg:col-span-4"
                : isLastRow
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
                Close the loop between
                <br />
                sales and marketing<span className="text-zinc-300">.</span>
              </h2>
              <p className="mt-6 text-zinc-500 text-lg leading-relaxed">
                Sequ3nce doesn&apos;t just record calls — it feeds real
                conversation intelligence back into the tools your team already
                uses.
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
                Three steps<span className="text-zinc-300">.</span>{" "}
                That&apos;s it<span className="text-zinc-300">.</span>
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
      {/* PRICING — Split layout                      */}
      {/* ═══════════════════════════════════════════ */}
      <section id="pricing" className="py-32 relative z-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <AnimatedSection>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 font-medium mb-5">
                  Pricing
                </div>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
                  Simple,
                  <br />
                  transparent
                  <br />
                  pricing<span className="text-zinc-300">.</span>
                </h2>
                <p className="mt-8 text-zinc-500 text-lg max-w-md leading-relaxed">
                  No hidden fees. No per-minute charges. Just one plan that
                  scales with your team.
                </p>
                <div className="mt-10">
                  <SignedOut>
                    <BookDemoButton size="lg">
                      Book a Demo
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
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={150}>
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-br from-zinc-100 via-zinc-50 to-white rounded-[2rem] blur-xl" />
                <div className="relative bg-white rounded-3xl border border-zinc-200 p-10 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.12)]">
                  <div className="text-center mb-10">
                    <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400 mb-6 font-medium">
                      Everything included
                    </div>
                    <div className="text-5xl font-semibold tracking-tight">
                      Custom
                    </div>
                    <p className="text-sm text-zinc-400 mt-2">
                      Based on team size
                    </p>
                  </div>

                  <div className="border-t border-zinc-100 pt-8 mb-10 space-y-5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-zinc-500 text-sm">Platform fee</span>
                      <span className="text-2xl font-semibold">
                        $499
                        <span className="text-sm font-normal text-zinc-400">/mo</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-zinc-500 text-sm">Per closer seat</span>
                      <span className="text-2xl font-semibold">
                        $149
                        <span className="text-sm font-normal text-zinc-400">/mo</span>
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 mb-10">
                    {[
                      "Unlimited calls",
                      "Real-time transcription",
                      "AI-powered ammo extraction",
                      "Playbook builder",
                      "Closer stats & analytics",
                      "Call recordings & playback",
                      "Automatic meeting bot",
                      "Hyros & GHL integrations",
                    ].map((f, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-zinc-950 flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                        </div>
                        <span className="text-sm">{f}</span>
                      </div>
                    ))}
                  </div>

                  <SignedOut>
                    <BookDemoButton size="lg" className="w-full justify-center">
                      Get Started
                      <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                    </BookDemoButton>
                  </SignedOut>
                  <SignedIn>
                    <Link href="/dashboard" className="block">
                      <Button size="lg" className="w-full">
                        Go to Dashboard
                        <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                      </Button>
                    </Link>
                  </SignedIn>
                </div>
              </div>
            </AnimatedSection>
          </div>
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
                  answers<span className="text-zinc-300">.</span>
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
      {/* FINAL CTA                                    */}
      {/* ═══════════════════════════════════════════ */}
      <section className="py-32 lg:py-44 relative z-10 overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-6">
          <AnimatedSection>
            <div className="text-center">
              <h2 className="text-5xl sm:text-6xl lg:text-7xl xl:text-[8rem] font-semibold tracking-[-0.03em] text-zinc-950 leading-[0.9]">
                Stop wondering
                <span className="text-zinc-300">.</span>
                <br />
                Start knowing
                <span className="text-zinc-300">.</span>
              </h2>
              <p className="mt-10 text-lg lg:text-xl text-zinc-500 max-w-xl mx-auto leading-relaxed">
                See exactly why deals close and why they don&apos;t — starting
                today.
              </p>
              <div className="mt-14">
                <SignedOut>
                  <BookDemoButton size="lg">
                    Book a Demo
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
