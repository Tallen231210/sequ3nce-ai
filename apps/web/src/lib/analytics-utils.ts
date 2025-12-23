// Analytics utility functions

export type DateRangeOption = {
  value: string;
  label: string;
};

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
];

export const OUTCOME_OPTIONS = [
  { value: "all", label: "All Outcomes" },
  { value: "closed", label: "Closed" },
  { value: "not_closed", label: "Lost" },
  { value: "rescheduled", label: "Follow-up" },
];

// Format currency for display
export function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

// Format large currency with full number
export function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format percentage
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Format trend indicator with arrow
export function formatTrend(trend: number): { text: string; isPositive: boolean; isNeutral: boolean } {
  if (Math.abs(trend) < 0.5) {
    return { text: "—", isPositive: false, isNeutral: true };
  }

  const arrow = trend > 0 ? "↑" : "↓";
  const text = `${arrow} ${Math.abs(trend).toFixed(0)}%`;

  return {
    text,
    isPositive: trend > 0,
    isNeutral: false,
  };
}

// Format trend for metrics where down is good (like "left on table")
export function formatTrendInverse(trend: number): { text: string; isPositive: boolean; isNeutral: boolean } {
  const result = formatTrend(trend);
  if (!result.isNeutral) {
    result.isPositive = !result.isPositive;
  }
  return result;
}

// Get CSS classes for trend indicators
export function getTrendClasses(isPositive: boolean, isNeutral: boolean): string {
  if (isNeutral) return "text-muted-foreground";
  return isPositive ? "text-green-600" : "text-red-600";
}

// Format objection label for display
export function formatObjectionLabel(objection: string): string {
  const labels: Record<string, string> = {
    spouse_partner: "Spouse/Partner",
    price_money: "Price/Money",
    timing: "Timing",
    need_to_think: "Need to think about it",
    not_qualified: "Not qualified / Bad lead",
    logistics: "Logistics",
    competitor: "Went with competitor",
    no_show_ghosted: "No-show / Ghosted",
    other: "Other",
    unknown: "Unknown",
  };

  return labels[objection] || objection;
}

// Get bar width percentage for horizontal bar charts (capped at 100%)
export function getBarWidth(value: number, maxValue: number): number {
  if (maxValue === 0) return 0;
  return Math.min((value / maxValue) * 100, 100);
}

// Get color classes for overcome rate
export function getOvercomeRateColor(rate: number): string {
  if (rate >= 70) return "text-green-600 bg-green-50";
  if (rate >= 50) return "text-yellow-600 bg-yellow-50";
  return "text-red-600 bg-red-50";
}

// Get color classes for lead quality score
export function getLeadQualityColor(score: number): string {
  if (score >= 7) return "text-green-600";
  if (score >= 5) return "text-yellow-600";
  return "text-red-600";
}

// Category badge colors for recommendations
export function getRecommendationCategoryColor(category: string): string {
  switch (category) {
    case "SALES TEAM":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "SALES PROCESS":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "CLOSER-SPECIFIC":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "LEAD QUALITY":
      return "bg-green-100 text-green-700 border-green-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}
