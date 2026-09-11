"use client";

/** What this page can't measure for this team, one sentence each. Settings only. */
export function CoveragePanel({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="rounded-lg border border-dashed border-border p-4">
      <h3 className="text-sm font-semibold">Not on this page</h3>
      <p className="text-xs text-muted-foreground">Things this team&apos;s tools can&apos;t tell us. They&apos;re left out rather than shown as a zero.</p>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
