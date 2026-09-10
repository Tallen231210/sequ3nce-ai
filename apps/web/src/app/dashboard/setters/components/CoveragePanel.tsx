"use client";

/** What this page cannot measure for this team, in one sentence each — hidden, never a zero. */
export function CoveragePanel({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
      <h2 className="text-sm font-semibold">What isn't shown here, and why</h2>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
    </section>
  );
}
