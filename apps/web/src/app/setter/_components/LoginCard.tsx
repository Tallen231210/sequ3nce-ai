"use client";

// Email → 6-digit code → in. The error copy is deliberately plain: this is
// invite-only, so "no account found" beats a silent nothing.

import React, { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { setSetterToken } from "@/lib/setter/session";

export function LoginCard({ onSignedIn }: { onSignedIn: () => void }) {
  const requestCode = useAction(api.setterAuth.requestSetterCode);
  const verifyCode = useMutation(api.setterAuth.verifySetterCode);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await requestCode({ email: email.trim() });
    setBusy(false);
    if (!r.success) {
      setError(r.error ?? "Couldn't send the code.");
      return;
    }
    setStep("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await verifyCode({ email: email.trim(), code: code.trim() });
    setBusy(false);
    if (!r.success) {
      setError(r.error);
      return;
    }
    setSetterToken(r.sessionToken);
    onSignedIn();
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-lg font-semibold tracking-tight">Sequ3nce</div>
          <div className="mt-1 text-sm text-neutral-500">Setter sign-in</div>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-neutral-700">
                Work email
              </span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-[15px] outline-none transition-colors focus:border-neutral-900"
              />
            </label>
            <button
              disabled={busy}
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-3">
            <p className="text-[13px] text-neutral-500">
              We emailed a 6-digit code to <strong className="text-neutral-800">{email.trim()}</strong>.
            </p>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-center font-mono text-xl tracking-[0.5em] outline-none transition-colors focus:border-neutral-900"
            />
            <button
              disabled={busy || code.length !== 6}
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="w-full py-1 text-[13px] text-neutral-500 hover:text-neutral-900"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
