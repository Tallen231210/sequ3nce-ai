import React from "react";
import { Box, Dim, INK, MONO_FONT, MUTE, Mono, TEAL, TEAL_DARK, Wire } from "./theme";

// ============================================================================
// Drawings for the teams deck, in the blueprint style: boxes and wires,
// measurement lines with ticks, mono dimension labels. SVG where a scale is
// involved, plain HTML where boxes are enough.
// ============================================================================

const DISPLAY = "var(--font-archivo), system-ui, sans-serif";

/** Cover: the operation as a chain of components, with the placement dimension. */
export function OperationChain() {
  return (
    <div className="w-full">
      <div className="flex items-center">
        <Box accent name="Sales manager" sub="placed day 14" />
        <Wire />
        <Box name="Sequ3nce" sub="system of record" />
        <Wire />
        <Box name="CRM & pipeline" sub="stages · fields · automations" />
        <Wire />
        <Box name="Cadences & scripts" sub="setter + closer motion" />
      </div>
      <Dim className="mt-6 w-[46%]" label="0 → 14 days · placement" />
    </div>
  );
}

/** What a client receives, drawn as a stack of components wired together. */
export function OperationStack() {
  const parts = [
    { name: "A sales manager", sub: "placed in 14 days", accent: true },
    { name: "Sequ3nce", sub: "the software they run the team on" },
    { name: "CRM & process architecture", sub: "pipeline, cadences, scripts, onboarding" },
    { name: "90 days of management", sub: "we manage the manager against KPI" },
  ];
  return (
    <div className="w-full">
      {parts.map((p, i) => (
        <React.Fragment key={p.name}>
          {i > 0 && <Wire vertical />}
          <Box name={p.name} sub={p.sub} accent={p.accent} />
        </React.Fragment>
      ))}
    </div>
  );
}

/** One résumé, drawn as a dashed sheet. */
export function ResumeSheet() {
  return (
    <div className="mx-auto w-40">
      <div className="border-[1.5px] border-dashed border-[#9db8b3] bg-white p-4">
        <div className="h-2 w-16 bg-[#0b1f1d] mb-3" />
        {[24, 20, 22, 14, 20, 18].map((w, i) => (
          <div key={i} className="h-1.5 bg-[#d9e6e3] mb-2" style={{ width: `${w * 4}%` }} />
        ))}
      </div>
      <Mono ink className="mt-2 text-center">1 × résumé</Mono>
    </div>
  );
}

/** Monthly cash collected as a measurement line, with the qualification floor marked. */
export function FloorScale() {
  const W = 960;
  const x = (k: number) => 40 + (k / 250) * (W - 80);
  return (
    <svg viewBox={`0 0 ${W} 104`} className="w-full max-w-4xl" role="img" aria-label="Qualification floor">
      <line x1={x(0)} y1={56} x2={x(250)} y2={56} stroke={INK} strokeWidth={2} />
      <rect x={x(100)} y={46} width={x(250) - x(100)} height={10} fill={TEAL} opacity={0.18} />
      {[0, 50, 100, 150, 200, 250].map((k) => (
        <g key={k}>
          <line x1={x(k)} y1={50} x2={x(k)} y2={62} stroke={INK} strokeWidth={2} />
          <text x={x(k)} y={84} textAnchor="middle" fontSize="11" fill={MUTE} fontFamily={MONO_FONT} letterSpacing="1">
            {k === 0 ? "$0" : `$${k}K`}
          </text>
        </g>
      ))}
      <line x1={x(100)} y1={18} x2={x(100)} y2={56} stroke={TEAL} strokeWidth={2} strokeDasharray="3 3" />
      <text x={x(100) + 10} y={22} fontSize="11" fontWeight="600" fill={TEAL_DARK} fontFamily={MONO_FONT} letterSpacing="1.5">
        $100K/MO · QUALIFICATION FLOOR
      </text>
      <text x={x(50)} y={100} textAnchor="middle" fontSize="11" fill={MUTE} fontFamily={MONO_FONT} letterSpacing="1.5">POOR FIT</text>
      <text x={x(175)} y={100} textAnchor="middle" fontSize="11" fontWeight="600" fill={TEAL_DARK} fontFamily={MONO_FONT} letterSpacing="1.5">BEST FIT</text>
    </svg>
  );
}

