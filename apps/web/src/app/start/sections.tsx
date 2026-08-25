"use client";

import Link from "next/link";
import {
  DISCLAIMER,
  GUARANTEE,
  SCARCITY_LINE,
  SEATS_LINE,
  SHARED_FAQ,
  STACK_ROWS,
  STEPS,
  type Faq,
  type WhyTile,
} from "./copy";

// ============================================================================
// Presentational sections for the /start funnel (funnel-v6 layout).
// All styling rides the mj-* classes defined in page.tsx's CC_CSS.
// ============================================================================

/** Page CTA. data-open marks it as a modal trigger — urgency.js also uses
 *  that attribute to place seat counters above page CTAs only. */
export function Cta({ label, onOpen, scar }: { label: string; onOpen: () => void; scar?: boolean }) {
  return (
    <>
      <button type="button" className="mj-cta" data-open onClick={onOpen}>
        {label}
      </button>
      {scar && <p className="mj-scar">{SCARCITY_LINE}</p>}
    </>
  );
}

export function SeatsLine() {
  return (
    <p className="mj-rev">
      <b>{SEATS_LINE.b}</b>
      {SEATS_LINE.rest}
    </p>
  );
}

export function ValueStack() {
  return (
    <>
      <p className="kick">Everything you get</p>
      <div className="mj-stack">
        {STACK_ROWS.map(([label, price]) => (
          <div key={label} className="mj-row">
            <span>{label}</span>
            <span>{price}</span>
          </div>
        ))}
        <div className="mj-tot">
          <span>Total value</span>
          <span>$6,000</span>
        </div>
        <div className="mj-now">
          <span>Your price today</span>
          <span>FREE</span>
        </div>
      </div>
    </>
  );
}

export function WhyTiles({ kick, tiles }: { kick: string; tiles: WhyTile[] }) {
  return (
    <>
      <p className="kick">{kick}</p>
      <div className="mj-why">
        {tiles.map((t) => (
          <div key={t.h} className="mj-w">
            <h4>{t.h}</h4>
            <p>{t.p}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export function Steps() {
  return (
    <>
      <p className="kick">How it works</p>
      <div style={{ display: "grid", gap: 22 }}>
        {STEPS.map((s) => (
          <div key={s.n} className="mj-step">
            <span className="mj-badge">{s.n}</span>
            <div>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Guarantee() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
      <p className="kick">{GUARANTEE.kick}</p>
      <p style={{ fontSize: 17.5, fontWeight: 600, letterSpacing: "-.02em", margin: "0 0 10px", textWrap: "balance" }}>
        {GUARANTEE.lead}
      </p>
      <p className="body" style={{ textAlign: "center" }}>{GUARANTEE.body}</p>
    </div>
  );
}

export function FaqList({ swap }: { swap: Faq }) {
  const items: Faq[] = [SHARED_FAQ.first, swap, SHARED_FAQ.third, SHARED_FAQ.fourth];
  return (
    <>
      <p className="kick">Questions people ask</p>
      <div className="mj-faq">
        {items.map((f) => (
          <div key={f.q} className="mj-q">
            <p>{f.q}</p>
            <p>{f.a}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export function LegalFooter() {
  return (
    <div className="sect">
      <p className="mj-disc">{DISCLAIMER}</p>
      <p className="mj-legal">
        <Link href="/privacy">Privacy Policy</Link> |{" "}
        <Link href="/terms">Terms of Service</Link> |{" "}
        <Link href="/ftc-disclosure">FTC Disclosure</Link> |{" "}
        <Link href="/income-disclosure">Income Disclosure</Link>
      </p>
      <p className="mj-legal">Copyright © {new Date().getFullYear()} Sequ3nce. All rights reserved.</p>
    </div>
  );
}
