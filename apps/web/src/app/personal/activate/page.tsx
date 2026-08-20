"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { CheckCircle2, Download, Loader2, Mail } from "lucide-react";

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
  const fromCheckout = !!params.get("checkout_id") && !code;

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
          "flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-5 py-4 text-sm font-semibold " +
          (dmg ? "hover:border-zinc-400" : "pointer-events-none opacity-40")
        }
      >
        <Download className="h-4 w-4" /> Download for Mac
      </a>
      <a
        href={dl(exe)}
        className={
          "flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-5 py-4 text-sm font-semibold " +
          (exe ? "hover:border-zinc-400" : "pointer-events-none opacity-40")
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
        <Mail className="mx-auto h-10 w-10 text-zinc-400" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Payment received — you&apos;re in.
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
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          You&apos;re all set.
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
        <h1 className="text-2xl font-bold tracking-tight">
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
      <h1 className="text-2xl font-bold tracking-tight">Set your password</h1>
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
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
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
      <header className="border-b border-zinc-100 py-5 text-center">
        <span className="text-lg font-bold tracking-tight">SEQU3NCE</span>
        <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
          PERSONAL
        </span>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 text-center">
        {children}
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
