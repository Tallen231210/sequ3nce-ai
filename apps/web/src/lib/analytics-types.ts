// Shared types between the Convex analytics-recommendations query and the
// frontend section components that consume its output. Kept in `src/lib/` so
// it's importable from any UI surface without round-tripping through Convex.

export type SectionKey =
  | "leak.inCallLosses"
  | "leak.uncollected"
  | "leak.noShows"
  | "whereYouLosing"
  | "whoIsLosing"
  | "leadQuality";

export type Recommendation = {
  id: string;
  section: SectionKey;
  severity: "high" | "medium" | "low";
  headline: string;
  detail?: string;
  action?: { label: string; href: string };
};

export type RecommendationBundle = {
  bySection: Record<SectionKey, Recommendation | null>;
  top: Recommendation[];
};
