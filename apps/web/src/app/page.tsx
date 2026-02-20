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
  ChevronDown,
  Check,
  Monitor,
  UserPlus,
  Eye,
  ArrowUpRight,
  Video,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

// Scroll animation hook
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isInView };
}

// Staggered animated section
function AnimatedSection({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isInView } = useInView(0.05);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Section label pill
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-200 bg-white text-xs font-medium tracking-widest uppercase text-zinc-500 mb-6">
      {children}
    </div>
  );
}

// FAQ Accordion Item
function FAQItem({
  question,
  answer,
  index,
}: {
  question: string;
  answer: string;
  index: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group border-b border-zinc-200/80">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-6 text-left hover:opacity-70 transition-opacity"
      >
        <div className="flex items-baseline gap-4">
          <span className="text-xs font-mono text-zinc-300 tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="font-medium text-[15px]">{question}</span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-zinc-400 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 ml-4",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isOpen ? "grid-rows-[1fr] pb-6" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <p className="text-zinc-500 text-[15px] leading-relaxed pl-10">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

// Screenshot tabs with refined browser frame
function ScreenshotTabs() {
  const [activeTab, setActiveTab] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const tabs = [
    {
      label: "Live Calls",
      description: "Monitor every active call in real-time",
      gif: "/screenshots/Live-calls.gif",
    },
    {
      label: "Call Details",
      description: "Review transcripts with AI-extracted ammo",
      gif: "/screenshots/call-details.gif",
    },
    {
      label: "Analytics",
      description: "Deep insights into team performance",
      gif: "/screenshots/analytics.gif",
    },
    {
      label: "Playbook",
      description: "Build a training library from real calls",
      gif: "/screenshots/playbook.gif",
    },
  ];

  const switchTab = useCallback((index: number) => {
    if (index === activeTab) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveTab(index);
      setIsTransitioning(false);
    }, 150);
  }, [activeTab]);

  return (
    <div className="space-y-10">
      {/* Tab buttons */}
      <div className="flex flex-wrap justify-center gap-1 p-1 bg-zinc-100 rounded-xl max-w-fit mx-auto">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => switchTab(index)}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              activeTab === index
                ? "bg-white text-black shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Screenshot display */}
      <div className="relative max-w-5xl mx-auto">
        {/* Glow effect behind the browser frame */}
        <div className="absolute -inset-8 bg-gradient-to-b from-zinc-200/40 via-zinc-100/20 to-transparent rounded-3xl blur-2xl" />

        <div className="relative bg-zinc-950 rounded-2xl p-1.5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)]">
          {/* Browser chrome */}
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

          {/* Screenshot content */}
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

      {/* Active tab description */}
      <p className="text-center text-zinc-500 text-sm">
        {tabs[activeTab].description}
      </p>
    </div>
  );
}

// Feature card with hover effect
function FeatureCard({
  icon: Icon,
  title,
  description,
  index,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  index: number;
}) {
  return (
    <AnimatedSection delay={index * 80}>
      <div className="group relative p-8 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 transition-all duration-300 hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)] h-full">
        <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center mb-5">
          <Icon className="h-5 w-5 text-white" strokeWidth={1.5} />
        </div>
        <h3 className="font-semibold text-[15px] mb-2">{title}</h3>
        <p className="text-zinc-500 text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </AnimatedSection>
  );
}

