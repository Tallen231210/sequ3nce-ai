"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { trackMetaEvent } from "@/lib/meta-pixel";
import { LeadModal } from "./LeadModal";
import { Cta, FaqList, Guarantee, LegalFooter, SeatsLine, Steps, ValueStack, WhyTiles } from "./sections";
import { SHARED_TILES, type VariantCopy } from "./copy";

const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";

// The cohort countdown bar stays off until there is a REAL session date to
// count to — with null, urgency.js renders no bar at all. Set an ISO date
// ("2026-09-02T18:00:00Z") when a live session is actually scheduled.
const COHORT_DEADLINE: string | null = null;

// The sponsored-seats counter: cap must be a real business commitment (free
// access actually closes, or the price actually changes, when it's reached).
// claimed = genuine lead count from /b2c/lead-count, which returns nothing
// below its honesty floor — the counter simply doesn't render until then.
const SEAT_CAP = 300;

const GROUND: React.CSSProperties = {
  background:
    "radial-gradient(1100px 480px at 50% -80px, rgba(24,24,27,.045), transparent 60%), #fafafa",
};

const CC_CSS = `
.cc .lede{text-wrap:pretty;font-size:17px;line-height:1.58;letter-spacing:-.006em;color:#71717a;max-width:52ch;margin:18px auto 24px;text-align:center}
.cc .body{text-wrap:pretty;font-size:15.5px;line-height:1.72;letter-spacing:-.003em;color:#52525b;max-width:64ch;margin-left:auto;margin-right:auto}
.cc .kick{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.17em;color:#a1a1aa;margin:0 0 16px;text-align:center}
.cc .sect{margin-top:46px}
.cc .divider{height:1px;background:#e4e4e7;margin:46px 0}
.cc .num{font-variant-numeric:tabular-nums}
@media(max-width:420px){.cc .lede{font-size:16px;margin:14px auto 20px}}

.mj-h1{font-size:clamp(29px,4.3vw,50px);font-weight:650;line-height:1.03;letter-spacing:-.035em;text-wrap:balance;max-width:20ch;margin:0 auto;text-align:center;color:#18181b}
.mj-free{background:#18181b;color:#fff;padding:1px 12px;border-radius:8px;display:inline-block}
.mj-cta{display:block;width:100%;max-width:430px;margin:0 auto;border:0;border-radius:12px;background:#18181b;color:#fff;padding:19px;font-size:17px;font-weight:650;letter-spacing:-.015em;cursor:pointer;font-family:inherit;box-shadow:0 12px 30px rgba(9,9,11,.18)}
.mj-cta:hover{background:#27272a}
.mj-cta:disabled{opacity:.55;cursor:default}
.mj-rev{text-align:center;font-size:12.5px;color:#a1a1aa;margin:11px 0 0}
.mj-rev b{color:#18181b;font-weight:600}
.mj-scar{text-align:center;font-size:13px;color:#e11d48;font-weight:600;margin:13px auto 0;max-width:44ch;line-height:1.5}
.mj-stack{max-width:560px;margin:0 auto;border:1px solid #e4e4e7;border-radius:18px;overflow:hidden;background:#fff}
.mj-row{display:flex;justify-content:space-between;gap:14px;padding:13px 18px;border-bottom:1px solid #f4f4f5}
.mj-row span:first-child{font-size:14.5px;letter-spacing:-.008em}
.mj-row span:last-child{font-size:14px;color:#a1a1aa;white-space:nowrap;font-variant-numeric:tabular-nums}
.mj-tot{display:flex;justify-content:space-between;gap:14px;padding:15px 18px;background:#fafafa;border-bottom:1px solid #e4e4e7}
.mj-tot span{font-size:15px;font-weight:650}
.mj-tot span:last-child{text-decoration:line-through;color:#71717a}
.mj-now{display:flex;justify-content:space-between;gap:14px;padding:17px 18px;align-items:center}
.mj-now span:first-child{font-size:15px;font-weight:650}
.mj-now span:last-child{font-size:23px;font-weight:700;letter-spacing:-.03em;color:#059669}
.mj-why{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));max-width:880px;margin:0 auto}
.mj-w{border:1px solid #e4e4e7;border-radius:14px;padding:17px;background:#fff}
.mj-w h4{font-size:15px;font-weight:650;margin:0 0 6px;letter-spacing:-.015em}
.mj-w p{font-size:13.5px;line-height:1.6;color:#71717a;margin:0;text-wrap:pretty}
.mj-step{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start;max-width:660px;margin:0 auto}
.mj-step h3{font-size:15.5px;font-weight:600;letter-spacing:-.012em;margin:0 0 5px}
.mj-step p{font-size:14.5px;line-height:1.65;color:#71717a;margin:0;text-wrap:pretty}
.mj-badge{background:#18181b;color:#fff;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:5px 10px;border-radius:7px;white-space:nowrap}
.mj-faq{max-width:640px;margin:0 auto}
.mj-q{border-bottom:1px solid #e4e4e7;padding:16px 0}
.mj-q p:first-child{font-size:15.5px;font-weight:650;margin:0 0 6px;letter-spacing:-.015em}
.mj-q p:last-child{font-size:14px;line-height:1.62;color:#71717a;margin:0;text-wrap:pretty}
.mj-disc{max-width:70ch;margin:0 auto;font-size:11.5px;line-height:1.65;color:#a1a1aa;text-align:center}
.mj-legal{text-align:center;font-size:11.5px;color:#a1a1aa;margin-top:12px}
.mj-legal a{color:#71717a;text-decoration:underline}
.mj-modal{position:fixed;inset:0;background:rgba(9,9,11,.55);display:none;align-items:center;justify-content:center;z-index:9999;padding:18px;backdrop-filter:blur(3px)}
.mj-modal.on{display:flex}
.mj-box{position:relative;background:#fff;border-radius:20px;padding:26px 24px;max-width:430px;width:100%;box-shadow:0 30px 80px rgba(0,0,0,.4);max-height:92vh;overflow:auto}
.mj-box h3{font-size:22px;font-weight:650;letter-spacing:-.028em;margin:0 0 5px;text-align:center}
.mj-box .sb{font-size:13.5px;color:#71717a;text-align:center;margin:0 0 17px;line-height:1.5}
.mj-in{width:100%;border:1px solid #d4d4d8;border-radius:10px;padding:13px 14px;font-size:15px;outline:none;font-family:inherit;margin-bottom:9px}
.mj-in:focus{border-color:#18181b}
.mj-chk{display:flex;gap:10px;align-items:flex-start;margin:13px 0;padding:12px;background:#fafafa;border:1px solid #e4e4e7;border-radius:11px}
.mj-chk input{margin:2px 0 0;flex:none;width:17px;height:17px;accent-color:#18181b}
.mj-chk label{font-size:12.5px;line-height:1.5;color:#3f3f46}
.mj-fine{font-size:10.5px;line-height:1.55;color:#a1a1aa;margin:11px 0 0}
.mj-x{position:absolute;top:14px;right:16px;border:0;background:#f4f4f5;width:30px;height:30px;border-radius:50%;font-size:17px;cursor:pointer;color:#71717a}
`;

