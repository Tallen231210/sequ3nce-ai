"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loginCloser,
  requestMagicLink,
  verifyMagicLink,
  pickCloserTeam,
  type LoginResult,
  type VerifyMagicLinkResult,
  type TeamChoice,
} from "@/lib/closer/client";
import { saveSession } from "@/lib/closer/session";

type Step = "email" | "code" | "password" | "pick_team";

/**
 * Closer sign-in.
 *
 * A real web page, not the desktop window in a browser: centred on the
 * viewport, sized to its content, and readable on a phone.
 *
 * The emailed code leads and the password sits underneath, matching the order
 * the desktop app already uses. Passwords are the legacy path — every closer
 * added now is code-only — but 44 of 50 existing closers still have one, so
 * removing it would strand people.
 */
function CloserLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [choices, setChoices] = useState<TeamChoice[]>([]);
  const [pickerToken, setPickerToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Both sign-in paths land here, so the two can't drift apart. */
  const complete = (result: LoginResult | VerifyMagicLinkResult): boolean => {
    if ("kind" in result && result.kind === "team_picker" && result.pickerToken) {
      setPickerToken(result.pickerToken);
      setChoices(result.choices ?? []);
      setStep("pick_team");
      return true;
    }
    if (
      result.success &&
      "closer" in result &&
      result.closer &&
      "sessionToken" in result &&
      result.sessionToken
    ) {
      saveSession(result.sessionToken, result.closer);
      router.push("/app/numbers");
      return true;
    }
    return false;
  };

  const run = async (
    fn: () => Promise<LoginResult | VerifyMagicLinkResult>,
    fallback: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!complete(result))
        setError(("error" in result ? result.error : null) ?? fallback);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // The welcome email links here with the code already attached, so clicking
  // it signs them in rather than making them retype six digits. Runs once —
  // codes are single-use, and retrying a spent one would show a failure on a
  // sign-in that actually worked.
  const autoTried = useRef(false);
  const linkEmail = params.get("email");
  const linkCode = params.get("code");
  useEffect(() => {
    if (autoTried.current || !linkEmail || !linkCode) return;
    autoTried.current = true;
    setEmail(linkEmail);
    setCode(linkCode);
    setBusy(true);
    void verifyMagicLink(linkEmail.trim().toLowerCase(), linkCode.trim())
      .then((result) => {
        if (complete(result)) return;
        // A dead link is the common case: a stale email, or a second click on
        // one already used. Send them back to the email step rather than
        // stranding them on a code box with a spent code in it — from here
        // the obvious next action, "email me a new one", is one tap away.
        setStep("email");
        setCode("");
        setError("That sign-in link has already been used or expired. Send yourself a new one below.");
      })
      .catch(() =>
        setError("Couldn't reach the server. Check your connection and try again."),
      )
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkEmail, linkCode]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await requestMagicLink(email.trim().toLowerCase());
      if (res.success) {
        setStep("code");
      } else {
        setError(res.error ?? "We couldn't send a code to that address.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo height={28} />
          <h1 className="mt-6 text-xl font-semibold tracking-tight">
            {step === "pick_team" ? "Choose your team" : "Sign in"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {step === "email" && "We'll email you a code — no password needed."}
            {step === "code" && `Enter the 6-digit code we sent to ${email}.`}
            {step === "password" && "Sign in with your existing password."}
            {step === "pick_team" &&
              "Your email is on more than one team. Which one are you signing in to?"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {step === "email" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Email me a sign-in code"}
              </Button>
            </form>
          )}

          {step === "code" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => verifyMagicLink(email.trim().toLowerCase(), code.trim()),
                  "That code isn't right, or it's expired.",
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="code">Sign-in code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
                {busy ? "Checking…" : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Use a different email
              </button>
            </form>
          )}

          {step === "password" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => loginCloser(email.trim().toLowerCase(), password),
                  "Invalid email or password.",
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email-pw">Email</Label>
                <Input
                  id="email-pw"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || !email.trim() || !password}
              >
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          )}

          {step === "pick_team" && (
            <div className="space-y-2">
              {choices.map((choice) => (
                <button
                  key={choice.closerId}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => pickCloserTeam(pickerToken, choice.closerId),
                      "That selection didn't work. Try signing in again.",
                    )
                  }
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {choice.teamName}
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-4 text-center text-xs text-rose-600">{error}</p>
          )}
        </div>

        {/* Password is the legacy way in, so it reads as the alternative. */}
        {(step === "email" || step === "password") && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {step === "email" ? (
              <>
                Been here a while?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setStep("password");
                    setError(null);
                  }}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Sign in with a password instead
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setError(null);
                }}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Email me a code instead
              </button>
            )}
          </p>
        )}
      </div>
    </main>
  );
}

export default function CloserLoginPage() {
  return (
    <Suspense fallback={null}>
      <CloserLogin />
    </Suspense>
  );
}
