"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LeadCaptureModalProps {
  onClose: () => void;
  source: string;      // which button triggered this: "hero", "nav", "pricing", "cta"
  refParam?: string;   // ?ref= value from affiliate link, if present
}

export function LeadCaptureModal({ onClose, source, refParam }: LeadCaptureModalProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on ESC
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
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
      // 1. Fire Refgrow attribution — links this email to the affiliate cookie
      if (typeof window !== "undefined" && (window as any).Refgrow) {
        try {
          (window as any).Refgrow(0, "signup", trimmedEmail);
        } catch (refgrowErr) {
          // Don't block the flow if Refgrow fails
          console.error("[LeadCapture] Refgrow call failed:", refgrowErr);
        }
      }

      // 2. Save lead to Convex
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
        throw new Error((body as any).error || "Failed to save. Please try again.");
      }

      // 3. Redirect to download page
      router.push("/personal/download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }, [firstName, lastName, email, phone, source, refParam, router]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[420px] max-w-[92vw] bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">
            Get Sequ3nce Personal
          </h2>
          <p className="text-[14px] text-zinc-500 mt-1.5 leading-relaxed">
            Enter your info below and we&apos;ll take you straight to the download.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pt-4 pb-8">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-zinc-700 mb-1">
                  First name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  required
                  autoFocus
                  autoComplete="given-name"
                  className="w-full px-3.5 py-2.5 text-[14px] bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-zinc-700 mb-1">
                  Last name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  required
                  autoComplete="family-name"
                  className="w-full px-3.5 py-2.5 text-[14px] bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-zinc-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 text-[14px] bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-zinc-700 mb-1">
                Phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                required
                autoComplete="tel"
                className="w-full px-3.5 py-2.5 text-[14px] bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-[13px] text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-5 py-3 text-[15px] font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Loading...
              </span>
            ) : (
              "Continue to Download"
            )}
          </button>

          <p className="mt-3 text-[11px] text-zinc-400 text-center">
            We&apos;ll never spam you. Your info is used to set up your account.
          </p>
        </form>
      </div>
    </div>
  );
}
