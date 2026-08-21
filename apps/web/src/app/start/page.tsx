"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Play, X } from "lucide-react";

const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";

// ============================================================================
// Opt-in with a built-in A/B split.
//
// Variant A: form only. Variant B: video above the form, its own lede copy —
// the copy difference is part of the test, straight from the mockup spec.
// Assignment is a coin flip persisted in localStorage (a returning visitor
// keeps their arm); ?v=a / ?v=b overrides for previewing and for ads that
// want to force an arm. The chosen arm ships with the lead as
// source: "start-funnel-a" | "start-funnel-b", so conversion attribution
// lives on the lead record itself.
// ============================================================================

const GROUND: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
  maskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
};

function OptInInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [variant, setVariant] = useState<"a" | "b" | null>(null);
  useEffect(() => {
    const forced = params.get("v");
    if (forced === "a" || forced === "b") {
      setVariant(forced);
      localStorage.setItem("start-variant", forced);
      return;
    }
    const stored = localStorage.getItem("start-variant");
    if (stored === "a" || stored === "b") {
      setVariant(stored);
      return;
    }
    const coin = Math.random() < 0.5 ? "a" : "b";
    localStorage.setItem("start-variant", coin);
    setVariant(coin);
  }, [params]);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !email.trim() || !phone.trim()) {
      setError("All three fields — that's how we call you.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${CONVEX_SITE_URL}/b2c/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: "",
          email: email.trim(),
          phone: phone.trim(),
          source: `start-funnel-${variant ?? "a"}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error || "That didn't save — try again.",
        );
      }
      router.push(`/start/thanks?p=${encodeURIComponent(phone.trim())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save — try again.");
      setBusy(false);
    }
  }

  if (!variant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  const formCard = (
    <div
      className={
        "rounded-[20px] border border-zinc-200 bg-white p-7 shadow-[0_14px_44px_rgba(9,9,11,0.07)] " +
        (variant === "b" ? "lg:sticky lg:top-24" : "")
      }
    >
      {variant === "b" && (
        // ══ REPLACE: VSL embed goes here when the video exists ══
        <div className="mb-4 flex aspect-video flex-col items-center justify-center gap-2.5 rounded-xl bg-zinc-950 text-white">
          <span className="flex h-13 w-13 items-center justify-center rounded-full bg-white p-3.5">
            <Play className="h-5 w-5 fill-zinc-950 text-zinc-950" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            Watch first · 90 seconds
          </span>
        </div>
      )}
      {variant === "a" && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Start here
          </p>
          <p className="mb-4 mt-1 text-sm leading-relaxed text-zinc-500">
            Thirty seconds to fill in — we call you within minutes.
          </p>
        </>
      )}
      <form onSubmit={submit} className="grid gap-2.5">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className="w-full rounded-[10px] border border-zinc-300 px-4 py-3.5 text-[15px] outline-none focus:border-zinc-900"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          className="w-full rounded-[10px] border border-zinc-300 px-4 py-3.5 text-[15px] outline-none focus:border-zinc-900"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          placeholder="Mobile number"
          className="w-full rounded-[10px] border border-zinc-300 px-4 py-3.5 text-[15px] outline-none focus:border-zinc-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-[10px] bg-zinc-900 px-4 py-4 text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "One second…" : "Get instant access"}
        </button>
      </form>
      {error && <p className="mt-2 text-center text-sm text-rose-600">{error}</p>}
      <p className="mt-3 text-center text-xs leading-relaxed text-zinc-400">
        We call you within minutes to get you set up. Keep your phone on you.
      </p>
    </div>
  );

  const ledeA =
    "We do both, and we charge for neither. Live commission roles from offers we've screened, plus the six-week program that gets you ready to take them. You pay for the software that runs it — that's the entire deal, and we'd rather say it now than halfway through.";
  const ledeB =
    "Six weeks of training, a vetted board of live commission roles, and a room full of closers actually doing the work. You pay for the software that runs it. That's the entire deal — and we'd rather say it now than halfway through.";

  return (
    <main className="relative mx-auto max-w-[1120px] px-6 py-12 lg:py-16">
      <div aria-hidden className="absolute inset-0 -z-10" style={GROUND} />

      <div
        className={
          "grid gap-11 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 " +
          (variant === "a" ? "lg:items-center" : "lg:items-start")
        }
      >
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Free training · Free role placement
          </div>
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
            The closer career, without the course fee
          </p>
          <h1 className="text-[clamp(32px,4.6vw,54px)] font-semibold leading-[0.98] tracking-[-0.04em] text-zinc-950">
            They charge $5,000 to teach you closing. Then you&apos;re{" "}
            <span className="font-serif italic font-normal">on your own</span> to
            find the job<span className="text-zinc-300">.</span>
          </h1>
          <p className="mt-4 max-w-[56ch] text-base leading-relaxed text-zinc-500">
            {variant === "a" ? ledeA : ledeB}
          </p>

          <div className="mt-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Who this is for
            </p>
            {[
              "You want a commission seat and don't have one yet",
              "You've sold something before and want to move to commission work",
              "You're closing now and want your numbers to travel with you",
            ].map((line) => (
              <div key={line} className="mb-2.5 flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                <p className="text-sm leading-normal">{line}</p>
              </div>
            ))}
            <div className="mb-2.5 flex items-start gap-2.5">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" strokeWidth={3} />
              <p className="text-sm leading-normal text-zinc-500">
                You want passive income and won&apos;t get on the phone
              </p>
            </div>
          </div>
        </div>

        <div>{formCard}</div>
      </div>

      <div className="my-10 h-px bg-zinc-200" />

      <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
        What you get, free
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Live commission roles", "Openings from offers we've screened and introductions to the people hiring. Not a scraped job board."],
          ["Six-week closing program", "Framework, objection handling and call reviews. The same material sold elsewhere for four figures."],
          ["Your own call data", "Every call analysed and scored. The record belongs to you, not the company you close for."],
          ["The room", "Closers running real floors. Ask a question at 11pm, get an answer."],
        ].map(([h, p]) => (
          <div key={h} className="border-t-2 border-zinc-900 pt-3">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{h}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-500">{p}</p>
          </div>
        ))}
      </div>

      <div className="my-10 h-px bg-zinc-200" />

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <h3 className="mb-2 text-[15px] font-semibold">Why it&apos;s free</h3>
          <p className="text-[13.5px] leading-relaxed text-zinc-500">
            The training only works if you&apos;re running the software while you
            do it — the call analysis, the scoring, the placement profile. So we
            stopped charging for the teaching and charge for the tools instead.
            Sequ3nce and Churp are ours. That&apos;s how we make money, and
            you&apos;ll hear it again on the call before you&apos;re asked to
            spend anything.
          </p>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Ready?
          </p>
          <p className="mb-4 text-sm leading-relaxed text-zinc-500">
            Thirty seconds to fill in, and we call you within minutes.
          </p>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="block w-full rounded-[10px] bg-zinc-900 px-4 py-4 text-center text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Get instant access
          </a>
        </div>
      </div>
    </main>
  );
}

export default function StartPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      }
    >
      <OptInInner />
    </Suspense>
  );
}
