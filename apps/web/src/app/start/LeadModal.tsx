"use client";

import { useEffect, useRef, useState } from "react";
import { MODAL } from "./copy";

// ============================================================================
// The one lead form on the page, shown as a modal from every CTA.
// Fields: first name, email, mobile. Email isn't in the co-founder's mock but
// stays by explicit decision — the lead pipeline and GHL key on it.
// The consent checkbox is required; the SMS fine print rides below the button.
// ============================================================================

type Props = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  error: string | null;
  onSubmit: (fields: { firstName: string; email: string; phone: string }) => void;
};

export function LeadModal({ open, onClose, busy, error, onSubmit }: Props) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstInput.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // The page behind the modal shouldn't scroll while it's up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!firstName.trim() || !email.trim() || !phone.trim()) {
      setLocalError("All three fields — that's how we call you.");
      return;
    }
    // Instant sanity checks — the server enforces the real gate (including a
    // live is-this-email-deliverable lookup); these just catch typos early.
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15 || /^(\d)\1+$/.test(phoneDigits)) {
      setLocalError("That mobile number doesn't look complete — we need it to reach you.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setLocalError("That email doesn't look right — double-check it.");
      return;
    }
    if (!consent) {
      setLocalError("Tick the box so we know you know the deal.");
      return;
    }
    onSubmit({ firstName: firstName.trim(), email: email.trim(), phone: phone.trim() });
  }

  const shownError = localError ?? error;

  return (
    <div
      className="mj-modal on"
      role="dialog"
      aria-modal="true"
      aria-label={MODAL.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mj-box">
        <button type="button" className="mj-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h3>{MODAL.title}</h3>
        <p className="sb">{MODAL.sub}</p>
        <form onSubmit={handleSubmit}>
          <input
            ref={firstInput}
            className="mj-in"
            placeholder="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            className="mj-in"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="mj-in"
            type="tel"
            placeholder="Mobile number"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="mj-chk">
            <input
              type="checkbox"
              id="mj-consent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <label htmlFor="mj-consent">{MODAL.consent}</label>
          </div>
          <button
            type="submit"
            className="mj-cta"
            style={{
              maxWidth: "none",
              boxShadow: "none",
              // Dead until consent — a button that LOOKS unclickable beats a
              // rejection message after the click (two founder tests were
              // lost to the quiet version of this gate).
              opacity: consent ? 1 : 0.35,
              cursor: consent ? "pointer" : "not-allowed",
            }}
            disabled={busy || !consent}
            title={consent ? undefined : "Tick the box above first"}
          >
            {busy ? "One second…" : MODAL.submit}
          </button>
        </form>
        {shownError && (
          <p style={{ marginTop: 10, textAlign: "center", fontSize: 13.5, color: "#e11d48" }}>{shownError}</p>
        )}
        <p className="mj-fine">{MODAL.fine}</p>
      </div>
    </div>
  );
}
