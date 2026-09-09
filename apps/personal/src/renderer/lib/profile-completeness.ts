// ============================================================================
// Profile completeness — the nine-step bar on the Profile tab, extracted so
// the job board can nudge with the same number the profile shows. Pure.
// The server-side twin (convex/b2cMemberActivity.ts) uses the same nine
// steps so the founder digest and the app never disagree.
// ============================================================================

export interface ProfileCompletionInput {
  photo?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  industries?: string[] | null;
  ticketRange?: string | null;
  skills?: string[] | null;
  socialLinks?: Record<string, string | null | undefined> | null;
  profileSlug?: string | null;
}

export interface ProfileCompletion {
  pct: number;
  completed: number;
  total: number;
  /** Human labels of what's still empty, in display order. */
  missing: string[];
}

const STEPS: Array<[keyof ProfileCompletionInput, string, (p: ProfileCompletionInput) => boolean]> = [
  ['photo', 'a photo', (p) => !!p.photo],
  ['headline', 'a headline', (p) => !!p.headline?.trim()],
  ['bio', 'an about section', (p) => !!p.bio?.trim()],
  ['location', 'your location', (p) => !!p.location?.trim()],
  ['industries', 'your industries', (p) => (p.industries?.length ?? 0) > 0],
  ['ticketRange', 'a ticket range', (p) => !!p.ticketRange],
  ['skills', 'your skills', (p) => (p.skills?.length ?? 0) > 0],
  ['socialLinks', 'a social link', (p) => Object.values(p.socialLinks ?? {}).some((v) => !!v)],
  ['profileSlug', 'your profile URL', (p) => !!p.profileSlug],
];

export function profileCompletion(input: ProfileCompletionInput): ProfileCompletion {
  const missing: string[] = [];
  let completed = 0;
  for (const [, label, done] of STEPS) {
    if (done(input)) completed += 1;
    else missing.push(label);
  }
  return {
    pct: Math.round((completed / STEPS.length) * 100),
    completed,
    total: STEPS.length,
    missing,
  };
}

/** Below this the job board nudges toward finishing the profile. */
export const PROFILE_NUDGE_THRESHOLD_PCT = 60;
