"use client";

// ============================================================================
// The dashboard's one "read this before you read the numbers" card.
//
// Monochrome on purpose. The app has a black-and-white design system and no
// dark theme, so amber panels sat outside it — and any `dark:` variant on one
// fires off the READER'S operating system while the page stays white, which
// is how a warning ends up brown text on a yellow block. Weight, an icon and
// position carry the emphasis instead of hue.
// ============================================================================

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Notice({
  icon: Icon,
  title,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  /** Meter, links, chips — anything that sits under the sentence. */
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-5">
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {children && <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</div>}
          {footer}
        </div>
      </div>
    </div>
  );
}

/** A filled bar for "x of y done" — the number the notice is asking them to move. */
export function NoticeMeter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="mt-3.5 max-w-sm">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value.toLocaleString("en-US")} of {max.toLocaleString("en-US")}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/25">
        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(pct, 1.5)}%` }} />
      </div>
    </div>
  );
}

/** The one-line version: a sentence with an icon, no card inside a card. */
export function NoticeLine({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
