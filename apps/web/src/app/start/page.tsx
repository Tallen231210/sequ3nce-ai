"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Play } from "lucide-react";
import { trackMetaEvent } from "@/lib/meta-pixel";

const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";

// ============================================================================
// Opt-in with a built-in A/B split — round two, copy by the co-founder.
//
// Both arms sell the JOB angle ("land a remote closing seat"): variant A is
// the Brunson-style long form, variant B the shorter Hormozi-style page.
// This round tests the style, not the audience. Assignment is a coin flip
// persisted in localStorage (a returning visitor keeps their arm); ?v=a /
// ?v=b overrides for previews and for ads that force an arm. The arm ships
// with the lead as source: "start-funnel-a" | "start-funnel-b".
//
// The design collects name + mobile + email (email added back to the
// mockups deliberately: the lead pipeline and GHL sync key on it).
// ============================================================================

const GROUND: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
  maskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
};

// Typography + layout system from the copy mockups. Scoped under .cc.
const CC_CSS = `
.cc h1{text-wrap:balance;font-feature-settings:"ss01","cv01";letter-spacing:-.038em;line-height:.99;max-width:19ch;margin:0 auto;text-align:center}
.cc .lede{text-wrap:pretty;font-size:17px;line-height:1.58;letter-spacing:-.006em;color:#71717a;max-width:52ch;margin:18px auto 24px;text-align:center}
.cc .body{text-wrap:pretty;font-size:15.5px;line-height:1.72;letter-spacing:-.003em;color:#52525b;max-width:64ch;margin-left:auto;margin-right:auto}
.cc .kick{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.17em;color:#a1a1aa;margin:0 0 16px;text-align:center}
.cc .sect{margin-top:46px}
.cc .divider{height:1px;background:#e4e4e7;margin:46px 0}
.cc .num{font-variant-numeric:tabular-nums}
.cc .outrow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:620px;margin:0 auto 26px}
.cc .out{text-align:center;padding:12px 8px;border:1px solid #e4e4e7;border-radius:12px;background:#fff}
.cc .out b{display:block;font-size:14px;font-weight:600;letter-spacing:-.015em;line-height:1.25;color:#18181b}
.cc .out span{display:block;font-size:11.5px;line-height:1.35;color:#a1a1aa;margin-top:5px;text-wrap:pretty}
.cc .checks{display:grid;gap:11px;max-width:600px;margin:0 auto}
.cc .checks p{font-size:14.5px;line-height:1.55;margin:0;text-wrap:pretty}
@media(max-width:420px){
.cc .outrow{gap:6px}
.cc .out{padding:10px 5px;border-radius:10px}
.cc .out b{font-size:12.5px}
.cc .out span{font-size:10.5px;margin-top:3px}
.cc .lede{font-size:16px;margin:14px auto 20px}
}
`;

