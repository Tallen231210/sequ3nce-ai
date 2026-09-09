import React from "react";

// ============================================================================
// Shared primitives for the teams deck (/pitch/teams): light ground,
// turquoise accent. Everything the slides reuse lives here so the palette is
// defined once. Lucide icon paths, monochrome — no color emoji.
// ============================================================================

export const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-zinc-600 text-lg leading-relaxed max-w-[46ch]">{children}</p>
);

/** Slide title. `compact` for slides whose body needs the vertical room (pricing). */
export const H = ({ children, compact }: { children: React.ReactNode; compact?: boolean }) => (
  <h1
    className={
      "font-bold tracking-tight text-center text-zinc-900 " +
      (compact ? "text-3xl md:text-[2.1rem]" : "text-4xl md:text-5xl")
    }
  >
    {children}
  </h1>
);

export const Accent = ({ children }: { children: React.ReactNode }) => (
  <span className="text-teal-600">{children}</span>
);

export const Check = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-[13px] text-zinc-700">
    <span className="text-teal-600 mt-0.5 font-bold">&#x2713;</span>
    <span>{children}</span>
  </div>
);

export const Cross = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-[13px] text-zinc-500">
    <span className="text-zinc-400 mt-0.5">&#x2715;</span>
    <span>{children}</span>
  </div>
);

/** Card surface. Accent = the one thing on the slide that should read first. */
export const card = (accent?: boolean) =>
  "rounded-2xl border p-6 flex flex-col " +
  (accent
    ? "border-teal-500/60 bg-teal-50/70 shadow-[0_10px_30px_rgba(13,148,136,.10)]"
    : "border-zinc-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,.06)]");

export const Label = ({ children, accent }: { children: React.ReactNode; accent?: boolean }) => (
  <div className={"text-[11px] font-bold uppercase tracking-[0.2em] mb-3 " + (accent ? "text-teal-600" : "text-zinc-400")}>
    {children}
  </div>
);

const ICONS: Record<string, string> = {
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  layers: "M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5",
  chart: "M3 3v18h18M7 14l4-4 4 4 5-6",
  database: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3Zm9 3c0 1.66-4.03 3-9 3s-9-1.34-9-3m18 6c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 5v14M21 5v14",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Zm-12 0V7a5 5 0 0 1 10 0v4",
  flow: "M4 6h16M4 12h10M4 18h6m8-3 3 3-3 3",
  calendar: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm0 4h18M8 2v4m8-4v4",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h8M8 9h2",
};

export const Icon = ({ name, className = "" }: { name: keyof typeof ICONS | string; className?: string }) => (
  <svg
    className={"w-6 h-6 " + className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={ICONS[name] ?? ""} />
  </svg>
);

/** Big number with a caption, for the stat tiles. */
export const Stat = ({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) => (
  <div className={card(accent) + " items-start"}>
    <div className={"text-3xl md:text-4xl font-bold tracking-tight " + (accent ? "text-teal-600" : "text-zinc-900")}>{value}</div>
    <div className="text-zinc-500 text-[13px] mt-1.5 leading-snug">{label}</div>
  </div>
);
