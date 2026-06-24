interface DashboardStats {
  callsToday: number;
  liveNow: number;
  closeRateWeek: number;
  noShowsWeek: number;
}

export function PerformanceKpis({
  stats,
}: {
  stats: DashboardStats | undefined;
}) {
  if (!stats) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded border bg-zinc-50 p-3">
            <div className="h-4 w-16 animate-pulse rounded bg-zinc-200" />
            <div className="mt-2 h-7 w-12 animate-pulse rounded bg-zinc-200" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-3">
      <Kpi label="Calls today" value={stats.callsToday} />
      <Kpi label="Live now" value={stats.liveNow} />
      <Kpi
        label="Close rate (7d)"
        value={`${stats.closeRateWeek.toFixed(0)}%`}
      />
      <Kpi label="No-shows (7d)" value={stats.noShowsWeek} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border bg-zinc-50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
