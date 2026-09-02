import React from "react";

// ============================================================================
// Slide content for the closer pitch deck (/pitch). Reps present this on
// video calls instead of a live app login. UI screenshots carry SAMPLE data
// (the invisible demo rig) — the proof slide uses REAL wins only.
// The deck's engineered outcome: close on the YEARLY plan.
// ============================================================================

export type Slide = {
  kicker?: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  shot?: string;
  wide?: boolean;
};

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-zinc-400 text-lg leading-relaxed max-w-[46ch]">{children}</p>
);

// Monochrome icon set (lucide paths) — no color emojis in the deck.
const ICONS: Record<string, string> = {
  target: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  check: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  crown: "M2 8l4 4 6-8 6 8 4-4v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8Z",
  door: "M3 21h18M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M14 12h.01",
  ticket: "M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9Z",
  percent: "M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
};

const perkCard = (icon: string, name: string, line: string, accent?: boolean) => (
  <div
    key={name}
    className={`rounded-2xl border p-5 ${
      accent
        ? "border-amber-400/40 bg-amber-400/[0.06]"
        : "border-zinc-800 bg-zinc-900/60"
    }`}
  >
    <svg
      className={`w-6 h-6 mb-3 ${accent ? "text-amber-300" : "text-zinc-200"}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={ICONS[icon]} />
    </svg>
    <div className="font-bold text-white text-[15px] mb-1">{name}</div>
    <div className="text-zinc-400 text-[13px] leading-relaxed">{line}</div>
  </div>
);

export const SLIDES: Slide[] = [
  {
    title: (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sequ3nce.ai" className="w-[82vw] max-w-[1100px] mx-auto -mb-8 invert" />
        <div className="text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.05]">
          The operating system
          <br />
          for high-ticket closers.
        </div>
        <p className="text-zinc-500 mt-6 text-lg">
          Every call filmed. Every number tracked. Every door opened.
        </p>
      </div>
    ),
    wide: true,
  },
  {
    kicker: "The problem",
    title: "Closers fly blind.",
    body: (
      <div className="space-y-4">
        <P>No film of their calls. No real numbers. No proof of what they can do when a better seat opens up.</P>
        <P>Athletes watch tape. Traders track P&amp;L. Closers guess.</P>
      </div>
    ),
  },
  {
    kicker: "The answer",
    title: "Your whole game, in one place.",
    body: <P>A bot records your sales calls, AI scores every one, and your dashboard turns the week into numbers you can act on. This is a member&apos;s home screen.</P>,
    shot: "/pitch/deck-dashboard.png",
  },
  {
    kicker: "The film room",
    title: "Every call, on tape.",
    body: <P>Full recordings, transcripts, and AI analysis on every call — the exact habit behind every &ldquo;reviewed one call, closed $50k&rdquo; story you&apos;ll see later in this deck.</P>,
    shot: "/pitch/deck-calls.png",
  },
  {
    kicker: "Your numbers",
    title: "Stats that hire you.",
    body: <P>Close rate, cash collected, streaks — tracked automatically and verifiable. Your profile becomes a rep card companies actually trust.</P>,
    shot: "/pitch/deck-stats.png",
  },
  {
    kicker: "The classroom",
    title: "Coached by killers.",
    body: (
      <div className="flex flex-col md:flex-row gap-10 items-center w-full max-w-4xl">
        <div className="flex-1 space-y-4">
          <P>Real coaches run classrooms inside the app — training libraries, live call reviews, and replays of every session.</P>
          <P><span className="text-white font-semibold">Ben Byrne&apos;s classroom is open now</span> — and more coaches are joining.</P>
        </div>
        <div className="w-full md:w-[360px] rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-950 flex items-center justify-center text-xl font-bold">B</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-lg">Ben Byrne</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded">Coach</span>
              </div>
              <div className="text-zinc-400 text-[13px] mt-0.5">300+ reps coached &middot; $50k single-call contracts</div>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-zinc-800 space-y-2.5">
            {["Live call reviews — the \u201cit was a disaster\u201d sessions", "Training modules, drop by drop", "Weekly live classroom calls, recorded"].map((t) => (
              <div key={t} className="flex items-start gap-2 text-[13px] text-zinc-300">
                <span className="text-amber-300 mt-0.5">&#x2713;</span>{t}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  {
    kicker: "The doors",
    title: "364 live remote closing roles.",
    body: <P>A job board of real, active remote sales seats — refreshed weekly. And that&apos;s just the public list. The private one comes with the yearly plan.</P>,
    shot: "/pitch/deck-jobboard.png",
  },
  {
    kicker: "Real members. Real wins.",
    title: "This is what the room produces.",
    body: (
      <div className="grid grid-cols-3 gap-4 items-start">
        {["niv", "morgan", "samw"].map((s) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s} src={`/wins/${s}.png`} alt="Real member win"
            className="rounded-xl border border-zinc-800 w-full" />
        ))}
      </div>
    ),
    wide: true,
  },
  {
    kicker: "Membership",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">Four ways in. <span className="text-amber-300">One obvious one.</span></h1>,
    body: (
      <div className="grid grid-cols-4 gap-4 w-full max-w-5xl items-stretch">
        {[
          { label: "Monthly", per: "$150", charged: "Billed monthly", note: null },
          { label: "3 Months", per: "$133", charged: "Billed $400 / 3 mo", note: null },
          { label: "6 Months", per: "$100", charged: "Billed $600 / 6 mo", note: "Save 33%" },
        ].map((pl) => (
          <div key={pl.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col">
            <div className="text-zinc-400 text-[12px] font-semibold uppercase tracking-wider mb-2">{pl.label}</div>
            <div className="text-3xl font-bold text-white">{pl.per}<span className="text-sm text-zinc-500">/mo</span></div>
            <p className="text-zinc-500 text-[12px] mt-2">{pl.charged}</p>
            {pl.note && <span className="mt-auto pt-3 text-[11px] text-zinc-400 font-semibold">{pl.note}</span>}
          </div>
        ))}
        <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-400/[0.07] p-6 relative flex flex-col scale-[1.04]">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-zinc-950 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md whitespace-nowrap">Save 44% + VIP</span>
          <div className="text-amber-300 text-[12px] font-semibold uppercase tracking-wider mb-2">Yearly — VIP</div>
          <div className="text-3xl font-bold text-white">$83<span className="text-sm text-zinc-500">/mo</span></div>
          <p className="text-zinc-400 text-[12px] mt-2">Billed $1,000 / year</p>
          <span className="mt-auto pt-3 text-[11px] text-amber-300 font-semibold">Everything on the next slide &rarr;</span>
        </div>
      </div>
    ),
    wide: true,
  },
  {
    kicker: "Yearly only",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">The VIP tier is a different{" "}<span className="text-amber-300">membership.</span></h1>,
    body: (
      <div className="grid grid-cols-3 gap-4 w-full max-w-4xl">
        {perkCard("target", "The Placement Line", "Companies call US asking for closers. VIP members see those roles first — with a warm intro from Sequ3nce.", true)}
        {perkCard("check", "Gold Check", "Gold verified badge on your profile + priority verification — your numbers certified in 24 hours.")}
        {perkCard("crown", "VIP Badge", "Your name carries VIP everywhere in the community — same system as Founder and Coach badges.")}
        {perkCard("door", "The Inner Circle", "A private VIP-only room inside the community. Events drop there first. The top closers actually talk there.")}
        {perkCard("ticket", "VIP Events", "Closer masterminds and member parties — in person and remote. VIP gets the invite.")}
        {perkCard("percent", "Member Pricing", "20% off everything else, forever — extra coaching, merch, event seats.")}
      </div>
    ),
    wide: true,
  },
  {
    kicker: "Already live",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">Not a promise — <span className="text-amber-300">it&apos;s in the app.</span></h1>,
    body: (
      <div className="grid grid-cols-2 gap-5 w-full max-w-4xl items-start">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pitch/vip-inner-circle.png" alt="The Inner Circle — VIP channel"
            className="rounded-xl border border-zinc-800 shadow-2xl w-full" />
          <p className="text-zinc-500 text-[12px] mt-2 text-center">The Inner Circle — VIP badge on every post</p>
        </div>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pitch/vip-jobboard.png" alt="Partner role pinned on the job board"
            className="rounded-xl border border-zinc-800 shadow-2xl w-full" />
          <p className="text-zinc-500 text-[12px] mt-2 text-center">A partner role, pinned first for VIP members</p>
        </div>
      </div>
    ),
    wide: true,
  },
  {
    kicker: "The crown jewel",
    title: "The Placement Line.",
    body: (
      <div className="flex flex-col md:flex-row gap-10 items-center w-full max-w-4xl">
        <div className="flex-1 space-y-4">
          <P>Hiring companies come to us directly for proven closers. We don&apos;t post those seats anywhere.</P>
          <P><span className="text-white font-semibold">We send them YOUR profile</span> — photo, story, gold-verified numbers — and make the intro personally.</P>
          <P>No applications. No job hunting. Your profile does the work; the call comes to you.</P>
        </div>
        <div className="w-full md:w-[350px] rounded-2xl border border-amber-400/40 bg-zinc-900 p-5 shadow-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-3">On The Placement Line</div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-amber-400 text-zinc-950 font-bold flex items-center justify-center">JR</div>
            <div>
              <div className="text-white font-bold text-[15px]">Jordan R. <span className="ml-1 text-[9px] font-bold uppercase bg-amber-400/15 text-amber-300 border border-amber-400/30 px-1 py-0.5 rounded align-middle">VIP</span></div>
              <div className="text-zinc-400 text-[12px]">Gold Verified &middot; 55% close rate &middot; $31k last week</div>
            </div>
          </div>
          <div className="rounded-xl bg-zinc-800/80 px-4 py-3 text-[12.5px] text-zinc-300 leading-relaxed">
            &ldquo;Sending your profile to an 8-figure coaching offer hiring two
            closers this month — expect an intro this week.&rdquo;
            <div className="text-zinc-500 text-[11px] mt-2">— Sequ3nce placement team</div>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  {
    kicker: "VIP treatment, everywhere",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">At our events, <span className="text-amber-300">you&apos;re the VIP too.</span></h1>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl items-stretch">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Event invite</div>
          <div className="text-white font-bold text-[17px] leading-tight">Closing Masterclass</div>
          <div className="text-zinc-400 text-[12px] mt-1">Live &middot; first date announcing soon</div>
          <div className="mt-4 pt-3 border-t border-zinc-800">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 px-2 py-1 rounded">Your seat: front row</span>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Event invite</div>
          <div className="text-white font-bold text-[17px] leading-tight">Members Party</div>
          <div className="text-zinc-400 text-[12px] mt-1">When we rent the club, you&apos;re on the list</div>
          <div className="mt-4 pt-3 border-t border-zinc-800">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 px-2 py-1 rounded">Your table: VIP</span>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Sequ3nce merch</div>
          <div className="text-white font-bold text-[17px] leading-tight">The merch drop</div>
          <div className="text-zinc-400 text-[12px] mt-1">Store opening inside the app</div>
          <div className="mt-4 pt-3 border-t border-zinc-800">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 px-2 py-1 rounded">Member price: 20% off, always</span>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  {
    kicker: "The math",
    title: "Yearly pays for itself.",
    body: (
      <div className="space-y-5 max-w-xl">
        <div className="flex justify-between text-lg border-b border-zinc-800 pb-3"><span className="text-zinc-400">12 months, paid monthly</span><span className="text-zinc-300 font-semibold">$1,800</span></div>
        <div className="flex justify-between text-lg border-b border-zinc-800 pb-3"><span className="text-zinc-400">Yearly VIP</span><span className="text-white font-bold">$1,000</span></div>
        <div className="flex justify-between text-lg"><span className="text-amber-300 font-semibold">You keep</span><span className="text-amber-300 font-bold">$800 + the whole VIP tier</span></div>
        <p className="text-zinc-500 text-sm pt-2">And one Placement Line intro can be worth a $15k/mo seat.</p>
      </div>
    ),
  },
  {
    title: (
      <div className="text-center">
        <div className="text-5xl font-bold tracking-tight text-white leading-tight">Lock your seat.</div>
        <p className="text-zinc-400 mt-6 text-lg">Yearly VIP — $1,000 today, everything you just saw.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sequ3nce.ai" className="h-6 mx-auto mt-12 invert opacity-60" />
      </div>
    ),
    wide: true,
  },
];
