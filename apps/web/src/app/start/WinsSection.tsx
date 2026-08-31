// ============================================================================
// "Cash collected by people Ben coached" — real client wins, ported from
// Ben's v13 design. Two counter-scrolling marquee rows of win cards, an
// optional featured trio of proof screenshots, and a three-stat strip.
//
// CONTENT RULES (Ben's own bar, written into his source file): every name
// and figure here is a real coaching client with a real result, and each
// person must have given written permission before this page takes ad
// traffic. Do not add cards that don't meet that bar.
//
// SHOW_FEATURED stays false until the three proof screenshots exist at
// /public/wins/ (niv.png, daniel.png, los.png).
// ============================================================================

const SHOW_FEATURED = false;

const WINS: { av: string; name: string; text: React.ReactNode }[] = [
  { av: "N", name: "Niv", text: <>One reviewed call to a <b>$50,000</b> contract signed</> },
  { av: "D", name: "Daniel", text: <>Went from <b>$15k</b> months to <b>$30k</b> months</> },
  { av: "BD", name: "Brandon D.", text: <>Went from <b>$3k/mo</b> to <b>$10k/mo</b> on the same service</> },
  { av: "M", name: "Morgan", text: <><b>$3,375</b> collected and <b>$16,200</b> contracted in two days</> },
  { av: "TD", name: "Tim D.", text: <>Collected <b>$12k</b>, then closed another the same day</> },
  { av: "SW", name: "Sam W.", text: <>First ever <b>paid in full</b>, collected <b>$8k</b></> },
  { av: "MS", name: "Max S.", text: <>Went from single projects to a <b>$20k</b> deal</> },
  { av: "WN", name: "Will N.", text: <>Collected <b>$8k</b> on his first package</> },
  { av: "N", name: "Nick", text: <>Went from <b>$5k</b> to <b>$20k</b> months</> },
  { av: "BH", name: "Brandon H.", text: <>Collected <b>$25,000</b> paid in full, one client</> },
  { av: "D", name: "Dontavious", text: <>Collected <b>$140K</b> in four months</> },
  { av: "MG", name: "Morgan G.", text: <>Close rate tripled, first <b>$50k+</b> month</> },
  { av: "ES", name: "Emma S.", text: <>New setter booked <b>3 calls in 24 hours</b></> },
];

const FEATURED = [
  {
    shot: "/wins/niv.png",
    alt: "Screenshot of a message from Niv",
    av: "N",
    name: "Niv",
    role: "Closer",
    from: "A call he called a disaster",
    to: <><b>$50,000</b> signed</>,
    points: [
      <>Ben reviewed one of his calls. <mark>&ldquo;It was a disaster.&rdquo;</mark></>,
      <>Watched the tape back ten times before his next one</>,
      <>Two days later, a prospect call came through</>,
      <><mark>$25,000 collected</mark> upfront, $25k in 30 days</>,
    ],
  },
  {
    shot: "/wins/daniel.png",
    alt: "Screenshot of a message from Daniel",
    av: "D",
    name: "Daniel",
    role: "Closer, own offer",
    from: <><b>$15k</b> months</>,
    to: <><b>$30k</b> months</>,
    points: [
      <>Presence and tonality were <mark>way off</mark> before the call reviews</>,
      <>Close rate went from <mark>sub 20% to 35%</mark></>,
      <>Same offer, same leads, different call</>,
      <>&ldquo;I never doubt myself on a sales call now&rdquo;</>,
    ],
  },
  {
    shot: "/wins/los.png",
    alt: "Screenshot of a message from Los A.",
    av: "LA",
    name: "Los A.",
    role: "Closer, own offer",
    from: "No offer, no positioning",
    to: <><b>First Rolex</b></>,
    points: [
      <>Came in with <mark>no positioning</mark> and no voice of his own</>,
      <>Built a script-less selling approach with Ben</>,
      <>&ldquo;Talking me down off the cliff was all worth it&rdquo;</>,
      <>Sent Ben a photo of what the commissions bought</>,
    ],
  },
];

const STATS = [
  { b: "300+", s: "Reps coached" },
  { b: "$50k", s: "Biggest single contract" },
  { b: "$0", s: "For the training" },
];

