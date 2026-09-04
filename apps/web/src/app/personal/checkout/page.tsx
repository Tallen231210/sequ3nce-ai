"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { Check, Loader2 } from "lucide-react";
import { trackMetaEvent } from "@/lib/meta-pixel";

// ============================================================================
// The plan picker. Four plans, one product — the only variable is commitment.
//
// Display per-month, charge the total: "$83/mo billed annually" converts
// where "$1,000" scares, and the exact charge is stated right underneath so
// nobody feels tricked at the Polar page. Reps drive prospects here on
// screen-share; self-serve traffic lands here from /personal.
// ============================================================================

const PLANS: Array<{
  key: string;
  label: string;
  perMonth: string;
  charged: string;
  note?: string;
  highlight?: boolean;
  vip?: boolean;
}> = [
  {
    key: "monthly",
    label: "Monthly",
    perMonth: "$150",
    charged: "Billed $150 every month",
  },
  {
    key: "3month",
    label: "3 Months",
    perMonth: "$133",
    charged: "Billed $400 every 3 months",
  },
  {
    key: "6month",
    label: "6 Months",
    perMonth: "$100",
    charged: "Billed $600 every 6 months",
    note: "Save 33%",
    highlight: true,
  },
  {
    key: "yearly",
    label: "Yearly — VIP",
    perMonth: "$83",
    charged: "Billed $1,000 once a year",
    note: "Save 44% + VIP",
    vip: true,
  },
];

// What the yearly plan adds — the VIP tier. Shown compactly on its card.
const VIP_PERKS = [
  "The Placement Line — partner roles first",
  "Gold verified badge + 24h verification",
  "VIP badge + The Inner Circle community",
  "VIP events · 20% off coaching & merch",
];

const INCLUDED = [
  "Unlimited call recording & transcripts",
  "AI analysis and scoring on every call",
  "Your stats, streaks and public closer profile",
  "Community, coaching calls & Call of the Week",
];

