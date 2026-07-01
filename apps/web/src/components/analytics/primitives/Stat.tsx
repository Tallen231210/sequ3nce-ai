import { cn } from "@/lib/utils";
import { MONO } from "./typography";
import { TrendDelta } from "./TrendDelta";

/**
 * Stat — a labeled figure. The atomic unit of the redesigned Analytics tab:
 * an uppercase micro-label, a big monospaced/tabular value, and optional
 * suffix / trend / sublabel. Every number on the tab flows through this so
 * scale, weight, and spacing stay identical section to section (the old
 * hand-rolled `p-4 bg-zinc-50` boxes each drifted their own way).
 */
const VALUE_SIZE = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-4xl",
} as const;

interface StatProps {
  label: string;
  value: string | number;
  /** Muted trailing unit, e.g. "/ 10". Rendered smaller and zinc-300. */
  suffix?: string;
  /** Small muted line beneath the value. */
  sublabel?: string;
  trend?: { value: number; invert?: boolean };
  size?: keyof typeof VALUE_SIZE;
  align?: "left" | "right";
  className?: string;
}

export function Stat({
  label,
  value,
  suffix,
  sublabel,
  trend,
  size = "md",
  align = "left",
  className,
}: StatProps) {
  return (
    <div className={cn(align === "right" && "text-right", className)}>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 flex items-baseline gap-2",
          align === "right" && "justify-end",
        )}
      >
        <span className={cn(VALUE_SIZE[size], "font-semibold tracking-tight", MONO)}>
          {value}
        </span>
        {suffix && <span className="text-lg text-zinc-300">{suffix}</span>}
        {trend && (
          <TrendDelta value={trend.value} invert={trend.invert} className="ml-0.5" />
        )}
      </div>
      {sublabel && <div className="mt-1 text-xs text-zinc-500">{sublabel}</div>}
    </div>
  );
}
