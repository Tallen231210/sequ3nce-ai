"use client";

import { Shield } from "lucide-react";
import { Logo } from "@/components/ui/logo";

interface ShareHeaderProps {
  prospectName: string;
  closerName: string;
  startedAt?: number;
  duration?: number;
  isClip: boolean;
  isCompliance: boolean;
}

export function ShareHeader({
  prospectName,
  closerName,
  startedAt,
  duration,
  isClip,
  isCompliance,
}: ShareHeaderProps) {
  const statusLabel = isCompliance ? "Compliance Recording" : "Shared Recording";

  return (
    <header className="shrink-0 border-b border-zinc-200 px-4 py-3 lg:px-6">
      {/* Mobile: stacked rows. Desktop (lg+): single row with vertical divider. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        {/* Top row on mobile = logo + status pill on opposite ends. On desktop, logo + divider + meta block. */}
        <div className="flex items-center justify-between gap-3 lg:justify-start lg:flex-1 lg:min-w-0">
          <Logo height={26} href="https://sequ3nce.ai" />
          <div className="hidden lg:block h-6 w-px bg-zinc-200 shrink-0" />

          {/* Mobile-only: status pill on the right of logo row */}
          <span className="lg:hidden text-[10px] font-medium text-zinc-300 uppercase tracking-widest whitespace-nowrap">
            {statusLabel}
          </span>

          {/* Desktop-only: meta block sits inline next to the divider */}
          <div className="hidden lg:block min-w-0">
            <MetaBlock
              prospectName={prospectName}
              closerName={closerName}
              startedAt={startedAt}
              duration={duration}
              isClip={isClip}
              isCompliance={isCompliance}
            />
          </div>
        </div>

        {/* Mobile-only: meta block as its own stacked row */}
        <div className="lg:hidden">
          <MetaBlock
            prospectName={prospectName}
            closerName={closerName}
            startedAt={startedAt}
            duration={duration}
            isClip={isClip}
            isCompliance={isCompliance}
          />
        </div>

        {/* Desktop-only: status pill on the right */}
        <span className="hidden lg:inline text-[10px] font-medium text-zinc-300 uppercase tracking-widest whitespace-nowrap">
          {statusLabel}
        </span>
      </div>
    </header>
  );
}

interface MetaBlockProps {
  prospectName: string;
  closerName: string;
  startedAt?: number;
  duration?: number;
  isClip: boolean;
  isCompliance: boolean;
}

function MetaBlock({
  prospectName,
  closerName,
  startedAt,
  duration,
  isClip,
  isCompliance,
}: MetaBlockProps) {
  return (
    <div className="min-w-0">
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
        <h1 className="text-sm font-semibold text-zinc-900 truncate max-w-full">
          {prospectName}
        </h1>
        {isClip && (
          <span className="text-[10px] font-medium bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
            Clip
          </span>
        )}
        {isCompliance && (
          <span className="text-[10px] font-medium bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Compliance Safe
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400 mt-0.5">
        <span>{closerName}</span>
        {startedAt && (
          <>
            <span aria-hidden>&middot;</span>
            <span>{formatDate(startedAt)}</span>
          </>
        )}
        {duration && (
          <>
            <span aria-hidden>&middot;</span>
            <span>{formatDuration(duration)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}m ${secs}s`;
}