export default function PersonalCheckoutPage() {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sales-call trial (rep-controlled, 2026-09-04): there is deliberately NO
  // code field on this page — a visible one invites "do you have a code?"
  // mid-close. The trial exists only when the rep sends
  // /personal/checkout?code=XXXX to a lead they could not close. The server
  // re-validates on purchase; this preview is the honest "$0 today" framing.
  const [trial, setTrial] = useState<{ code: string; trialDays: number } | null>(null);
  // The promo-code field is deliberately generic furniture: a collapsed
  // "Have a promo code?" link like every checkout has. It never mentions
  // calls, reps, trials, or "free" until a valid code is actually applied.
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  async function applyCode() {
    const cleaned = code.trim().toUpperCase();
    setCodeError(null);
    if (!cleaned) return;
    setCheckingCode(true);
    try {
      const res = await fetch(
        `https://ideal-ram-982.convex.site/b2c/trial-code?code=${encodeURIComponent(cleaned)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { valid?: boolean; trialDays?: number };
      if (data.valid && typeof data.trialDays === "number") {
        setTrial({ code: cleaned, trialDays: data.trialDays });
      } else {
        setTrial(null);
        setCodeError("That code isn't valid.");
      }
    } catch {
      setCodeError("Couldn't check that code — try again.");
    }
    setCheckingCode(false);
  }

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("code");
    const code = raw?.trim().toUpperCase() ?? "";
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return;
    let cancelled = false;
    fetch(`https://ideal-ram-982.convex.site/b2c/trial-code?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { valid?: boolean; trialDays?: number }) => {
        if (!cancelled && data.valid && typeof data.trialDays === "number") {
          setTrial({ code, trialDays: data.trialDays });
        }
      })
      .catch(() => { /* no trial shown; the normal checkout stands */ });
    return () => { cancelled = true; };
  }, []);

  async function buy(plan: string) {
    setBusyPlan(plan);
    setError(null);
    void trackMetaEvent("InitiateCheckout", {
      product: "b2c",
      contentIds: [plan],
    });
    // Meta click identifiers ride into the Polar checkout as metadata so the
    // order.paid webhook can attribute the Purchase back to the ad click.
    // _fbp/_fbc are set by the pixel; if _fbc is missing but the visit still
    // carries ?fbclid=..., build _fbc the way the pixel would.
    const cookie = (name: string) =>
      document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1];
    const fbp = cookie("_fbp");
    let fbc = cookie("_fbc");
    if (!fbc) {
      const fbclid = new URLSearchParams(window.location.search).get("fbclid");
      if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
    try {
      const res = await fetch("/api/polar/b2c-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          fbp,
          fbc,
          ...(trial && plan === "monthly" ? { code: trial.code } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Something went wrong — try again.");
    } catch {
      setError("Something went wrong — try again.");
    }
    setBusyPlan(null);
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200/60 bg-white/70 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2.5 px-6">
          <Logo href="/personal" height={22} />
          <span className="relative -top-[2px] rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white">
            PERSONAL
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
        {/* Faint dot grid + radial fade — same ground the landing page stands on */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 80%)",
          }}
        />
        <p className="mb-4 text-center text-[12px] uppercase tracking-[0.22em] text-zinc-500">
          Full access · every plan
        </p>
        <h1 className="text-center text-4xl sm:text-5xl font-semibold tracking-[-0.04em] leading-[0.95] text-zinc-950">
          Choose your{" "}
          <span className="font-serif italic font-normal">commitment</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-center text-base text-zinc-600 leading-relaxed">
          Every plan is the full product. Pay, set your password, download the
          app — you&apos;ll be recording calls in five minutes.
        </p>

        {trial && (
          <p className="mx-auto mt-6 max-w-md text-center text-sm text-emerald-700">
            Code {trial.code} applied — Monthly starts with a {trial.trialDays}-day free
            trial. Your card is saved today and billed $150 when the trial ends.
          </p>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={
                "relative flex flex-col rounded-2xl bg-white p-6 " +
                (p.vip
                  ? "border-2 border-amber-400 shadow-lg shadow-amber-100"
                  : p.highlight
                    ? "border-2 border-zinc-900 shadow-lg shadow-zinc-200/50"
                    : "border border-zinc-200")
              }
            >
              {p.note && (
                <span
                  className={
                    "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] uppercase " +
                    (p.vip
                      ? "bg-amber-400 text-zinc-950"
                      : p.highlight
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-200 bg-zinc-50 text-zinc-700")
                  }
                >
                  {p.note}
                </span>
              )}
              <span className={"text-sm font-semibold " + (p.vip ? "text-amber-600" : "text-zinc-500")}>
                {p.label}
              </span>
              {trial && p.key === "monthly" ? (
                <>
                  <span className="mt-2 text-5xl font-semibold tracking-[-0.04em] leading-none text-zinc-900">
                    $0
                    <span className="text-lg font-medium tracking-tight text-zinc-400"> today</span>
                  </span>
                  <span className="mt-1 text-[12px] text-zinc-500">
                    {trial.trialDays}-day free trial, then $150 every month. Cancel before it
                    ends and you won&apos;t be charged.
                  </span>
                </>
              ) : (
                <>
                  <span className="mt-2 text-5xl font-semibold tracking-[-0.04em] leading-none text-zinc-900">
                    {p.perMonth}
                    <span className="text-lg font-medium tracking-tight text-zinc-400">/mo</span>
                  </span>
                  <span className="mt-1 text-[12px] text-zinc-500">{p.charged}</span>
                </>
              )}
              {p.vip && (
                <ul className="mt-4 space-y-1.5">
                  {VIP_PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-zinc-600">
                      <span className="mt-px text-amber-500">✦</span>
                      {perk}
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => buy(p.key)}
                disabled={busyPlan !== null}
                className={
                  "mt-6 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 " +
                  (p.vip
                    ? "bg-amber-400 text-zinc-950 hover:bg-amber-300"
                    : p.highlight
                      ? "bg-zinc-900 text-white hover:bg-zinc-800"
                      : "border border-zinc-300 text-zinc-900 hover:border-zinc-900")
                }
              >
                {busyPlan === p.key ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : trial && p.key === "monthly" ? (
                  `Start ${trial.trialDays}-day free trial`
                ) : (
                  "Get started"
                )}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-rose-600">{error}</p>
        )}

        <div className="mx-auto mt-8 max-w-md text-center">
          {!showCode && !trial ? (
            <button
              type="button"
              onClick={() => setShowCode(true)}
              className="text-[12px] text-zinc-400 underline underline-offset-2 hover:text-zinc-600"
            >
              Have a promo code?
            </button>
          ) : !trial ? (
            <form
              onSubmit={(e) => { e.preventDefault(); void applyCode(); }}
              className="mx-auto flex max-w-xs items-center gap-2"
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Promo code"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm uppercase tracking-wide text-zinc-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={checkingCode || !code.trim()}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-900 disabled:opacity-50"
              >
                {checkingCode ? "…" : "Apply"}
              </button>
            </form>
          ) : null}
          {codeError && <p className="mt-2 text-sm text-rose-600">{codeError}</p>}
        </div>

        <div className="mx-auto mt-12 max-w-md">
          <p className="text-sm font-semibold text-zinc-700">
            Every plan includes
          </p>
          <ul className="mt-3 space-y-2">
            {INCLUDED.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-zinc-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
