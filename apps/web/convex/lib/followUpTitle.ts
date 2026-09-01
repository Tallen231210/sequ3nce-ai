/**
 * Follow-up call detection from the meeting title.
 *
 * Zion's convention (confirmed 2026-09-01): the words "follow up" appear in
 * the call title. We match the spelling variants anywhere in the title,
 * case-insensitively: "follow up", "follow-up", "followup" (any run of
 * spaces/hyphens between the words). "FU" alone is deliberately NOT matched —
 * two letters collide with initials and the setter-tag convention
 * (see lib/setterTitleMatch.ts).
 *
 * Coexists with setter tags: "(er) Follow-up call — John x Ethan" is both
 * setter-attributed to Ethan AND a follow-up.
 */
export function isFollowUpTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  return /follow[\s-]*up/i.test(title);
}
