import React from 'react';

// Horse-race-style progress bar tuned for the Personal Goal Tracker widget.
// Visual DNA borrowed from MoneyBellsRaceLane but standalone — that component's
// props (rank, photoUrl, userName) don't map to goal semantics.
//
// The runner is absolutely-positioned with left:% + translateX(-50%), which
// keeps the indicator centered on its progress point and animates smoothly via
// a CSS transition on `left`.

export interface GoalProgressBarProps {
  /** 0..1 fraction of progress toward the goal */
  progress: number;
  /** Duration of the goal in whole months — drives landmark placement + labels */
  durationMonths?: number;
  /** Emoji to render as the runner (the goal's own emoji personalizes the bar).
   *  Falls back to 🏇 if not provided. */
  runnerEmoji?: string;
  /** When true, render in the completed-state palette (green fill, no runner). */
  completed?: boolean;
  /** When true, render expired palette (muted). */
  expired?: boolean;
}

// Compute timeline landmarks sized appropriately for the goal's duration.
// Goal is to pick memorable, round labels (1mo, 2mo — not 1.25mo) and fit
// 1-3 intermediate markers without crowding the bar.
function getTimelineLandmarks(
  durationMonths: number
): Array<{ position: number; label: string }> {
  if (durationMonths <= 1) {
    return [
      { position: 0.25, label: '1w' },
      { position: 0.5, label: '2w' },
      { position: 0.75, label: '3w' },
    ];
  }
  if (durationMonths === 2) {
    return [{ position: 0.5, label: '1mo' }];
  }
  if (durationMonths === 3) {
    return [
      { position: 1 / 3, label: '1mo' },
      { position: 2 / 3, label: '2mo' },
    ];
  }
  if (durationMonths === 4) {
    return [
      { position: 0.25, label: '1mo' },
      { position: 0.5, label: '2mo' },
      { position: 0.75, label: '3mo' },
    ];
  }
  // 5+ months — use three quarterly landmarks with rounded month labels
  return [0.25, 0.5, 0.75].map((p) => ({
    position: p,
    label: `${Math.max(1, Math.round(durationMonths * p))}mo`,
  }));
}

export function GoalProgressBar({
  progress,
  durationMonths,
  runnerEmoji,
  completed,
  expired,
}: GoalProgressBarProps) {
  // Clamp 2..98% during active runs so the runner is never clipped at either
  // edge of the track; at 100%+ (completed) we show a full-fill bar instead.
  const pct = completed
    ? 100
    : Math.min(98, Math.max(2, progress * 100));

  const trackColor = completed
    ? 'bg-emerald-500/90'
    : expired
      ? 'bg-gray-200 dark:bg-zinc-800'
      : 'bg-gray-100 dark:bg-zinc-800';

  const fillColor = completed
    ? 'bg-emerald-500'
    : expired
      ? 'bg-gray-300 dark:bg-zinc-700'
      : 'bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300';

  // Outer container has horizontal padding so the runner (24px) and finish
  // line (10px) can render without being clipped by the rounded-full mask on
  // the track. The track itself keeps overflow-hidden for the fill gradient.
  const landmarks = durationMonths ? getTimelineLandmarks(durationMonths) : [];

  return (
    <div>
    <div className="relative h-7 px-3">
      {/* Track + fill — inner element owns overflow-hidden + rounded-full */}
      <div className={`absolute inset-x-3 top-0 bottom-0 rounded-full ${trackColor} overflow-hidden`}>
        {!completed && (
          <div
            className={`absolute top-0 bottom-0 left-0 ${fillColor} opacity-80 transition-all duration-700 ease-out`}
            style={{ width: `${pct}%` }}
          />
        )}
        {completed && <div className={`absolute inset-0 ${fillColor}`} />}

        {/* Tick marks at 25/50/75% for visual milestones (subtle) */}
        {!completed && (
          <>
            <div className="absolute top-1 bottom-1 left-[25%] w-px bg-gray-300 dark:bg-zinc-600 opacity-40" />
            <div className="absolute top-1 bottom-1 left-[50%] w-px bg-gray-300 dark:bg-zinc-600 opacity-50" />
            <div className="absolute top-1 bottom-1 left-[75%] w-px bg-gray-300 dark:bg-zinc-600 opacity-40" />
          </>
        )}

        {/* Completion celebration overlay — lives inside the fill so it's masked to track shape */}
        {completed && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-[13px] font-bold tracking-wide">
            GOAL HIT 🎉
          </div>
        )}
      </div>

      {/* Runner indicator — positioned in the outer (padded) container so it's
          never clipped by the track's rounded-full mask. The `left: pct%` is
          interpolated over the TRACK width (inset-x-3 = 12px padding each side),
          so we compute it inside a nested wrapper whose bounds match the track. */}
      {!completed && (
        <div className="absolute inset-x-3 top-0 bottom-0 pointer-events-none">
          <div
            className="absolute top-1/2 transition-all duration-700 ease-out"
            style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] leading-none shadow-md ${
              expired
                ? 'bg-gray-400 dark:bg-zinc-600 text-white'
                : 'bg-white dark:bg-zinc-100 text-gray-900'
            }`}>
              {runnerEmoji || '🏇'}
            </div>
          </div>
        </div>
      )}

      {/* Finish line — outside the track so the checkered pattern isn't
          clipped by the rounded-full mask. Sits flush to the track's right edge. */}
      {!completed && (
        <div className="absolute right-[8px] top-0 bottom-0 w-2 flex flex-col overflow-hidden rounded-sm pointer-events-none">
          <div className="flex-1 bg-gray-900 dark:bg-white" />
          <div className="flex-1 bg-white dark:bg-zinc-900" />
          <div className="flex-1 bg-gray-900 dark:bg-white" />
          <div className="flex-1 bg-white dark:bg-zinc-900" />
        </div>
      )}
    </div>
    {/* Timeline landmarks underneath the bar — splits the journey into
        memorable chunks so it feels like progress, not one big slog. */}
    {!completed && landmarks.length > 0 && (
      <div className="relative h-4 mx-3 mt-1">
        {landmarks.map((m) => (
          <div
            key={m.label + m.position}
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center gap-0.5"
            style={{ left: `${m.position * 100}%` }}
          >
            <div className="w-px h-1.5 bg-gray-300 dark:bg-zinc-600" />
            <span className="text-[9px] font-mono font-medium text-gray-400 dark:text-gray-500 tabular-nums">
              {m.label}
            </span>
          </div>
        ))}
        {/* End-of-timeline label at 100% */}
        <div
          className="absolute top-0 -translate-x-full flex flex-col items-end gap-0.5"
          style={{ left: '100%' }}
        >
          <div className="w-px h-1.5 bg-gray-300 dark:bg-zinc-600" />
          <span className="text-[9px] font-mono font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
            {durationMonths && durationMonths >= 1
              ? durationMonths >= 12 && durationMonths % 12 === 0
                ? `${durationMonths / 12}yr`
                : `${durationMonths}mo`
              : ''}
          </span>
        </div>
      </div>
    )}
    </div>
  );
}
