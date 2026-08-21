import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";

// ============================================================================
// The /start funnel: rep-driven acquisition flow (opt-in → thanks → activate).
//
// Deliberately an island — no links in from the marketing site, no nav out,
// and noindex so search never surfaces it. Traffic arrives only by the ad /
// rep link. GHL keeps the call workflows; these pages replace its page
// builder because we can hold them to the design system and it can't.
// ============================================================================

export const metadata: Metadata = {
  title: "Sequ3nce — Free training & placement",
  robots: { index: false, follow: false },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200/60 bg-white/70 py-3.5 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2.5 px-6">
          <Logo height={22} />
          <span className="relative -top-[2px] rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white">
            PERSONAL
          </span>
        </div>
      </header>
      {children}
      <footer className="border-t border-zinc-200 py-5 text-center text-[11px] tracking-wide text-zinc-400">
        Sequ3nce &amp; Churp — the closer software stack
      </footer>
    </div>
  );
}
