export type AdminDateRange =
  | "today"
  | "this_week"
  | "this_month"
  | "last_30_days"
  | "all_time";

const OPTIONS: { value: AdminDateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "all_time", label: "All time" },
];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: AdminDateRange;
  onChange: (next: AdminDateRange) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AdminDateRange)}
      className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
