import React from "react";

// ============================================================================
// Drawn visuals for the teams deck: a 90-day timeline, the "what you get"
// stack, the qualification scale, and simple bars. Plain SVG and CSS so they
// render identically everywhere and stay on-palette (turquoise on white).
// ============================================================================

const TEAL = "#0d9488";
const TEAL_SOFT = "#ccfbf1";
const INK = "#18181b";
const MUTE = "#a1a1aa";
const LINE = "#e4e4e7";

/** The 90-day arc as one bar: Build / Install / Release, day ticks, and the day-14 placement flag. */
export function ArcTimeline() {
  const W = 960;
  const x = (day: number) => 40 + (day / 90) * (W - 80);
  return (
    <svg viewBox={`0 0 ${W} 150`} className="w-full max-w-5xl" role="img" aria-label="90-day timeline">
      {/* segments */}
      {[
        { from: 0, to: 30, label: "Build", fill: "#f4f4f5", ink: INK },
        { from: 30, to: 60, label: "Install", fill: TEAL, ink: "#ffffff" },
        { from: 60, to: 90, label: "Release", fill: "#f4f4f5", ink: INK },
      ].map((s) => (
        <g key={s.label}>
          <rect x={x(s.from) + 2} y={54} width={x(s.to) - x(s.from) - 4} height={40} rx={10} fill={s.fill} stroke={s.fill === TEAL ? TEAL : LINE} />
          <text x={(x(s.from) + x(s.to)) / 2} y={80} textAnchor="middle" fontSize="16" fontWeight="700" fill={s.ink}>{s.label}</text>
        </g>
      ))}
      {/* day ticks */}
      {[1, 30, 60, 90].map((d) => (
        <g key={d}>
          <line x1={x(d)} y1={98} x2={x(d)} y2={106} stroke={MUTE} strokeWidth={1.5} />
          <text x={x(d)} y={124} textAnchor="middle" fontSize="12" fill={MUTE}>Day {d}</text>
        </g>
      ))}
      {/* day-14 placement flag */}
      <line x1={x(14)} y1={22} x2={x(14)} y2={54} stroke={TEAL} strokeWidth={2} strokeDasharray="3 3" />
      <circle cx={x(14)} cy={18} r={5} fill={TEAL} />
      <text x={x(14) + 10} y={22} fontSize="13" fontWeight="700" fill={TEAL}>Day 14 — manager placed</text>
      {/* guarantee window */}
      <text x={(x(30) + x(60)) / 2} y={144} textAnchor="middle" fontSize="12" fill={TEAL} fontWeight="600">the window the guarantee runs against</text>
    </svg>
  );
}

