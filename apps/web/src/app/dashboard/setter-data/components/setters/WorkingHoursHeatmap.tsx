"use client";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WorkingHoursHeatmapProps {
  /** 7×24 grid: outer index = day-of-week (0=Sun), inner = hour (0-23). */
  heatmap: number[][];
  timezone: string;
}

/**
 * 7×24 heatmap of dial activity by day-of-week × hour-of-day in the
 * team's timezone. Color intensity scales linearly with the cell's
 * count vs. the global max — fully transparent for 0 dials, solid
 * primary color for the busiest cell. Hover surfaces the exact count.
 *
 * No chart library — just a CSS grid with Tailwind opacity classes.
 * Charts libraries don't render this pattern well; custom HTML beats
 * recharts/Tremor for fixed-grid heatmaps.
 */
export function WorkingHoursHeatmap({
  heatmap,
  timezone,
}: WorkingHoursHeatmapProps) {
  // Determine global max for color normalization. If every cell is 0,
  // the entire grid will render as the empty-state background.
  let max = 0;
  for (const row of heatmap) {
    for (const v of row) {
      if (v > max) max = v;
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Working hours</div>
          <p className="text-xs text-muted-foreground">
            Outbound dials by day × hour ({timezone}). Darker = busier.
          </p>
        </div>
        {max > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>0</span>
            <div className="flex h-2 w-24 overflow-hidden rounded-full">
              {[0.1, 0.25, 0.5, 0.75, 1].map((opacity, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{
                    backgroundColor: `hsl(var(--primary) / ${opacity})`,
                  }}
                />
              ))}
            </div>
            <span>{max}</span>
          </div>
        )}
      </div>

      {max === 0 ? (
        <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No dial activity for this setter in the selected range.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: "auto repeat(24, minmax(18px, 1fr))" }}>
            {/* Header row — hour labels every 3 hours */}
            <div />
            {Array.from({ length: 24 }).map((_, hour) => (
              <div
                key={hour}
                className="text-center text-[9px] text-muted-foreground"
              >
                {hour % 3 === 0 ? formatHour(hour) : ""}
              </div>
            ))}

            {/* Data rows — one per day */}
            {DAY_LABELS.map((day, dow) => (
              <DayRow key={day} day={day} hours={heatmap[dow] ?? []} max={max} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayRow({
  day,
  hours,
  max,
}: {
  day: string;
  hours: number[];
  max: number;
}) {
  return (
    <>
      <div className="pr-1 text-right text-[10px] font-medium text-muted-foreground self-center">
        {day}
      </div>
      {hours.map((count, hour) => {
        const opacity = max > 0 ? count / max : 0;
        const title =
          count === 0
            ? `${day} ${formatHour(hour)} — no dials`
            : `${day} ${formatHour(hour)} — ${count} dial${count === 1 ? "" : "s"}`;
        return (
          <div
            key={hour}
            title={title}
            className="aspect-square rounded-sm border border-border/50"
            style={{
              backgroundColor:
                count > 0
                  ? `hsl(var(--primary) / ${0.1 + opacity * 0.9})`
                  : undefined,
            }}
          />
        );
      })}
    </>
  );
}

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}
