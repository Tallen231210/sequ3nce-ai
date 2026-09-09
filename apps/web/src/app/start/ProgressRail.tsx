import { Check } from "lucide-react";

// ============================================================================
// Two-step funnel progress, shared by /start/book and /start/thanks. Framing
// the flow as a tracked journey keeps leads from treating the page as finished
// and setting the phone down before a coach reaches them. Data-driven: each
// page passes the step states so the booking page reads "mid-flow" and the
// post-booking page reads "done."
// ============================================================================

export type RailStep = { label: string; state: "done" | "current" | "pending" };

// Default: the booking step — details are in, the call is the current focus.
const DEFAULT_STEPS: RailStep[] = [
  { label: "Details submitted", state: "done" },
  { label: "Onboarding call", state: "current" },
  { label: "You're in", state: "pending" },
];

export function ProgressRail({ steps = DEFAULT_STEPS }: { steps?: RailStep[] }) {
  return (
    <div className="mx-auto mb-8 flex max-w-[560px] items-start px-2">
      {steps.map((step, i) => (
        <div key={step.label} className="relative flex flex-1 flex-col items-center">
          {i > 0 && (
            <span
              aria-hidden
              className={`absolute right-1/2 top-3 h-[2px] w-full ${
                step.state === "pending" ? "bg-zinc-200" : "bg-zinc-900"
              }`}
            />
          )}
          <span
            className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
              step.state === "done"
                ? "bg-emerald-600 text-white"
                : step.state === "current"
                  ? "bg-zinc-900 text-white"
                  : "border-2 border-zinc-300 bg-white text-zinc-400"
            }`}
          >
            {step.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
          </span>
          <span
            className={`mt-2 text-center text-[11px] leading-tight ${
              step.state === "current"
                ? "font-semibold text-zinc-900"
                : step.state === "done"
                  ? "font-medium text-zinc-500"
                  : "font-medium text-zinc-400"
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
