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
                  Know exactly what your closers are saying.
                  <span className="text-muted-foreground"> In real-time.</span>
                </h1>
              </AnimatedSection>

              <AnimatedSection delay={100}>
                <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                  Stop wondering why deals fall through. See every call as it
                  happens, catch winning moments, and coach your team with real
                  data — not guesswork.
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
                See it in action
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Real-time visibility into every call your team takes
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
                Sound familiar?
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              "You have no idea what's happening on calls until they're over",
              "Your best closer's techniques are stuck in their head, not shared with the team",
              "You're paying for leads that no-show and can't prove it to marketing",
              "Coaching sessions are based on memory, not what actually happened",
            ].map((pain, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="p-6 rounded-xl border border-border bg-zinc-50/50">
                  <p className="text-lg font-medium leading-relaxed">
                    &ldquo;{pain}&rdquo;
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
                Everything you need to see what&apos;s really happening
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Radio,
                title: "Live Call Monitoring",
                description:
                  "See all active calls in real-time. Know who's on, who's waiting, who's closing.",
              },
              {
                icon: Sparkles,
                title: "Real-Time Ammo Extraction",
                description:
                  'AI pulls key quotes as they\'re spoken. "Money isn\'t the issue" → your closer sees it instantly.',
              },
              {
                icon: BarChart3,
                title: "Talk-to-Listen Ratio",
                description:
                  "See who's talking too much. Great closers listen more — now you have the data.",
              },
              {
                icon: BookOpen,
                title: "Playbook Builder",
                description:
                  "Save the best call moments. Build a training library from real wins.",
              },
              {
                icon: Users,
                title: "Closer Stats Dashboard",
                description:
                  "Close rates, cash collected, call volume. Know who's performing at a glance.",
              },
              {
                icon: Calendar,
                title: "Calendly Integration",
                description:
                  "Scheduled calls sync automatically. No manual entry, no missed calls.",
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
                Up and running in 5 minutes
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: UserPlus,
                step: "1",
                title: "Manager creates account",
                description:
                  "Set up your team, connect Calendly, invite closers.",
              },
              {
                icon: Monitor,
                step: "2",
                title: "Closers download the app",
                description:
                  "Simple desktop app that captures calls. One click to start.",
              },
              {
                icon: Eye,
                step: "3",
                title: "Watch calls in real-time",
                description:
                  "See transcripts, ammo, and stats as calls happen. Coach smarter.",
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
                Ready to see what&apos;s really happening on your calls?
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                Join sales teams who close more deals with real-time intelligence.
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
                Sales call intelligence for high-ticket teams. See what&apos;s
                happening on every call in real-time.
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
