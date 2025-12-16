"use client";

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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

// Animated section wrapper
function AnimatedSection({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isInView } = useInView();

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// FAQ Accordion Item
function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="font-medium">{question}</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <p className="text-muted-foreground">{answer}</p>
        </div>
      </div>
    </div>
  );
}

// Screenshot tabs
function ScreenshotTabs() {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    {
      label: "Live Calls",
      description: "Monitor every active call in real-time",
    },
    {
      label: "Call Details",
      description: "Review transcripts with AI-extracted ammo",
    },
    {
      label: "Closer Stats",
      description: "Track performance across your entire team",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Tab buttons */}
      <div className="flex flex-wrap justify-center gap-2">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={cn(
              "px-6 py-3 rounded-lg text-sm font-medium transition-all",
              activeTab === index
                ? "bg-foreground text-background"
                : "bg-zinc-100 text-muted-foreground hover:bg-zinc-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Screenshot display */}
      <div className="relative">
        <div className="bg-zinc-100 rounded-xl p-4 shadow-2xl shadow-zinc-200/50">
          {/* Browser frame */}
          <div className="bg-zinc-200 rounded-t-lg px-4 py-3 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-zinc-400" />
              <div className="w-3 h-3 rounded-full bg-zinc-400" />
              <div className="w-3 h-3 rounded-full bg-zinc-400" />
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-zinc-300 rounded-md h-6 max-w-md mx-auto" />
            </div>
          </div>

          {/* Screenshot placeholder - in production, replace with actual screenshots */}
          <div className="bg-white rounded-b-lg aspect-[16/10] flex items-center justify-center border border-zinc-200">
            <div className="text-center p-8">
              <div className="text-6xl mb-4">
                {activeTab === 0 && "📡"}
                {activeTab === 1 && "📝"}
                {activeTab === 2 && "📊"}
              </div>
              <p className="text-lg font-medium">{tabs[activeTab].label}</p>
              <p className="text-muted-foreground mt-2">
                {tabs[activeTab].description}
              </p>
              <p className="text-sm text-zinc-400 mt-4">
                [Product screenshot will go here]
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
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

  return (
    <main className="min-h-screen bg-background">
      {/* Navigation - Sticky */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-200",
          isScrolled
            ? "bg-background/80 backdrop-blur-lg border-b border-border"
            : "bg-transparent"
        )}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex h-16 items-center justify-between">
            <Logo href="/" height={30} />
            <div className="flex items-center gap-4">
              <SignedOut>
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm">Get Started</Button>
                </SignUpButton>
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
      <section className="pt-32 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Copy */}
            <div>
              <AnimatedSection>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1]">
                  Finally see why deals close
                  <span className="text-muted-foreground"> — and why they don&apos;t.</span>
                </h1>
              </AnimatedSection>

              <AnimatedSection delay={100}>
                <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                  Stop managing your sales team blind. See every call as it happens,
                  know exactly what&apos;s being said, and make decisions based on data
                  — not what your closers tell you after the fact.
                </p>
              </AnimatedSection>

              <AnimatedSection delay={200}>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <SignedOut>
                    <SignUpButton mode="modal">
                      <Button size="lg">
                        Get Started
                        <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                      </Button>
                    </SignUpButton>
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    See How It Works →
                  </button>
                </div>
              </AnimatedSection>
            </div>

            {/* Right - Product Mockup */}
            <AnimatedSection delay={300} className="lg:pl-8">
              <div className="bg-zinc-100 rounded-xl p-3 shadow-2xl shadow-zinc-300/30">
                <div className="bg-zinc-200 rounded-t-lg px-3 py-2 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
                  </div>
                </div>
                <div className="bg-white rounded-b-lg aspect-[4/3] flex items-center justify-center border border-zinc-200">
                  <div className="text-center p-6">
                    <div className="text-5xl mb-3">📡</div>
                    <p className="font-medium">Live Calls Dashboard</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      [Hero screenshot will go here]
                    </p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Product Screenshots Section */}
      <section className="py-24 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Your sales floor, in one dashboard
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Real-time visibility into every call, every closer, every deal
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <ScreenshotTabs />
          </AnimatedSection>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                You&apos;re running a sales team blind
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Right now, you only know what your closers choose to tell you
              </p>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              "Deal fell through? You'll never know if your closer fumbled or if the lead was bad",
              "Your top performer is closing 3x more — but you can't replicate what they're doing",
              "You're spending $50k/month on leads, but have zero proof when they no-show",
              "Coaching is a guessing game. You're giving feedback on calls you never heard",
            ].map((pain, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="p-6 rounded-xl border border-border bg-zinc-50/50">
                  <p className="text-lg font-medium leading-relaxed">
                    {pain}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Stop guessing. Start knowing.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Everything you need to manage a high-performing sales team
              </p>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
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
                  "AI extracts key quotes as they're spoken. When a prospect says \"money isn't the issue,\" you'll know before the call ends.",
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
                  "Full call recordings, transcripts, and stats. No more \"the lead was bad\" — you have the proof.",
              },
              {
                icon: Calendar,
                title: "Never miss a scheduled call",
                description:
                  "Calendly syncs automatically. Know exactly when calls should happen and if they actually did.",
              },
            ].map((feature, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="p-6">
                  <feature.icon className="h-8 w-8 mb-4" strokeWidth={1.5} />
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Start seeing everything in minutes
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                No complex setup. No IT required. Just visibility.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: UserPlus,
                step: "1",
                title: "Create your team",
                description:
                  "Set up your account, connect Calendly, and add your closers.",
              },
              {
                icon: Monitor,
                step: "2",
                title: "Closers install the app",
                description:
                  "One download, one login. They click record when calls start. That's it.",
              },
              {
                icon: Eye,
                step: "3",
                title: "You see everything",
                description:
                  "Watch calls live, review transcripts, track performance. Full visibility from day one.",
              },
            ].map((step, index) => (
              <AnimatedSection key={index} delay={index * 150}>
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-100 mb-6">
                    <step.icon className="h-7 w-7" strokeWidth={1.5} />
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    Step {step.step}
                  </div>
                  <h3 className="font-semibold text-lg">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Simple, transparent pricing
              </h2>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <div className="max-w-lg mx-auto">
              <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
                <div className="text-center mb-8">
                  <div className="text-sm text-muted-foreground mb-4">
                    One-time setup
                  </div>
                  <div className="text-4xl font-semibold">$1,000</div>
                </div>

                <div className="border-t border-border pt-8 mb-8">
                  <div className="flex justify-between items-baseline mb-4">
                    <span className="text-muted-foreground">Platform fee</span>
                    <span className="text-xl font-semibold">$199/mo</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-muted-foreground">Per closer seat</span>
                    <span className="text-xl font-semibold">$99/mo</span>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {[
                    "Unlimited calls",
                    "Real-time transcription",
                    "AI-powered ammo extraction",
                    "Playbook builder",
                    "Closer stats",
                    "Calendly integration",
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-foreground" strokeWidth={1.5} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <SignedOut>
                  <SignUpButton mode="modal">
                    <Button size="lg" className="w-full">
                      Get Started
                      <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                    </Button>
                  </SignUpButton>
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
      <section id="faq" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Questions? We&apos;ve got answers.
              </h2>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <div className="max-w-2xl mx-auto">
              <FAQItem
                question="What types of calls does Sequ3nce work with?"
                answer="Zoom, Google Meet, phone calls — any audio your computer plays. The desktop app captures system audio, so it works with any calling platform."
              />
              <FAQItem
                question="How does the desktop app work?"
                answer="Closers download a simple app that captures system audio. One click to start recording, one click to stop. It runs quietly in the background during calls."
              />
              <FAQItem
                question="Is my call data secure?"
                answer="Yes, all calls are encrypted in transit and at rest. You own your data, and we never share it with third parties."
              />
              <FAQItem
                question="What if my closers aren't tech-savvy?"
                answer="The app is dead simple. Download, login with your email, click the big record button. If they can use Zoom, they can use Sequ3nce."
              />
              <FAQItem
                question="Do you integrate with my CRM?"
                answer="Calendly integration is live today. CRM integrations (GoHighLevel, Close) are coming soon. Let us know what you need."
              />
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6">
          <AnimatedSection>
            <div className="text-center">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                Stop wondering. Start knowing.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                See exactly why deals close and why they don&apos;t — starting today.
              </p>
              <div className="mt-10">
                <SignedOut>
                  <SignUpButton mode="modal">
                    <Button size="lg">
                      Get Started
                      <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                    </Button>
                  </SignUpButton>
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

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Logo & Copyright */}
            <div className="md:col-span-2">
              <Logo height={30} />
              <p className="mt-4 text-sm text-muted-foreground max-w-xs">
                Sales management software for high-ticket teams. Full visibility
                into every call, every closer, every deal.
              </p>
            </div>

            {/* Product Links */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <button
                    onClick={() => scrollToSection("how-it-works")}
                    className="hover:text-foreground transition-colors"
                  >
                    How It Works
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("pricing")}
                    className="hover:text-foreground transition-colors"
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("faq")}
                    className="hover:text-foreground transition-colors"
                  >
                    FAQ
                  </button>
                </li>
              </ul>
            </div>

            {/* Account Links */}
            <div>
              <h4 className="font-semibold mb-4">Account</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="hover:text-foreground transition-colors">
                        Sign In
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Link
                      href="/dashboard"
                      className="hover:text-foreground transition-colors"
                    >
                      Dashboard
                    </Link>
                  </SignedIn>
                </li>
                <li>
                  <SignedOut>
                    <SignUpButton mode="modal">
                      <button className="hover:text-foreground transition-colors">
                        Get Started
                      </button>
                    </SignUpButton>
                  </SignedOut>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © 2025 Sequ3nce.ai. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