/** The guarantee slide's short timeline: kickoff → day 14 → day 60. */
export function GuaranteeTimeline() {
  const W = 760;
  const x = (day: number) => 60 + (day / 60) * (W - 120);
  // Day 0 and day 14 sit close together, so their captions alternate above
  // and below the line instead of colliding.
  const marks = [
    { d: 0, big: "Day 0", small: "Kickoff", above: true, anchor: "start" as const },
    { d: 14, big: "Day 14", small: "Manager placed into a finished system", above: false, anchor: "start" as const },
    { d: 60, big: "Day 60", small: "Bottom line doubled", above: false, anchor: "end" as const },
  ];
  return (
    <svg viewBox={`0 0 ${W} 130`} className="w-full max-w-3xl" role="img" aria-label="Guarantee timeline">
      <line x1={x(0)} y1={60} x2={x(60)} y2={60} stroke={LINE} strokeWidth={6} strokeLinecap="round" />
      <line x1={x(0)} y1={60} x2={x(14)} y2={60} stroke={TEAL} strokeWidth={6} strokeLinecap="round" />
      {marks.map((m, i) => {
        const yBig = m.above ? 24 : 94;
        const ySmall = m.above ? 42 : 114;
        return (
          <g key={m.d}>
            <circle cx={x(m.d)} cy={60} r={i === 2 ? 11 : 8} fill={i === 2 ? TEAL : "#ffffff"} stroke={TEAL} strokeWidth={3} />
            <text x={x(m.d)} y={yBig} textAnchor={m.anchor} fontSize="15" fontWeight="700" fill={INK}>{m.big}</text>
            <text x={x(m.d)} y={ySmall} textAnchor={m.anchor} fontSize="12" fill={MUTE}>{m.small}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** What a client actually receives, drawn as layers with the manager on top. */
export function OperationStack() {
  const layers = [
    { name: "A sales manager", sub: "placed in 14 days", top: true },
    { name: "Sequ3nce", sub: "the software they run the team on" },
    { name: "CRM & process architecture", sub: "pipeline, cadences, scripts, onboarding" },
    { name: "90 days of management", sub: "we manage the manager against KPI" },
  ];
  return (
    <div className="w-full space-y-2">
      {layers.map((l, i) => (
        <div
          key={l.name}
          className={
            "rounded-xl border px-4 py-3 flex items-baseline justify-between gap-3 " +
            (l.top ? "border-teal-500 bg-teal-600 text-white" : "border-zinc-200 bg-white text-zinc-900")
          }
          style={{ marginLeft: i * 10, marginRight: i * 10 }}
        >
          <span className="font-bold text-[15px]">{l.name}</span>
          <span className={"text-[12px] " + (l.top ? "text-teal-100" : "text-zinc-500")}>{l.sub}</span>
        </div>
      ))}
    </div>
  );
}

/** A single résumé, for the recruiter side of the contrast. */
export function ResumeCard() {
  return (
    <div className="mx-auto w-40 rounded-lg border border-zinc-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,.06)]">
      <div className="h-2 w-16 rounded bg-zinc-800 mb-3" />
      {[24, 20, 22, 14, 20, 18].map((w, i) => (
        <div key={i} className="h-1.5 rounded bg-zinc-200 mb-2" style={{ width: `${w * 4}%` }} />
      ))}
    </div>
  );
}

/** Monthly cash collected as a scale, with the qualification floor marked. */
export function FloorScale() {
  const W = 760;
  const x = (k: number) => 40 + (k / 250) * (W - 80);
  return (
    <svg viewBox={`0 0 ${W} 96`} className="w-full max-w-3xl" role="img" aria-label="Qualification floor">
      <rect x={x(0)} y={36} width={x(100) - x(0)} height={14} rx={7} fill="#f4f4f5" />
      <rect x={x(100)} y={36} width={x(250) - x(100)} height={14} rx={7} fill={TEAL_SOFT} />
      {[0, 50, 100, 150, 200, 250].map((k) => (
        <text key={k} x={x(k)} y={74} textAnchor="middle" fontSize="12" fill={MUTE}>{k === 0 ? "$0" : `$${k}k`}</text>
      ))}
      <line x1={x(100)} y1={22} x2={x(100)} y2={58} stroke={TEAL} strokeWidth={3} />
      <text x={x(100) + 10} y={20} fontSize="13" fontWeight="700" fill={TEAL}>$100k/mo — qualification floor</text>
      <text x={x(175)} y={92} textAnchor="middle" fontSize="12" fontWeight="600" fill={TEAL}>best fit</text>
      <text x={x(50)} y={92} textAnchor="middle" fontSize="12" fill={MUTE}>poor fit</text>
    </svg>
  );
}

/** Horizontal bars for the first-year totals. */
export function TotalsBars({ rows }: { rows: { label: string; value: number; accent?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="w-full space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-44 shrink-0 text-[12px] text-zinc-500 text-right">{r.label}</div>
          <div className="flex-1 h-6 rounded-md bg-zinc-100 overflow-hidden">
            <div
              className={"h-full rounded-md " + (r.accent ? "bg-teal-500" : "bg-zinc-400")}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <div className="w-24 shrink-0 text-[14px] font-bold tabular-nums text-zinc-900">${r.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

/** The sales load under Option B as one stacked bar. */
export function LoadBar() {
  return (
    <div className="w-full">
      <div className="flex h-12 w-full overflow-hidden rounded-xl border border-zinc-200">
        <div className="flex items-center justify-center bg-teal-600 text-white text-[14px] font-bold" style={{ width: "41.6%" }}>5% Sequ3nce</div>
        <div className="flex items-center justify-center bg-teal-400 text-white text-[14px] font-bold" style={{ width: "58.4%" }}>7% manager</div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px] text-zinc-500">
        <span>12% of cash collected, as one number</span>
        <span className="font-semibold text-zinc-700">+ $3,000/mo manager base</span>
      </div>
    </div>
  );
}
