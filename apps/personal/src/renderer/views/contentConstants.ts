// Shared constants for Content Submissions feature

export const CATEGORIES = [
  { value: 'objection_handle', label: 'Objection Handle' },
  { value: 'funny_moment', label: 'Funny Moment' },
  { value: 'great_close', label: 'Great Close' },
  { value: 'motivational', label: 'Motivational' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'other', label: 'Other' },
] as const;

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
);

export const PAYMENT_METHODS = [
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'cashapp', label: 'CashApp' },
] as const;

export const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: 'Pending' },
  approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Approved' },
  rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Rejected' },
  paid: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Paid' },
};

export function formatSubmissionDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
