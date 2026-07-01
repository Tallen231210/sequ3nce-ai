import { cn } from "@/lib/utils";

/**
 * MetricTile / TileGroup — the bordered sub-box and its shared-border grouping.
 *
 * Replaces the assorted `p-4 bg-zinc-50 rounded-lg` and `p-4 border rounded-lg`
 * boxes each section used to hand-roll. TileGroup renders a hairline-separated
 * grid (the `gap-px` on a zinc background is the seam between tiles) so a row
 * of related metrics reads as one unit rather than floating cards.
 */
export function TileGroup({
  columns = 2,
  className,
  children,
}: {
  columns?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function MetricTile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("bg-white p-4", className)}>{children}</div>;
}
