"use client";

import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { trackMetaEvent } from "@/lib/meta-pixel";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// The page after the money: set your password, download the app.
//
// Two ways to arrive:
//   1. From the welcome email → ?email=…&code=… → set-password form.
//   2. From Polar's post-checkout redirect → ?checkout_id=… (no code) →
//      "check your inbox" — the code only travels by email, so possession of
//      this URL alone can never take over the account that just paid.
//
// Setting the first password IS a password reset from the machine's point of
// view — same mutation, same hashed one-time code.
// ============================================================================

type Release = {
  tag_name: string;
  assets: Array<{ name: string }>;
} | null;

function ActivateInner() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const code = params.get("code") ?? "";
  const checkoutId = params.get("checkout_id");
  const fromCheckout = !!checkoutId && !code;

  // The purchase conversion. Payment happens on Polar's domain where our
  // pixel can't run, so the buyer's return HERE is the signal. The amount
  // and plan come from a server-side checkout lookup (succeeded-only), and
  // a localStorage guard keyed by checkout id keeps a refresh from firing
  // the event twice.
  useEffect(() => {
    if (!checkoutId) return;
    const guard = `meta-sub-${checkoutId}`;
    try {
      if (localStorage.getItem(guard)) return;
    } catch {
      /* storage unavailable — fire anyway */
    }
    fetch(`/api/polar/checkout-info?id=${encodeURIComponent(checkoutId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.paid) return;
        void trackMetaEvent("Subscribe", {
          product: "b2c",
          value: (d.amountCents ?? 0) / 100,
          currency: "USD",
          contentIds: d.plan ? [d.plan] : undefined,
        });
        try {
          localStorage.setItem(guard, "1");
        } catch {
          /* best effort */
        }
      })
      .catch(() => {});
  }, [checkoutId]);

  const resetPassword = useMutation(api.b2cAuth.resetPassword);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Download assets, shown after the password is set (and on the
  // check-your-inbox state, since they'll come back to this page).
  const [release, setRelease] = useState<Release>(null);
  useEffect(() => {
    fetch("/api/releases/personal")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRelease(d?.electron ?? null))
      .catch(() => {});
  }, []);

  const dmg = release?.assets.find((a) => a.name.endsWith(".dmg"));
  const exe = release?.assets.find(
    (a) => a.name.endsWith(".exe") && !a.name.includes("nupkg"),
  );
  const dl = (asset?: { name: string }) =>
    asset && release
      ? `/api/releases/download?asset=${encodeURIComponent(asset.name)}&release=${release.tag_name}`
      : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res: any = await resetPassword({ email, code, newPassword: password });
      if (res?.success) {
        setDone(true);
      } else {
        setError(
          (res?.error ?? "That didn't work.") +
            " If the link expired, use “Forgot password” in the app — it does the same thing.",
        );
      }
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  const downloads = (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <a
        href={dl(dmg)}
        className={
          "flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-4 text-sm font-semibold text-white transition-colors " +
          (dmg ? "hover:bg-zinc-800" : "pointer-events-none opacity-40")
        }
      >
        <Download className="h-4 w-4" /> Download for Mac
      </a>
      <a
        href={dl(exe)}
        className={
          "flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm font-semibold transition-colors " +
          (exe ? "hover:border-zinc-900" : "pointer-events-none opacity-40")
        }
      >
        <Download className="h-4 w-4" /> Download for Windows
      </a>
    </div>
  );

  // ---- State: arrived from checkout, code lives in their inbox ----
  if (fromCheckout) {
    return (
      <Shell>
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-[12px] font-medium text-zinc-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Your account is live
        </div>
        <h1 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-[-0.04em] leading-[0.95] text-zinc-950">
          Payment received — you&apos;re{" "}
          <span className="font-serif italic font-normal">in</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-zinc-600">
          We just emailed you a link to set your password (it can take a
          minute to arrive — check spam too). Set it, then come back here for
          the download.
        </p>
        {downloads}
        <p className="mt-6 text-sm text-zinc-400">
          No email after a few minutes? Open the app and tap
          &ldquo;Forgot password&rdquo; — it sends a fresh code to the email
          you paid with.
        </p>
      </Shell>
    );
  }

  // ---- State: password set, go download ----
  if (done) {
    return (
      <Shell>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h1 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-[-0.04em] leading-[0.95] text-zinc-950">
          You&apos;re all{" "}
          <span className="font-serif italic font-normal">set</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-zinc-600">
          Download the app and sign in with <strong>{email}</strong> and your
          new password.
        </p>
        {downloads}
      </Shell>
    );
  }

  // ---- State: bad link ----
  if (!email || !code) {
    return (
      <Shell>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950">
          This link is incomplete
        </h1>
        <p className="mx-auto mt-3 max-w-md text-zinc-600">
          Use the button in your welcome email, or tap &ldquo;Forgot
          password&rdquo; in the app to get a fresh link.
        </p>
      </Shell>
    );
  }

  // ---- State: the set-password form ----
  return (
    <Shell>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.04em] leading-[0.95] text-zinc-950">
        Set your{" "}
        <span className="font-serif italic font-normal">password</span>
        <span className="text-zinc-300">.</span>
      </h1>
      <p className="mt-2 text-zinc-600">
        For <strong>{email}</strong> — then you&apos;ll download the app.
      </p>
      <form onSubmit={onSubmit} className="mx-auto mt-6 max-w-sm space-y-3 text-left">
        <input
          type="password"
          placeholder="New password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-500"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Set password & continue"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <header className="border-b border-zinc-200/60 bg-white/70 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2.5 px-6">
          <Logo href="/personal" height={22} />
          <span className="relative -top-[2px] rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white">
            PERSONAL
          </span>
        </div>
      </header>
      <main className="relative flex w-full flex-1 items-start justify-center px-6 py-16 sm:py-20">
        {/* The landing page's ground: faint dot grid under a radial fade. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 35%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 35%, black 30%, transparent 80%)",
          }}
        />
        <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 sm:p-10 text-center shadow-lg shadow-zinc-200/40">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      }
    >
      <ActivateInner />
    </Suspense>
  );
}