const STACK_ROWS: Array<[string, string]> = [
  ["Six-week closing program", "$2,000"],
  ["Live role board & warm intros", "$3,000"],
  ["Call recording, AI scoring, verified profile", "$1,800"],
  ["The closer room", "$1,200"],
];

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
      // Ad-platform conversion signal — the funnel is the pixel's Lead
      // source now that the landing page no longer captures leads.
      void trackMetaEvent(
        "Lead",
        { product: "b2c", contentIds: [`start-funnel-${variant ?? "a"}`] },
        { email: email.trim(), phone: phone.trim(), firstName: firstName.trim() },
      );
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

  const cta = variant === "a" ? "Yes, get me access" : "Get all of it free";

  const formCard = (kick?: string) => (
    <div
      className="rounded-[20px] border bg-white"
      style={{
        maxWidth: 450,
        margin: "0 auto",
        boxShadow: "0 22px 58px rgba(9,9,11,.13)",
        borderColor: "#d4d4d8",
        padding: 26,
      }}
    >
      {kick && <p className="kick">{kick}</p>}
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
          className="w-full rounded-[10px] bg-zinc-900 px-4 text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          style={{ paddingTop: 17, paddingBottom: 17, fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}
        >
          {busy ? "One second…" : cta}
        </button>
      </form>
      {error && <p className="mt-2 text-center text-sm text-rose-600">{error}</p>}
      <p
        className="mt-3 text-center text-xs leading-relaxed text-zinc-400"
        style={{ textWrap: "pretty", maxWidth: "36ch", marginLeft: "auto", marginRight: "auto" }}
      >
        A closer from our team calls you within minutes. Keep your phone on you.
      </p>
    </div>
  );

  const valueStack = (title: string) => (
    <>
      <p className="kick">{title}</p>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {STACK_ROWS.map(([label, price]) => (
          <div
            key={label}
            style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: "1px solid #e4e4e7" }}
          >
            <span className="text-sm">{label}</span>
            <span className="text-sm" style={{ color: "#71717a", textDecoration: "line-through", whiteSpace: "nowrap" }}>
              {price}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 0", borderBottom: "2px solid #18181b" }}>
          <span className="text-sm font-semibold">What it costs elsewhere</span>
          <span className="text-sm font-semibold" style={{ textDecoration: "line-through" }}>$8,000</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "16px 0" }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Your price</span>
          <span style={{ fontSize: 17, fontWeight: 600 }} className="text-emerald-600">$0</span>
        </div>
      </div>
    </>
  );

  const bodySection = (kick: string, paras: string[], centerLone = false) => (
    <>
      <p className="kick">{kick}</p>
      <div style={{ display: "grid", gap: 15, maxWidth: "64ch", margin: "0 auto" }}>
        {paras.map((p, i) => (
          <p
            key={i}
            className="body"
            style={{
              ...(i === paras.length - 1 && paras.length > 1 ? { color: "#18181b", fontWeight: 500 } : {}),
              ...(centerLone ? { textAlign: "center" } : {}),
            }}
          >
            {p}
          </p>
        ))}
      </div>
    </>
  );

  const guarantee = (
    <div style={{ maxWidth: 620, margin: "0 auto", border: "2px solid #18181b", borderRadius: 18, padding: 24, background: "#fafafa" }}>
      <p className="kick" style={{ color: "#18181b", marginBottom: 9 }}>The guarantee</p>
      <p style={{ fontSize: 16.5, lineHeight: 1.55, fontWeight: 500, margin: 0, textWrap: "pretty", textAlign: "center" }}>
        Do the six weeks, take the call reviews, go after the roles on the board. If you
        haven&apos;t landed a commission seat, we refund every month you paid for the
        software. You keep the training either way.
      </p>
    </div>
  );

  const divider = <div className="divider" />;

  return (
    <main className="relative mx-auto max-w-[1120px] px-6 py-12 lg:py-16" style={{ paddingTop: 34 }}>
      <div aria-hidden className="absolute inset-0 -z-10" style={GROUND} />
      <style dangerouslySetInnerHTML={{ __html: CC_CSS }} />

      <div className="cc">
        <div style={{ textAlign: "center" }}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Free training · Live openings
          </div>
        </div>

        {/* ══ REPLACE: VSL embed goes here when the video exists ══ */}
        <div
          className="flex aspect-video flex-col items-center justify-center gap-2.5 rounded-xl bg-zinc-950 text-white"
          style={{ maxWidth: 660, margin: "0 auto 26px", boxShadow: "0 20px 56px rgba(9,9,11,.20)" }}
        >
          <span className="flex h-13 w-13 items-center justify-center rounded-full bg-white p-3.5">
            <Play className="h-5 w-5 fill-zinc-950 text-zinc-950" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            {variant === "a"
              ? "The whole thing explained · 90 seconds"
              : "How the whole thing works · 90 seconds"}
          </span>
        </div>

        <h1 className="text-[clamp(32px,4.6vw,54px)] font-semibold leading-[0.98] tracking-[-0.04em] text-zinc-950">
          {variant === "a" ? (
            <>
              How to land a{" "}
              <span className="num"><span className="font-serif italic font-normal">$10–20k a month</span></span>{" "}
              remote closing role — without buying a course, spamming résumés, or needing
              sales experience<span className="text-zinc-300">.</span>
            </>
          ) : (
            <>
              Make{" "}
              <span className="num"><span className="font-serif italic font-normal">$10–20k a month</span></span>{" "}
              as a remote closer. The training costs you nothing<span className="text-zinc-300">.</span>
            </>
          )}
        </h1>

        <p className="lede">
          {variant === "a"
            ? "This isn't a better way to job hunt. It's a different door. The seats that get filled by referral before anyone posts them, and an intro to the person doing the filling."
            : "The average rep makes four grand a month. The top ones make thirty. Same phone, same hours. The gap is which offer you're on and whether you can run a call."}
        </p>

        <div className="outrow">
          {[
            ["Live commission roles", "We open the door. You still have to close it."],
            ["$10–20k months", "What the seats on our board pay"],
            ["$0 for the training", "You cover the software. Nothing else."],
          ].map(([b, s]) => (
            <div key={b} className="out">
              <b>{b}</b>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {formCard()}

        {divider}

        {variant === "a" ? (
          <>
            {valueStack("Everything you get today")}
            {divider}
            {bodySection("Why the old way stopped working", [
              "Two years ago you could learn to close, put it on a CV, and get hired. That door's shut. There are more trained closers now than posted roles, so hiring managers stopped posting and started asking people they already trust.",
              "Which means skill isn't what's standing between you and the money any more. The intro is. And no course can hand you one, because none of them are in the room where the hiring happens.",
              "We're in that room. That's the whole reason this works.",
            ])}
            {divider}
            <p className="kick">Who this is for</p>
            <div className="checks">
              {[
                "You've sold something before — door to door, insurance, retail, phones — and you want the commission without the driving",
                "You're already closing and you want your numbers to come with you to a better offer",
                "You've never sold professionally, but you'll get on the phone and do the reps",
              ].map((line) => (
                <div key={line} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                  <p>{line}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {valueStack("Everything you get")}
            {divider}
            {bodySection("What's the catch", [
              "You pay for the software it all runs on. Costs about what your phone does. That's the catch, all of it, and you're hearing it now instead of on the call.",
            ], true)}
          </>
        )}

        {divider}
        {guarantee}

        <div className="sect">{formCard("Start here")}</div>
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
