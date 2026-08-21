"use client";

// No Reps tab: it rendered the same cards as Overview minus the hero. A tab
// that duplicates another exists only to be clicked once and distrusted.
export const MANAGER_TABS = [
  { key: "overview", label: "Overview" },
  { key: "meetings", label: "Meetings" },
  { key: "clips", label: "Clips" },
  { key: "eod", label: "EOD Report" },
  { key: "settings", label: "Settings" },
] as const;

export type ManagerTab = (typeof MANAGER_TABS)[number]["key"];

/**
 * Underlined tabs rather than pills, matching the rest of the dashboard.
 *
 * Counts sit next to the label where the number is the point — a manager
 * wants to see there are three recordings waiting without opening the tab.
 */
export function TabBar({
  active,
  onChange,
  counts,
}: {
  active: ManagerTab;
  onChange: (t: ManagerTab) => void;
  counts?: Partial<Record<ManagerTab, number>>;
}) {
  return (
    <div className="flex gap-1 border-b border-border">
      {MANAGER_TABS.map((t) => {
        const isActive = t.key === active;
        const count = counts?.[t.key];
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={
              "relative px-3.5 py-2.5 text-sm transition-colors " +
              (isActive
                ? "font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
            {count !== undefined && count > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {count}
              </span>
            )}
            {isActive && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );
}