/** The guarantee as a measurement line: kickoff, day 14, day 60. */
export function GuaranteeLine() {
  const day14 = `${(14 / 60) * 100}%`;
  return (
    <div className="w-full max-w-4xl">
      <div className="relative h-[2px] bg-[#0b1f1d]">
        <div className="absolute left-0 top-0 h-[2px] bg-[#0d9488]" style={{ width: day14 }} />
        <span className="absolute left-0 -top-[9px] w-[2px] h-5 bg-[#0b1f1d]" />
        <span className="absolute -top-[9px] w-[2px] h-5 bg-[#0d9488]" style={{ left: day14 }} />
        <span className="absolute right-0 -top-[9px] w-[2px] h-5 bg-[#0b1f1d]" />
      </div>
      <div className="relative h-5 mt-3">
        <Mono className="absolute left-0">0d · Kickoff</Mono>
        <div className="absolute" style={{ left: day14 }}>
          <Mono>14d · Manager placed</Mono>
        </div>
        <Mono className="absolute right-0">60d · Bottom line ×2</Mono>
      </div>
    </div>
  );
}

/** The 90-day arc drawn as three segments on a measured line. */
export function ArcDrawing() {
  const W = 1100;
  const x = (day: number) => 40 + (day / 90) * (W - 80);
  const segs = [
    { from: 0, to: 30, label: "BUILD", teal: false },
    { from: 30, to: 60, label: "INSTALL", teal: true },
    { from: 60, to: 90, label: "RELEASE", teal: false },
  ];
  return (
    <svg viewBox={`0 0 ${W} 150`} className="w-full max-w-6xl" role="img" aria-label="90-day timeline">
      {segs.map((s) => (
        <g key={s.label}>
          <rect x={x(s.from) + 3} y={52} width={x(s.to) - x(s.from) - 6} height={40} fill={s.teal ? TEAL : "#ffffff"} stroke={s.teal ? TEAL : INK} strokeWidth={2} />
          <text x={(x(s.from) + x(s.to)) / 2} y={78} textAnchor="middle" fontSize="15" fontWeight="800" fill={s.teal ? "#ffffff" : INK} fontFamily={DISPLAY} letterSpacing="1">
            {s.label}
          </text>
        </g>
      ))}
      <line x1={x(0)} y1={106} x2={x(90)} y2={106} stroke={INK} strokeWidth={2} />
      {[1, 30, 60, 90].map((d) => (
        <g key={d}>
          <line x1={x(d)} y1={100} x2={x(d)} y2={112} stroke={INK} strokeWidth={2} />
          <text x={x(d)} y={132} textAnchor="middle" fontSize="11" fill={MUTE} fontFamily={MONO_FONT} letterSpacing="1">{`DAY ${d}`}</text>
        </g>
      ))}
      <line x1={x(14)} y1={18} x2={x(14)} y2={52} stroke={TEAL} strokeWidth={2} strokeDasharray="3 3" />
      <text x={x(14) + 10} y={22} fontSize="11" fontWeight="600" fill={TEAL_DARK} fontFamily={MONO_FONT} letterSpacing="1.5">DAY 14 · MANAGER PLACED</text>
      <text x={(x(30) + x(60)) / 2} y={148} textAnchor="middle" fontSize="11" fontWeight="600" fill={TEAL_DARK} fontFamily={MONO_FONT} letterSpacing="1.5">
        THE WINDOW THE GUARANTEE RUNS AGAINST
      </text>
    </svg>
  );
}

/** Where the money goes: the manager's share and ours, drawn as one dimensioned bar. */
export function LoadBar() {
  return (
    <div className="w-full">
      <Dim ink label="Option B · 12–15% of cash collected, as one number" className="mb-3" />
      <div className="flex h-12 w-full border-2 border-[#0b1f1d]" style={{ fontFamily: MONO_FONT }}>
        <div className="flex items-center justify-center bg-[#0d9488] text-white text-[13px] font-semibold tracking-[0.08em]" style={{ width: "36%" }}>5% SEQU3NCE</div>
        <div className="flex items-center justify-center bg-white text-[#0b1f1d] text-[13px] font-semibold tracking-[0.08em] border-l-2 border-[#0b1f1d]" style={{ width: "64%" }}>7–10% MANAGER</div>
      </div>
      <div className="mt-2 flex items-start justify-between gap-6">
        <Mono ink caps={false}>Option A · the manager&apos;s 7–10%, plus $3,000/mo to Sequ3nce for the software and systems.</Mono>
        <Mono caps={false} className="font-semibold whitespace-nowrap">The $3,000/mo never goes to the manager.</Mono>
      </div>
    </div>
  );
}