// ── Per-variant copy: "a" = JOB · Brunson, "b" = JOB · Hormozi ──────────────
const VARIANTS: Record<"a" | "b", VariantCopy> = {
  a: {
    headline: (
      <>
        How To Land A <span className="num">$10–20k</span> A Month Closing Role Without Buying A
        Course Or Spamming Your Résumé Into The Void. <span className="mj-free">100% Free</span>
      </>
    ),
    lede: "Before you spend $6,000 on a program, learn the fundamentals and start getting paid inside 30 days. Becoming elite can come after that.",
    videoLabel: "The whole thing explained · 90 seconds",
    cta: "Yes, get me access",
    whyKick: "Why the old way stopped working",
    whyTiles: [
      {
        h: "Paid First, Elite Later",
        p: "Most people get this backwards. They spend six grand getting great at a job nobody's hired them for.",
      },
      {
        h: "The Intro Is The Bottleneck",
        p: "Managers stopped posting seats and started asking people they trust. That's why nobody writes back.",
      },
      {
        h: "We're In That Room",
        p: "No course can hand you an introduction. None of them are where the hiring happens.",
      },
    ],
    faqSwap: {
      q: "Do I need sales experience?",
      a: "No. Most people we place came from doors, solar, insurance, retail or cars. If you've never sold at all, do the six weeks properly rather than skim it.",
    },
  },
  b: {
    headline: (
      <>
        Get Into Remote Sales Without Paying <span className="num">$6,000</span> To Find Out If
        You&rsquo;re Any Good At It. <span className="mj-free">100% Free</span>
      </>
    ),
    lede: "Six weeks of coaching, a live board of seats that are hiring, and an intro to the person doing the hiring. Fill the form and a coach calls you within minutes.",
    videoLabel: "How to get in without paying to get in · 90 seconds",
    cta: "Get all of it free",
    whyKick: "Why this works",
    whyTiles: [
      {
        h: "$6,000 Of Value. You Pay $0",
        p: "Not a made-up number. It's what the seven things above cost one at a time.",
      },
      {
        h: "Get Paid While You Get Good",
        p: "Nobody gets great before their first seat. You get good on live calls, with somebody reviewing them.",
      },
      {
        h: "No Ceiling",
        p: "No quota. No territory. What you close is what you're paid.",
      },
    ],
    faqSwap: {
      q: "What's the catch?",
      a: "That's it. There isn't a second one. We get paid when you're using our software on a real seat, so putting you on one fast is the whole business.",
    },
  },
};

function OptInInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [variant, setVariant] = useState<"a" | "b" | null>(null);
  useEffect(() => {
    const forced = params.get("v");
    if (forced === "a" || forced === "b") {
      localStorage.setItem("start-variant", forced);
      setVariant(forced);
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

  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  // Toasts + sponsored-seats counter, identical on both variants. Wired to
  // REAL endpoints that return nothing until enough genuine leads exist (the
  // widgets then stay hidden — they never invent data). ?sp=demo forces the
  // scripts' built-in sample numbers for previewing; for us, never for ads.
  useEffect(() => {
    if (!variant) return;
    const w = window as unknown as Record<string, unknown>;
    if (w.__spLoaded) return;
    w.__spLoaded = true;
    const demo = params.get("sp") === "demo";
    w.SP_CONFIG = {
      ...(demo ? { demo: true } : { endpoint: `${CONVEX_SITE_URL}/b2c/recent-signups` }),
      style: "card",
      position: "bottom-left",
      // Cadence tuned so an average scroll of the page sees 4+ different
      // names: first at 2.5s, then one every 8s, each visible 5.5s.
      firstDelay: 2500,
      interval: 8000,
      duration: 5500,
    };
    w.SP_URGENCY = {
      deadline: COHORT_DEADLINE,
      cap: SEAT_CAP,
      ...(demo ? { claimed: 259 } : { endpoint: `${CONVEX_SITE_URL}/b2c/lead-count` }),
    };
    const tags = ["/social-proof.js", "/urgency.js"].map((src) => {
      const t = document.createElement("script");
      t.src = src;
      document.body.appendChild(t);
      return t;
    });
    return () => {
      // Client-side navigation must not leave widgets running on other pages.
      (w.SequenceSocialProof as { stop?: () => void } | undefined)?.stop?.();
      (w.SequenceUrgency as { stop?: () => void } | undefined)?.stop?.();
      document.querySelectorAll(".sp-host, .spc").forEach((el) => el.remove());
      tags.forEach((t) => t.remove());
      w.__spLoaded = false;
    };
  }, [variant, params]);

  async function submit(fields: { firstName: string; email: string; phone: string }) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${CONVEX_SITE_URL}/b2c/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: fields.firstName,
          lastName: "",
          email: fields.email,
          phone: fields.phone,
          source: `start-funnel-${variant ?? "a"}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "That didn't save — try again.");
      }
      // Ad-platform conversion signal — the funnel is the pixel's Lead source.
      void trackMetaEvent(
        "Lead",
        { product: "b2c", contentIds: [`start-funnel-${variant ?? "a"}`] },
        { email: fields.email, phone: fields.phone, firstName: fields.firstName },
      );
      router.push(`/start/thanks?p=${encodeURIComponent(fields.phone)}`);
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

  const c = VARIANTS[variant];

  return (
    <main className="relative mx-auto max-w-[1120px] px-6 py-12 lg:py-16" style={{ paddingTop: 34 }}>
      <div aria-hidden className="absolute inset-0 -z-10" style={GROUND} />
      <style dangerouslySetInnerHTML={{ __html: CC_CSS }} />

      <div className="cc">
        <h1 className="mj-h1">{c.headline}</h1>
        <p className="lede">{c.lede}</p>

        {/* ══ REPLACE: VSL embed goes here when the video exists ══ */}
        <div
          className="flex aspect-video flex-col items-center justify-center gap-2.5 rounded-xl bg-zinc-950 text-white"
          style={{ maxWidth: 660, margin: "0 auto 10px", boxShadow: "0 20px 56px rgba(9,9,11,.20)" }}
        >
          <span className="flex h-13 w-13 items-center justify-center rounded-full bg-white p-3.5">
            <Play className="h-5 w-5 fill-zinc-950 text-zinc-950" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{c.videoLabel}</span>
        </div>
        <p className="body" style={{ textAlign: "center", fontSize: 14, color: "#a1a1aa" }}>
          Watch this first. It&rsquo;s short and it explains everything.
        </p>

        <div className="sect" style={{ marginTop: 26 }}>
          <SeatsLine />
          <div style={{ height: 11 }} />
          <Cta label={c.cta} onOpen={openModal} scar />
        </div>

        <div className="divider" />
        <ValueStack />
        <div className="sect">
          <Cta label={c.cta} onOpen={openModal} />
        </div>

        <div className="divider" />
        <WhyTiles kick={c.whyKick} tiles={c.whyTiles.concat(SHARED_TILES)} />
        <div className="sect">
          <Cta label={c.cta} onOpen={openModal} />
        </div>

        <div className="divider" />
        <Steps />

        <div className="divider" />
        <Guarantee />

        <div className="divider" />
        <FaqList swap={c.faqSwap} />

        <div className="sect">
          <Cta label={c.cta} onOpen={openModal} />
        </div>

        <LegalFooter />
      </div>

      <LeadModal open={modalOpen} onClose={closeModal} busy={busy} error={error} onSubmit={submit} />
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
