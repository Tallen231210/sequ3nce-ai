"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { trackMetaEvent } from "@/lib/meta-pixel";

const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InlineLeadFormProps {
  source: string;
  refParam?: string;
  variant?: "hero" | "cta";
}

/**
 * Inline lead-capture form — replaces the modal that previously gated the
 * download CTA. Keeps the same 4 fields the existing flow uses (firstName,
 * lastName, email, phone) and posts to the same Convex endpoint so GHL
 * sync + Meta Pixel + Refgrow attribution all continue to work unchanged.
 *
 * Submit flow:
 *   1. Refgrow attribution (affiliate cookie → email link)
 *   2. POST /b2c/leads → b2cLeads insert → scheduled GHL sync
 *   3. Meta Pixel Lead event (browser + CAPI dedup)
 *   4. Redirect to /personal/download
 */
export function InlineLeadForm({
  source,
  refParam,
  variant = "hero",
}: InlineLeadFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPhone = phone.trim();

      if (!trimmedFirst) {
        setError("Please enter your first name.");
        return;
      }
      if (!trimmedLast) {
        setError("Please enter your last name.");
        return;
      }
      if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!trimmedPhone || trimmedPhone.length < 7) {
        setError("Please enter a valid phone number.");
        return;
      }

      setIsSubmitting(true);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof window !== "undefined" && (window as any).Refgrow) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).Refgrow(0, "signup", trimmedEmail);
          } catch (refgrowErr) {
            console.error("[InlineLeadForm] Refgrow call failed:", refgrowErr);
          }
        }

        const res = await fetch(`${CONVEX_SITE_URL}/b2c/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: trimmedFirst,
            lastName: trimmedLast,
            email: trimmedEmail,
            phone: trimmedPhone,
            source,
            refParam: refParam || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          throw new Error((body as any).error || "Failed to save. Please try again.");
        }

        void trackMetaEvent(
          "Lead",
          { product: "b2c" },
          {
            email: trimmedEmail,
            phone: trimmedPhone,
            firstName: trimmedFirst,
            lastName: trimmedLast,
          },
        );

        router.push("/personal/download");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong. Please try again.",
        );
        setIsSubmitting(false);
      }
    },
    [firstName, lastName, email, phone, source, refParam, router],
  );

  const isHero = variant === "hero";
  const inputBase =
    "w-full px-4 py-3 text-base bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors";

  return (
    <form
      id={isHero ? "lead-form" : undefined}
      onSubmit={handleSubmit}
      className="w-full max-w-md mx-auto"
    >
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          required
          autoComplete="given-name"
          inputMode="text"
          className={inputBase}
        />
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          required
          autoComplete="family-name"
          inputMode="text"
          className={inputBase}
        />
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        required
        autoComplete="email"
        inputMode="email"
        className={`${inputBase} mb-3`}
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number"
        required
        autoComplete="tel"
        inputMode="tel"
        className={`${inputBase} mb-4`}
      />

      {error && <p className="mb-3 text-sm text-red-600 text-center">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl text-[15px] transition-colors"
      >
        {isSubmitting ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending your download link...
          </>
        ) : (
          <>
            Send My Download Link
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </>
        )}
      </button>

      <p className="mt-3 text-[12px] text-zinc-500 text-center leading-relaxed">
        First 100 users lock in $99/mo for life + the top affiliate tier. No card
        required. Cancel anytime. Works on Mac &amp; Windows.
      </p>

      <div className="mt-5 flex flex-col items-center gap-1.5">
        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
          <span aria-hidden>🔒</span>
          Private by default. Prospects can&apos;t hear you.
        </p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
          Works with Zoom · Google Meet · Microsoft Teams
        </p>
      </div>
    </form>
  );
}
