// ============================================================================
// Activation: the rep's close page. Two products, two checkouts, two steps.
// Both buttons open NEW TABS — the rep brings the prospect back to this tab
// after the first payment to run the second.
// ============================================================================

// Churp's PRODUCTION checkout (real charges) — swapped in 2026-08-26.
const CHURP_CHECKOUT_URL = "https://www.churp.ai/checkout";

const GROUND: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgb(228 228 231) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
  maskImage: "radial-gradient(ellipse 70% 55% at 50% 12%, black 30%, transparent 75%)",
};

export default function ActivatePage() {
  return (
    <main className="relative mx-auto max-w-[980px] px-6 py-12 lg:py-16">
      <div aria-hidden className="absolute inset-0 -z-10" style={GROUND} />

      <div className="mx-auto mb-10 max-w-[640px] text-center">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
          Activation
        </p>
        <h1 className="text-[clamp(30px,4.4vw,46px)] font-semibold leading-[0.98] tracking-[-0.04em] text-zinc-950">
          Activate your <span className="font-serif italic font-normal">stack</span>
          <span className="text-zinc-300">.</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-500">
          The roles, the training and the room stay free. You&apos;re paying for
          the two tools that run them — each has its own checkout, so this takes
          two quick steps.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col rounded-[20px] border-2 border-zinc-900 bg-white p-7 shadow-[0_14px_44px_rgba(9,9,11,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Step 1 of 2
          </p>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Your call engine
          </p>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">
            Sequ3nce Personal
          </h2>
          <p className="mb-5 mt-2.5 flex-1 text-[13.5px] leading-relaxed text-zinc-500">
            Records every call, analyses and scores it, and builds the verified
            track record your placement profile runs on. Pick your term on the
            next page — longer terms cost less per month.
          </p>
          <a
            href="https://www.sequ3nce.ai/personal/checkout"
            target="_blank"
            rel="noopener"
            className="block w-full rounded-[10px] bg-zinc-900 px-4 py-4 text-center text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Choose your Sequ3nce plan →
          </a>
        </div>

        <div className="flex flex-col rounded-[20px] border border-zinc-200 bg-white p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Step 2 of 2
          </p>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Your outreach engine
          </p>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Churp</h2>
          <p className="mb-5 mt-2.5 flex-1 text-[13.5px] leading-relaxed text-zinc-500">
            Required to run the workflow in module 3 of the program. Activate it
            right after Sequ3nce — it takes about a minute.
          </p>
          <a
            href={CHURP_CHECKOUT_URL}
            target="_blank"
            rel="noopener"
            className="block w-full rounded-[10px] border border-zinc-300 px-4 py-4 text-center text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
          >
            Choose your Churp plan →
          </a>
        </div>
      </div>

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-zinc-400">
        Sequ3nce and Churp are our own software. The training and placement are
        free because the tools are how we make money.
      </p>
    </main>
  );
}