// Platform logo (inline SVG for Zoom, Meet, Teams, Calendar)
function PlatformLogos() {
  return (
    <AnimatedSection delay={350}>
      <div className="flex flex-wrap items-center justify-center gap-8 mt-14 pt-14 border-t border-zinc-100">
        <span className="text-xs tracking-widest uppercase text-zinc-400 font-medium">Works with</span>
        {/* Zoom */}
        <div className="flex items-center gap-2 text-zinc-400">
          <Video className="h-4 w-4" strokeWidth={1.5} />
          <span className="text-sm font-medium">Zoom</span>
        </div>
        {/* Google Meet */}
        <div className="flex items-center gap-2 text-zinc-400">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="12" height="12" rx="2" />
            <path d="M14 9l6-3v12l-6-3" />
          </svg>
          <span className="text-sm font-medium">Google Meet</span>
        </div>
        {/* Microsoft Teams */}
        <div className="flex items-center gap-2 text-zinc-400">
          <Users className="h-4 w-4" strokeWidth={1.5} />
          <span className="text-sm font-medium">Teams</span>
        </div>
        {/* Google Calendar */}
        <div className="flex items-center gap-2 text-zinc-400">
          <Calendar className="h-4 w-4" strokeWidth={1.5} />
          <span className="text-sm font-medium">Google Calendar</span>
        </div>
      </div>
    </AnimatedSection>
  );
}

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const features = [
    {
      icon: Radio,
      title: "Know what's happening right now",
      description:
        "See every live call on your team. Who's on, how long they've been on, and what's being said — in real-time.",
    },
    {
      icon: Sparkles,
      title: "Catch buying signals instantly",
      description:
        'AI extracts key quotes as they\'re spoken. When a prospect says "money isn\'t the issue," you\'ll know before the call ends.',
    },
    {
      icon: BarChart3,
      title: "Identify who's costing you deals",
      description:
        "Talk-to-listen ratios, close rates, and cash collected. Spot underperformers before they burn through your leads.",
    },
    {
      icon: BookOpen,
      title: "Clone your best closer",
      description:
        "Save winning call moments and build a training library from real closes. New hires learn from what actually works.",
    },
    {
      icon: Users,
      title: "Hold closers accountable",
      description:
        'Full call recordings, transcripts, and stats. No more "the lead was bad" — you have the proof.',
    },
    {
      icon: Calendar,
      title: "Never miss a scheduled call",
      description:
        "Track scheduled calls and follow-ups. Know exactly when calls should happen and if they actually did.",
    },
  ];

  const painPoints = [
    {
      text: "Deal fell through? You'll never know if your closer fumbled or if the lead was bad.",
      bold: "never know",
    },
    {
      text: "Your top performer is closing 3x more — but you can't replicate what they're doing.",
      bold: "3x more",
    },
    {
      text: "You're spending $50k/month on leads, but have zero proof when they no-show.",
      bold: "$50k/month on leads",
    },
    {
      text: "Coaching is a guessing game. You're giving feedback on calls you never heard.",
      bold: "never heard",
    },
  ];

  const steps = [
    {
      icon: UserPlus,
      step: "01",
      title: "Create your team",
      description:
        "Set up your account and add your closers in minutes.",
    },
    {
      icon: Monitor,
      step: "02",
      title: "Closers install the app",
      description:
        "One download, one login. The bot auto-joins their calls. That's it.",
    },
    {
      icon: Eye,
      step: "03",
      title: "You see everything",
      description:
        "Watch calls live, review transcripts, track performance. Full visibility from day one.",
    },
  ];

  const faqs = [
    {
      question: "What types of calls does Sequ3nce work with?",
      answer:
        "Zoom, Google Meet, Microsoft Teams — any video call platform. Our bot automatically joins scheduled calls through your Google Calendar, so it works with whatever platform your team uses.",
    },
    {
      question: "How does the meeting bot work?",
      answer:
        "Closers connect their Google Calendar once. Our bot automatically detects upcoming calls and joins them to record, transcribe, and provide live coaching — completely hands-free.",
    },
    {
      question: "Is my call data secure?",
      answer:
        "Yes, all calls are encrypted in transit and at rest. You own your data, and we never share it with third parties.",
    },
    {
      question: "What if my closers aren't tech-savvy?",
      answer:
        "The setup is dead simple. Download the app, log in, connect your Google Calendar. After that, everything is automatic — no buttons to press, no recording to start.",
    },
    {
      question: "Do you integrate with my CRM?",
      answer:
        "CRM integrations (GoHighLevel, Close) are coming soon. Let us know what you need and we'll prioritize accordingly.",
    },
  ];

  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          isScrolled
            ? "bg-white/80 backdrop-blur-xl border-b border-zinc-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            : "bg-white border-b border-transparent"
        )}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex h-16 items-center justify-between">
            <Logo href="/" height={28} />
            <nav className="hidden md:flex items-center gap-8">
              <button
                onClick={() => scrollToSection("features")}
                className="text-sm text-zinc-500 hover:text-black transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection("how-it-works")}
                className="text-sm text-zinc-500 hover:text-black transition-colors"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection("pricing")}
                className="text-sm text-zinc-500 hover:text-black transition-colors"
              >
                Pricing
              </button>
            </nav>
            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm" className="text-zinc-600">
                    Log in
                  </Button>
                </SignInButton>
                <BookDemoButton>
                  Book a Demo
                </BookDemoButton>
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

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 bg-white overflow-hidden">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="max-w-3xl mx-auto text-center">
            <AnimatedSection>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-200 bg-zinc-50 text-xs font-medium tracking-widest uppercase text-zinc-500 mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Now with automatic meeting bot
              </div>
            </AnimatedSection>

            <AnimatedSection delay={100}>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] text-black">
                Finally see why deals close
                <span className="text-zinc-400"> — and why they don&apos;t.</span>
              </h1>
            </AnimatedSection>

            <AnimatedSection delay={200}>
              <p className="mt-8 text-lg text-zinc-500 max-w-xl mx-auto leading-relaxed">
                Stop managing your sales team blind. See every call as it happens,
                know exactly what&apos;s being said, and make decisions based on data
                — not what your closers tell you after the fact.
              </p>
            </AnimatedSection>

            <AnimatedSection delay={300}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
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
                  className="text-sm text-zinc-500 hover:text-black transition-colors flex items-center gap-1"
                >
                  See How It Works
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </AnimatedSection>
          </div>

          {/* Hero video */}
          <AnimatedSection delay={400} className="mt-20">
            <div className="relative max-w-4xl mx-auto">
              {/* Soft glow behind video */}
              <div className="absolute -inset-6 bg-gradient-to-b from-zinc-200/50 via-zinc-100/30 to-transparent rounded-3xl blur-2xl" />
              <div className="relative rounded-2xl overflow-hidden border border-zinc-200 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)]">
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
          <PlatformLogos />
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
      </div>

      {/* Product Screenshots Section */}
      <section className="py-32 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <SectionLabel>Platform</SectionLabel>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
                Your sales floor, in one dashboard
              </h2>
              <p className="mt-4 text-zinc-500 max-w-xl mx-auto">
                Real-time visibility into every call, every closer, every deal.
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <ScreenshotTabs />
          </AnimatedSection>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-32 bg-zinc-100 relative overflow-hidden">
        {/* Subtle top border accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-300 to-transparent" />

        <div className="relative mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <SectionLabel>The Problem</SectionLabel>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-black">
                You&apos;re running a sales team blind
              </h2>
              <p className="mt-4 text-zinc-500 max-w-xl mx-auto">
                Right now, you only know what your closers choose to tell you.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {painPoints.map((pain, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="p-8 rounded-2xl border border-zinc-200/80 bg-white hover:border-zinc-300 transition-all duration-300 h-full hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
                  <div className="text-xs font-mono text-zinc-300 mb-4">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <p className="text-lg font-medium leading-relaxed text-zinc-700">
                    {pain.text.split(pain.bold).map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="text-black font-semibold">{pain.bold}</span>
                        )}
                      </span>
                    ))}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>

        {/* Subtle bottom border accent */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-300 to-transparent" />
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <SectionLabel>Features</SectionLabel>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
                Stop guessing. Start knowing.
              </h2>
              <p className="mt-4 text-zinc-500 max-w-xl mx-auto">
                Everything you need to manage a high-performing sales team.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, index) => (
              <FeatureCard key={index} index={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
      </div>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-32 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-20">
              <SectionLabel>Setup</SectionLabel>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
                Start seeing everything in minutes
              </h2>
              <p className="mt-4 text-zinc-500 max-w-xl mx-auto">
                No complex setup. No IT required. Just visibility.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-0 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <AnimatedSection key={index} delay={index * 150}>
                <div className="relative text-center px-8">
                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-10 left-[calc(50%+40px)] w-[calc(100%-80px)] h-px bg-zinc-200" />
                  )}

                  <div className="relative inline-flex flex-col items-center">
                    <div className="text-5xl font-semibold text-zinc-100 mb-3 tabular-nums">
                      {step.step}
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-zinc-950 flex items-center justify-center mb-6">
                      <step.icon className="h-6 w-6 text-white" strokeWidth={1.5} />
                    </div>
                  </div>

                  <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-zinc-50">
        {/* Subtle top border */}
        <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />

        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
                Simple, transparent pricing
              </h2>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <div className="max-w-lg mx-auto">
              <div className="relative bg-white rounded-3xl border border-zinc-200 p-10 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.08)]">
                {/* Subtle top accent */}
                <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-zinc-300 to-transparent" />

                <div className="text-center mb-10">
                  <div className="text-xs tracking-widest uppercase text-zinc-400 mb-6 font-medium">
                    One-time setup
                  </div>
                  <div className="text-5xl font-semibold tracking-tight">Custom</div>
                  <p className="text-sm text-zinc-400 mt-2">Based on team size</p>
                </div>

                <div className="border-t border-zinc-100 pt-8 mb-10 space-y-5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-zinc-500 text-sm">Platform fee</span>
                    <span className="text-2xl font-semibold">
                      $499<span className="text-sm font-normal text-zinc-400">/mo</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-zinc-500 text-sm">Per closer seat</span>
                    <span className="text-2xl font-semibold">
                      $149<span className="text-sm font-normal text-zinc-400">/mo</span>
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
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-zinc-950 flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                <SignedOut>
                  <BookDemoButton size="lg" className="w-full justify-center">
                    Book a Demo
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
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-32 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-[1fr,1.5fr] gap-16 max-w-5xl mx-auto">
            <AnimatedSection>
              <div className="lg:sticky lg:top-32">
                <SectionLabel>FAQ</SectionLabel>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                  Questions?
                  <br />
                  We&apos;ve got answers.
                </h2>
                <p className="mt-4 text-zinc-500">
                  Everything you need to know about getting started with Sequ3nce.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={100}>
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
        </div>
      </section>

      {/* Final CTA Section — Dark bookend */}
      <section className="py-32 bg-zinc-950 relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-zinc-800/20 rounded-full blur-[100px]" />

        <div className="relative mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-white">
                Stop wondering.
                <br />
                Start knowing.
              </h2>
              <p className="mt-6 text-lg text-zinc-400 max-w-xl mx-auto">
                See exactly why deals close and why they don&apos;t — starting today.
              </p>
              <div className="mt-10">
                <SignedOut>
                  <BookDemoButton size="lg" className="bg-white !text-black hover:bg-zinc-100">
                    Book a Demo
                    <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                  </BookDemoButton>
                </SignedOut>
                <SignedIn>
                  <Link href="/dashboard">
                    <Button size="lg" className="bg-white text-black hover:bg-zinc-100">
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

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="md:col-span-2">
              <Logo height={28} />
              <p className="mt-4 text-sm text-zinc-500 max-w-xs leading-relaxed">
                Sales call intelligence for high-ticket teams. Full visibility
                into every call, every closer, every deal.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-medium tracking-widest uppercase text-zinc-400 mb-4">
                Product
              </h4>
              <ul className="space-y-3 text-sm text-zinc-500">
                <li>
                  <button
                    onClick={() => scrollToSection("features")}
                    className="hover:text-black transition-colors"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("how-it-works")}
                    className="hover:text-black transition-colors"
                  >
                    How It Works
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("pricing")}
                    className="hover:text-black transition-colors"
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("faq")}
                    className="hover:text-black transition-colors"
                  >
                    FAQ
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-medium tracking-widest uppercase text-zinc-400 mb-4">
                Account
              </h4>
              <ul className="space-y-3 text-sm text-zinc-500">
                <li>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="hover:text-black transition-colors">
                        Log in
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Link
                      href="/dashboard"
                      className="hover:text-black transition-colors"
                    >
                      Dashboard
                    </Link>
                  </SignedIn>
                </li>
                <li>
                  <Link
                    href="/download"
                    className="hover:text-black transition-colors"
                  >
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
              <Link href="/privacy" className="hover:text-black transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-black transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