const WINS_CSS = `
.w-wrap{margin:0 -24px;padding:0 0 4px;overflow:hidden}
.w-row{display:flex;gap:10px;width:max-content;padding:4px 24px;will-change:transform}
.w-row.a{animation:w-l 46s linear infinite}
.w-row.b{animation:w-r 54s linear infinite;margin-top:10px}
@keyframes w-l{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes w-r{from{transform:translateX(-50%)}to{transform:translateX(0)}}
.w-wrap:hover .w-row{animation-play-state:paused}
@media(prefers-reduced-motion:reduce){.w-row{animation:none}.w-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.w-row{width:auto}}
.w-card{flex:none;width:268px;background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:13px 14px;
  display:flex;gap:11px;align-items:flex-start;box-shadow:0 2px 10px rgba(9,9,11,.04)}
.w-av{flex:none;width:34px;height:34px;border-radius:50%;background:#18181b;color:#fff;display:flex;
  align-items:center;justify-content:center;font-size:12px;font-weight:650;letter-spacing:-.02em}
.w-b{min-width:0}
.w-n{font-size:13px;font-weight:650;letter-spacing:-.015em;line-height:1.25}
.w-t{font-size:12.5px;line-height:1.45;color:#71717a;margin-top:3px;text-wrap:pretty}
.w-t b{color:#047857;font-weight:650;font-variant-numeric:tabular-nums}
.w-fade{position:relative}
.w-fade::before,.w-fade::after{content:"";position:absolute;top:0;bottom:0;width:56px;z-index:2;pointer-events:none}
.w-fade::before{left:0;background:linear-gradient(90deg,#fff,transparent)}
.w-fade::after{right:0;background:linear-gradient(270deg,#fff,transparent)}
.w-feat{display:grid;gap:16px;grid-template-columns:1fr;max-width:1080px;margin:26px auto 0}
@media(min-width:860px){.w-feat{grid-template-columns:repeat(3,1fr)}}
.w-f{border:1px solid #e4e4e7;border-radius:18px;overflow:hidden;background:#fff}
.w-shot{position:relative;background:#f4f4f5;border-bottom:1px solid #e4e4e7;max-height:380px;overflow:hidden}
.w-shot img{display:block;width:100%;height:auto}
.w-shot::after{content:"";position:absolute;left:0;right:0;bottom:0;height:52px;background:linear-gradient(transparent,#fff)}
.w-tag{position:absolute;right:10px;top:10px;background:#fff;border:1px solid #e4e4e7;border-radius:6px;padding:3px 7px;
  font-size:9.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:#71717a}
.w-fb{padding:16px}
.w-fh{display:flex;gap:10px;align-items:center;margin-bottom:11px}
.w-fn{font-size:15px;font-weight:650;letter-spacing:-.018em;line-height:1.2}
.w-fr{font-size:11.5px;color:#a1a1aa;margin-top:1px}
.w-arc{display:flex;align-items:center;gap:8px;background:#fafafa;border:1px solid #e4e4e7;border-radius:11px;
  padding:9px 11px;margin:0 0 12px}
.w-arc .from{font-size:12.5px;color:#a1a1aa;line-height:1.25;flex:1;text-wrap:pretty}
.w-arc .ar{font-size:14px;color:#d4d4d8;flex:none}
.w-arc .to{font-size:12.5px;color:#047857;line-height:1.25;flex:1;text-align:right;font-variant-numeric:tabular-nums}
.w-arc b{font-size:15px;font-weight:700;letter-spacing:-.02em}
.w-fl{display:grid;gap:7px;margin:0;padding:0;list-style:none}
.w-fl li{font-size:13.5px;line-height:1.5;color:#52525b;padding-left:14px;position:relative;text-wrap:pretty}
.w-fl li::before{content:"";position:absolute;left:0;top:8px;width:4px;height:4px;border-radius:50%;background:#d4d4d8}
.w-fl mark{background:#d1fae5;color:#065f46;font-weight:650;padding:0 3px;border-radius:3px;font-variant-numeric:tabular-nums}
.w-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:640px;margin:26px auto 0}
.w-s{text-align:center;padding:15px 8px;border:1px solid #e4e4e7;border-radius:14px;background:#fff}
.w-s b{display:block;font-size:24px;font-weight:700;letter-spacing:-.035em;line-height:1;font-variant-numeric:tabular-nums}
.w-s span{display:block;font-size:11px;color:#a1a1aa;margin-top:5px;letter-spacing:.04em;text-transform:uppercase}
@media(max-width:420px){.w-s{padding:12px 5px}.w-s b{font-size:19px}.w-s span{font-size:9.5px}.w-card{width:236px}}
`;

function WinCard({ w }: { w: (typeof WINS)[number] }) {
  return (
    <div className="w-card">
      <div className="w-av">{w.av}</div>
      <div className="w-b">
        <div className="w-n">{w.name}</div>
        <div className="w-t">{w.text}</div>
      </div>
    </div>
  );
}

export function WinsSection() {
  // Each row holds its card list twice — the keyframes slide exactly one
  // list-width, so the loop is seamless. Row B runs the opposite direction
  // with a rotated order so the same faces aren't stacked vertically.
  const rowA = [...WINS, ...WINS];
  const rotated = [...WINS.slice(7), ...WINS.slice(0, 7)];
  const rowB = [...rotated, ...rotated];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: WINS_CSS }} />
      <p className="kick">Cash collected by people Ben coached</p>
      <div className="w-fade">
        <div className="w-wrap">
          <div className="w-row a">
            {rowA.map((w, i) => (
              <WinCard key={`a${i}`} w={w} />
            ))}
          </div>
          <div className="w-row b">
            {rowB.map((w, i) => (
              <WinCard key={`b${i}`} w={w} />
            ))}
          </div>
        </div>
      </div>

      {SHOW_FEATURED && (
        <div className="w-feat">
          {FEATURED.map((f) => (
            <div className="w-f" key={f.name}>
              <div className="w-shot">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.shot} alt={f.alt} loading="lazy" />
                <span className="w-tag">Real message</span>
              </div>
              <div className="w-fb">
                <div className="w-fh">
                  <div className="w-av">{f.av}</div>
                  <div>
                    <div className="w-fn">{f.name}</div>
                    <div className="w-fr">{f.role}</div>
                  </div>
                </div>
                <div className="w-arc">
                  <span className="from">{f.from}</span>
                  <span className="ar">&rarr;</span>
                  <span className="to">{f.to}</span>
                </div>
                <ul className="w-fl">
                  {f.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="w-stats">
        {STATS.map((s) => (
          <div className="w-s" key={s.s}>
            <b>{s.b}</b>
            <span>{s.s}</span>
          </div>
        ))}
      </div>
    </>
  );
}
