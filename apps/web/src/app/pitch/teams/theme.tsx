import React from "react";

// ============================================================================
// Primitives for the teams deck (/pitch/teams) in its "Blueprint × Dashboard"
// system: the slide is a window on an app-grey ground, the canvas is grid
// paper, and everything on it is drawn like an engineering drawing — Archivo
// for display, IBM Plex Mono for labels, teal as ink. Chosen by Tyler from the
// seven-direction mock-up on 2026-09-09 (the Swiss direction is kept in
// docs/design/teams-deck-directions.html in case we go back to it).
// ============================================================================

export const INK = "#0b1f1d";
export const TEAL = "#0d9488";
export const TEAL_DARK = "#0f766e";
export const GRID = "#e2efec";
export const MUTE = "#4b5a58";
export const APP_GREY = "#f3f5f6";

export const MONO_FONT = "var(--font-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace";
export const DISPLAY_FONT = "var(--font-archivo), system-ui, -apple-system, sans-serif";

/** Drawing label: mono, tracked, uppercase by default, teal by default. */
export const Mono = ({
  children,
  className = "",
  ink,
  caps = true,
}: {
  children: React.ReactNode;
  className?: string;
  ink?: boolean;
  caps?: boolean;
}) => (
  <div
    className={`text-[11px] ${caps ? "uppercase tracking-[0.14em]" : "tracking-[0.04em]"} ${ink ? "text-[#4b5a58]" : "text-[#0f766e]"} ${className}`}
    style={{ fontFamily: MONO_FONT }}
  >
    {children}
  </div>
);

const H_SIZES = {
  xl: "text-5xl md:text-[4.4rem]",
  lg: "text-4xl md:text-[3.4rem]",
  md: "text-3xl md:text-[2.6rem]",
  sm: "text-2xl md:text-[2.05rem]",
} as const;

/** Slide title. Archivo extra-bold, tight, left-aligned like a drawing title block. */
export const H = ({ children, size = "lg", className = "" }: { children: React.ReactNode; size?: keyof typeof H_SIZES; className?: string }) => (
  <h1 className={`${H_SIZES[size]} font-extrabold tracking-[-0.03em] leading-[0.98] text-[#0b1f1d] ${className}`} style={{ fontFamily: DISPLAY_FONT }}>
    {children}
  </h1>
);

export const Accent = ({ children }: { children: React.ReactNode }) => <span className="text-[#0d9488]">{children}</span>;

export const P = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[15px] md:text-[16px] leading-relaxed text-[#2f3d3b] max-w-[48ch] ${className}`}>{children}</p>
);

/** Spec sheet: a white panel on the grid with teal corner brackets. */
export const Spec = ({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: boolean }) => (
  <div className={`relative bg-white border ${accent ? "border-[#0d9488]" : "border-[#b9d6d1]"} p-5 md:p-6 ${className}`}>
    <span aria-hidden className="absolute -left-[2px] -top-[2px] w-3.5 h-3.5 border-l-2 border-t-2 border-[#0d9488]" />
    <span aria-hidden className="absolute -right-[2px] -bottom-[2px] w-3.5 h-3.5 border-r-2 border-b-2 border-[#0d9488]" />
    {children}
  </div>
);

/** A drawn component in a schematic: bold name, mono sub-label. */
export const Box = ({ name, sub, accent, className = "" }: { name: string; sub?: string; accent?: boolean; className?: string }) => (
  <div
    className={`bg-white border-2 px-3.5 py-2.5 font-bold text-[14px] leading-tight ${accent ? "border-[#0d9488] text-[#0d9488]" : "border-[#0b1f1d] text-[#0b1f1d]"} ${className}`}
    style={{ fontFamily: DISPLAY_FONT }}
  >
    {name}
    {sub && (
      <span className="block font-normal text-[10px] text-[#4b5a58] tracking-[0.06em] mt-1" style={{ fontFamily: MONO_FONT }}>
        {sub}
      </span>
    )}
  </div>
);

/** The wire between two boxes. */
export const Wire = ({ vertical }: { vertical?: boolean }) =>
  vertical ? <div className="w-[2px] h-4 bg-[#0b1f1d] ml-6" /> : <div className="flex-1 min-w-[14px] h-[2px] bg-[#0b1f1d]" />;

/** Dimension line: end ticks and a mono label beneath. */
export const Dim = ({ label, className = "", ink }: { label?: React.ReactNode; className?: string; ink?: boolean }) => (
  <div className={className}>
    <div className={`relative h-[2px] ${ink ? "bg-[#0b1f1d]" : "bg-[#0d9488]"}`}>
      <span className="absolute left-0 -top-[5px] w-[2px] h-3 bg-inherit" />
      <span className="absolute right-0 -top-[5px] w-[2px] h-3 bg-inherit" />
    </div>
    {label && <Mono className="mt-2">{label}</Mono>}
  </div>
);

/** Spec-sheet line: label ······ value. */
export const Line = ({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) => (
  <div className={`flex items-baseline gap-2 py-[7px] text-[13px] ${accent ? "text-[#0d9488]" : "text-[#0b1f1d]"}`} style={{ fontFamily: MONO_FONT }}>
    <span>
      {label}
      {sub && <span className="block text-[10.5px] text-[#4b5a58] mt-0.5">{sub}</span>}
    </span>
    <span className="flex-1 border-b border-dotted border-[#7fb3ab] -translate-y-1 min-w-[16px]" />
    <b className="font-semibold whitespace-nowrap">{value}</b>
  </div>
);

/** Dashed call-out note. */
export const Note = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`border-[1.5px] border-dashed border-[#0d9488] bg-white/90 px-3 py-2.5 text-[13px] leading-snug text-[#0b1f1d] ${className}`}>{children}</div>
);

export const Check = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-[13px] leading-snug text-[#2f3d3b]">
    <span className="text-[#0d9488] mt-px font-bold">&#x2713;</span>
    <span>{children}</span>
  </div>
);

export const Cross = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-[13px] leading-snug text-[#4b5a58]">
    <span className="text-[#9db8b3] mt-px">&#x2715;</span>
    <span>{children}</span>
  </div>
);

/** Big figure with a mono caption, on a spec sheet. */
export const Stat = ({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) => (
  <Spec accent={accent}>
    <div className={`text-3xl md:text-[2.6rem] font-extrabold tracking-[-0.03em] leading-none ${accent ? "text-[#0d9488]" : "text-[#0b1f1d]"}`} style={{ fontFamily: DISPLAY_FONT }}>
      {value}
    </div>
    <Mono ink caps={false} className="mt-3 text-[11.5px] leading-snug">
      {label}
    </Mono>
  </Spec>
);

const ICONS: Record<string, string> = {
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  layers: "M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5",
  chart: "M3 3v18h18M7 14l4-4 4 4 5-6",
  database: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3Zm9 3c0 1.66-4.03 3-9 3s-9-1.34-9-3m18 6c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 5v14M21 5v14",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Zm-12 0V7a5 5 0 0 1 10 0v4",
  flow: "M4 6h16M4 12h10M4 18h6m8-3 3 3-3 3",
  calendar: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm0 4h18M8 2v4m8-4v4",
};

export const Icon = ({ name, className = "" }: { name: keyof typeof ICONS | string; className?: string }) => (
  <svg className={`w-6 h-6 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name] ?? ""} />
  </svg>
);
