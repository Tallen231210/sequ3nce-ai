/**
 * Allowlist of Sequ3nce founders/staff with access to /admin.
 *
 * Kept in sync with FOUNDER_EMAILS in apps/web/convex/admin.ts — if you
 * change one, change the other in the same PR. Convex bundles separately
 * from the Next.js app so it can't import from src/.
 *
 * Defense in depth: this lib is only consulted by /admin/layout.tsx for
 * the page-level redirect. The actual security boundary is the
 * assertFounder helper in convex/admin.ts which runs on every admin
 * query — never trust the client.
 */
export const FOUNDER_EMAILS: ReadonlySet<string> = new Set([
  "tadigitalsmm@gmail.com",
]);

export function isFounder(email: string | null | undefined): boolean {
  if (!email) return false;
  return FOUNDER_EMAILS.has(email.toLowerCase().trim());
}
