/**
 * SectionNote — muted, calm rendering of a section's backend-generated
 * insight strings. Replaces the old saturated callout boxes (blue-50 /
 * green-50 / amber-50 with a Lightbulb icon) that made every section shout.
 *
 * Insights are context, not alarms, so they render as quiet zinc notes with a
 * small dot marker. Actionable recommendations (which DO warrant attention)
 * stay in RecommendationCallout with its single amber accent — the contrast
 * between the two is intentional.
 */
export function SectionNote({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-sm text-zinc-600">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}
