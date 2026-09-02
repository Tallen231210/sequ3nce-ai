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
  // 1 — Cover: both brands
  {
    title: (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sequ3nce.ai" className="w-[74vw] max-w-[980px] mx-auto -mb-6 invert" />
        <div className="text-2xl md:text-3xl font-black tracking-[0.35em] text-amber-300 mb-8">+ CHURP</div>
        <div className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-[1.05]">
          The operating system
          <br />
          for high-ticket closers.
        </div>
      </div>
    ),
    wide: true,
  },
  // 2 — Split intro: what each does, why both
  {
    kicker: "Two products. One machine.",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">The room <span className="text-amber-300">and</span> the weapon.</h1>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl items-stretch">
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-8 flex flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Sequ3nce.ai" className="h-5 invert self-start mb-5" />
          <p className="text-white font-bold text-lg leading-snug mb-3">The community that breeds high performers.</p>
          <p className="text-zinc-400 text-[14px] leading-relaxed">
            Your calls filmed and scored, your numbers verified, coaching from
            8-figure closers, and the doors — public and private — to the seats
            worth taking.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/40 bg-zinc-900 p-8 flex flex-col">
          <div className="text-white font-black tracking-[0.3em] text-lg self-start mb-5">CHURP</div>
          <p className="text-white font-bold text-lg leading-snug mb-3">The tool that makes you one.</p>
          <p className="text-zinc-400 text-[14px] leading-relaxed">
            AI that replies to your prospects for you — setting, closing, or
            selling yourself into an offer. Every DM answered in seconds.
            Ruthlessly efficient.
          </p>
        </div>
      </div>
    ),
    wide: true,
  },
  // 3 — Let's start with Sequ3nce
  {
    kicker: "Part one",
    title: "Sequ3nce: your sales brain, in one place.",
    body: (
      <div className="space-y-4">
        <P>Your entire ecosystem — and it travels with you no matter what offer you&apos;re on.</P>
        <P>It records every call, builds your highlight reels, proves your numbers in real time, opens the job board, and puts 8-figure coaches in your corner.</P>
      </div>
    ),
  },
  // 4-6 — App tour (real screenshots, sample account)
  {
    kicker: "The cockpit",
    title: "Your whole game, on one screen.",
    body: <P>A bot records your sales calls, AI scores every one, and your dashboard turns the week into numbers you can act on.</P>,
    shot: "/pitch/deck-dashboard.png",
  },
  {
    kicker: "The film room",
    title: "Every call, on tape.",
    body: <P>Full recordings, transcripts, and AI analysis on every call — the habit behind every &ldquo;reviewed one call, closed $50k&rdquo; story later in this deck.</P>,
    shot: "/pitch/deck-calls.png",
  },
  {
    kicker: "Your numbers",
    title: "Stats that hire you.",
    body: <P>Close rate, cash collected, streaks — tracked automatically and verifiable. Your profile becomes a rep card companies actually trust.</P>,
    shot: "/pitch/deck-stats.png",
  },
  // 7 — Classroom
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
  // 8 — Public job board (no hard number)
  {
    kicker: "The doors",
    title: "Hundreds of remote closing roles. Added weekly.",
    body: <P>A live board of real remote sales seats, refreshed every week — from first commission seat to senior closer chairs. And that&apos;s just the public list.</P>,
    shot: "/pitch/deck-jobboard.png",
  },
  // 9 — The private board (VIP)
  {
    kicker: "Yearly members only",
    title: <>The <span className="text-amber-300">private</span> board.</>,
    body: (
      <div className="flex flex-col md:flex-row gap-10 items-center w-full max-w-5xl">
        <div className="flex-1 space-y-4">
          <P>Beyond the public board sits our private network — companies that come to Sequ3nce directly for proven closers.</P>
          <P><span className="text-white font-semibold">Seats paying $10k, $20k, $30k a month</span> — never posted anywhere. We send YOUR verified profile and make the intro personally.</P>
          <P>Public board for getting in the game. The private network for getting placed.</P>
        </div>
        <div className="flex-1 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pitch/vip-placement-line.png" alt="The Placement Line"
            className="rounded-xl border border-zinc-800 shadow-2xl w-full" />
          <p className="text-zinc-600 text-[11px] mt-2 text-center">The Placement Line — live in the app</p>
        </div>
      </div>
    ),
    wide: true,
  },
  // 10 — Proof
  {
    kicker: "Real members. Real wins.",
    title: "This is what the room produces.",
    body: (
      <div className="grid grid-cols-3 gap-4 items-start">
        {["niv", "morgan", "samw"].map((w) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={w} src={`/wins/${w}.png`} alt="Real member win"
            className="rounded-xl border border-zinc-800 w-full" />
        ))}
      </div>
    ),
    wide: true,
  },
  // 11 — Sequ3nce pricing
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
          <span className="mt-auto pt-3 text-[11px] text-amber-300 font-semibold">The three pillars &rarr;</span>
        </div>
      </div>
    ),
    wide: true,
  },
  // 12 — VIP: three pillars
  {
    kicker: "Yearly only",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">VIP is <span className="text-amber-300">three pillars.</span></h1>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl items-stretch">
        {[
          {
            n: "01",
            name: "VIP treatment",
            lead: "You're treated differently — everywhere.",
            items: ["VIP badge across the community", "The Inner Circle — private room", "VIP events: front row, VIP tables", "Merch + member pricing: 20% off, always"],
          },
          {
            n: "02",
            name: "Coached to elite",
            lead: "We build you into the best version of you.",
            items: ["Exclusive coaching access", "Call reviews on your real calls", "Live call listening", "Priority verification — skip the line"],
          },
          {
            n: "03",
            name: "Direct placement",
            lead: "The best seats come to you.",
            items: ["The Placement Line — private network", "Your profile sent to partners by us", "Gold verified numbers do the talking", "Warm intros, never cold applications"],
          },
        ].map((pil) => (
          <div key={pil.n} className={"rounded-2xl border p-6 flex flex-col " + (pil.n === "03" ? "border-amber-400/50 bg-amber-400/[0.05]" : "border-zinc-800 bg-zinc-900/60")}>
            <div className="text-amber-300 text-[12px] font-black tracking-[0.25em] mb-3">{pil.n}</div>
            <div className="text-white font-bold text-[17px] mb-1">{pil.name}</div>
            <p className="text-zinc-400 text-[12.5px] mb-4">{pil.lead}</p>
            <div className="space-y-2 mt-auto">
              {pil.items.map((it) => (
                <div key={it} className="flex items-start gap-2 text-[12.5px] text-zinc-300">
                  <span className="text-amber-300 mt-0.5">&#x2713;</span>{it}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
    wide: true,
  },
  // 13 — Live in the app
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
          <img src="/pitch/vip-placement-line.png" alt="The Placement Line"
            className="rounded-xl border border-zinc-800 shadow-2xl w-full" />
          <p className="text-zinc-500 text-[12px] mt-2 text-center">The Placement Line — your profile, live with our placement team</p>
        </div>
      </div>
    ),
    wide: true,
  },
  // 14 — Events + merch (with renders)
  {
    kicker: "VIP treatment, everywhere",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">At our events, <span className="text-amber-300">you&apos;re the VIP too.</span></h1>,
    body: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl items-stretch">
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
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col items-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3 self-start">The merch drop</div>
          <svg viewBox="0 0 240 150" className="w-48 mb-2">
            <defs>
              <linearGradient id="hatCrown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="70%" stopColor="#f1f1f3" />
                <stop offset="100%" stopColor="#dcdce0" />
              </linearGradient>
              <linearGradient id="hatBrim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f6f6f8" />
                <stop offset="100%" stopColor="#c9c9cf" />
              </linearGradient>
              <pattern id="hatMesh" width="7" height="7" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill="#ececef" />
                <circle cx="3.5" cy="3.5" r="1.6" fill="#b9b9c0" />
              </pattern>
              <clipPath id="frontPanel">
                <path d="M62 92 Q64 34 120 30 Q176 34 178 92 Z" />
              </clipPath>
            </defs>
            {/* soft ground shadow */}
            <ellipse cx="120" cy="132" rx="82" ry="9" fill="#000" opacity="0.35" />
            {/* mesh side panels (peek out behind the front) */}
            <path d="M40 96 Q40 44 120 38 Q200 44 200 96 Z" fill="url(#hatMesh)" stroke="#b6b6bd" strokeWidth="1.5" />
            {/* white front panel */}
            <path d="M62 92 Q64 34 120 30 Q176 34 178 92 Z" fill="url(#hatCrown)" stroke="#c3c3ca" strokeWidth="1.5" />
            {/* panel seams */}
            <path d="M100 33 Q98 60 97 92" stroke="#d8d8dd" strokeWidth="1.4" fill="none" />
            <path d="M140 33 Q142 60 143 92" stroke="#d8d8dd" strokeWidth="1.4" fill="none" />
            {/* crown button */}
            <ellipse cx="120" cy="30" rx="6" ry="3.4" fill="#e4e4e8" stroke="#c3c3ca" strokeWidth="1" />
            {/* logo on the front panel */}
            <g clipPath="url(#frontPanel)">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <image href="/logo.png" x="70" y="52" width="100" height="24" preserveAspectRatio="xMidYMid meet" />
            </g>
            {/* brim: curved trucker bill */}
            <path d="M38 96 Q120 82 202 96 Q206 104 198 110 Q120 96 42 110 Q34 104 38 96 Z" fill="url(#hatBrim)" stroke="#b6b6bd" strokeWidth="1.5" />
            <path d="M42 110 Q120 97 198 110 Q120 122 42 110 Z" fill="#d3d3d9" stroke="#b6b6bd" strokeWidth="1" />
            {/* brim underside shadow line */}
            <path d="M48 99 Q120 87 192 99" stroke="#ffffff" strokeWidth="1.2" fill="none" opacity="0.8" />
          </svg>
          <div className="text-white font-bold text-[15px]">The Closer Cap</div>
          <div className="mt-2 text-[14px]">
            <span className="text-zinc-500 line-through mr-2">$50</span>
            <span className="text-amber-300 font-bold">$20 member price</span>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800 w-full text-center">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 px-2 py-1 rounded">Store opening in-app &middot; VIP: 20% off always</span>
          </div>
        </div>
      </div>
    ),
    wide: true,
  },
  // 15 — Churp intro
  {
    kicker: "Part two — Churp",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">Your keyboard just <span className="text-amber-300">learned to sell.</span></h1>,
    body: (
      <div className="flex flex-col md:flex-row gap-10 items-center w-full max-w-4xl">
        <div className="flex-1 space-y-4">
          <P>Churp is the AI that replies to your prospects for you. It reads the conversation on your screen and writes the send-ready reply at your cursor.</P>
          <P><span className="text-white font-semibold">Three minutes of typing becomes three seconds.</span> Same hours, 10&times; the conversations — objections, follow-ups, closes.</P>
          <P>Works in every app. Zero typing, all closing.</P>
        </div>
        <div className="w-full md:w-[350px] rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl space-y-2.5">
          {[
            ["Silent reply", "Press one key — it writes what a closer would send."],
            ["Command", "\u201cHandle this objection.\u201d It executes against the whole thread."],
            ["Brief it", "Tell it what you know; it writes the follow-up that fits."],
            ["Remind", "\u201cRemind me Friday.\u201d Zero follow-ups dropped."],
          ].map(([m, d]) => (
            <div key={m} className="rounded-lg bg-zinc-800/70 px-3.5 py-2.5">
              <span className="text-amber-300 text-[12px] font-bold uppercase tracking-wider">{m}</span>
              <p className="text-zinc-300 text-[12.5px] mt-0.5">{d}</p>
            </div>
          ))}
        </div>
      </div>
    ),
    wide: true,
  },
  // 16 — Churp pricing
  {
    kicker: "Churp pricing",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">Every plan, everything. <span className="text-amber-300">Annual wins.</span></h1>,
    body: (
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-4 gap-4 items-stretch mb-6">
          {[
            { label: "Monthly", per: "$24.99", sub: "billed monthly", vip: false },
            { label: "3 Months", per: "$23.33", sub: "$69.99 / 3 mo", vip: false },
            { label: "6 Months", per: "$21.67", sub: "$129.99 / 6 mo", vip: false },
            { label: "Annual", per: "$20", sub: "$239.99 / year", vip: true },
          ].map((pl) => (
            <div key={pl.label} className={"rounded-2xl border p-5 flex flex-col " + (pl.vip ? "border-2 border-amber-400/70 bg-amber-400/[0.07] scale-[1.04] relative" : "border-zinc-800 bg-zinc-900/60")}>
              {pl.vip && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-zinc-950 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md whitespace-nowrap">Best value</span>}
              <div className={"text-[12px] font-semibold uppercase tracking-wider mb-2 " + (pl.vip ? "text-amber-300" : "text-zinc-400")}>{pl.label}</div>
              <div className="text-2xl font-bold text-white">{pl.per}<span className="text-sm text-zinc-500">/mo</span></div>
              <p className="text-zinc-500 text-[12px] mt-1.5">{pl.sub}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-4 flex items-center justify-center gap-6 text-[15px]">
          <span className="text-zinc-400">12 months, paid monthly: <span className="line-through">$299.88</span></span>
          <span className="text-white font-bold">Annual: $239.99</span>
          <span className="text-amber-300 font-bold">You keep $60</span>
        </div>
      </div>
    ),
    wide: true,
  },
  // 17 — Lock your seat: both yearlies
  {
    kicker: "The close",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">Lock your seat.</h1>,
    body: (
      <div className="grid grid-cols-2 gap-6 w-full max-w-3xl">
        <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-400/[0.06] p-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Sequ3nce.ai" className="h-4 invert mb-4" />
          <div className="text-amber-300 text-[12px] font-semibold uppercase tracking-wider mb-1">Yearly — VIP</div>
          <div className="text-4xl font-bold text-white">$1,000<span className="text-base text-zinc-500">/yr</span></div>
          <p className="text-zinc-400 text-[12.5px] mt-3">The whole platform + all three VIP pillars.</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-400/[0.06] p-7">
          <div className="text-white font-black tracking-[0.3em] text-sm mb-4">CHURP</div>
          <div className="text-amber-300 text-[12px] font-semibold uppercase tracking-wider mb-1">Annual</div>
          <div className="text-4xl font-bold text-white">$239.99<span className="text-base text-zinc-500">/yr</span></div>
          <p className="text-zinc-400 text-[12.5px] mt-3">Unlimited replies, every app, trained on your voice.</p>
        </div>
      </div>
    ),
    wide: true,
  },
  // 18 — Path A vs Path B
  {
    kicker: "Two paths",
    title: <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">Which one makes sense for you?</h1>,
    body: (
      <div className="grid grid-cols-2 gap-6 w-full max-w-4xl items-stretch">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7 flex flex-col">
          <div className="text-zinc-400 text-[12px] font-bold uppercase tracking-[0.2em] mb-2">Path A — Starter</div>
          <div className="text-white font-bold text-xl mb-4">Dip your toes in.</div>
          <div className="space-y-2 text-[13px] text-zinc-300">
            <div>Sequ3nce monthly — $150/mo</div>
            <div>Churp monthly — $24.99/mo</div>
          </div>
          <p className="text-zinc-500 text-[12px] mt-auto pt-5">Full platform, full tool. Cancel anytime.</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-400/[0.07] p-7 flex flex-col relative">
          <span className="absolute -top-3 left-6 bg-amber-400 text-zinc-950 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">The move</span>
          <div className="text-amber-300 text-[12px] font-bold uppercase tracking-[0.2em] mb-2">Path B — All in</div>
          <div className="text-white font-bold text-xl mb-4">Everything, locked for a year.</div>
          <div className="space-y-2 text-[13px] text-zinc-200">
            <div className="flex items-start gap-2"><span className="text-amber-300">&#x2713;</span>Sequ3nce Yearly VIP — $1,000</div>
            <div className="flex items-start gap-2"><span className="text-amber-300">&#x2713;</span>Churp Annual — $239.99</div>
            <div className="flex items-start gap-2"><span className="text-amber-300">&#x2713;</span>All three VIP pillars — placement, coaching, treatment</div>
            <div className="flex items-start gap-2"><span className="text-amber-300">&#x2713;</span>The Inner Circle + VIP events</div>
            <div className="flex items-start gap-2"><span className="text-amber-300">&#x2713;</span>Gold verification + member pricing forever</div>
          </div>
          <p className="text-amber-300/90 text-[12px] font-semibold mt-auto pt-5">Save $860 vs monthly — and the doors open.</p>
        </div>
      </div>
    ),
    wide: true,
  },
];
