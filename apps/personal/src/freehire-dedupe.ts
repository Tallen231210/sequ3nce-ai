export interface DedupeableJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string;
  source: string;
  workMode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  countries: string[];
  sources?: string[];
  duplicateIds?: string[];
  logoUrl?: string;
  salary?: string;
}

export type ConsolidatedJob<T extends DedupeableJob> = T & {
  sources: string[];
  duplicateIds: string[];
};

const AGGREGATOR_HOSTS = [
  'careerbuilder.com',
  'dice.com',
  'glassdoor.com',
  'indeed.com',
  'jobrapido.com',
  'jooble.org',
  'linkedin.com',
  'monster.com',
  'simplyhired.com',
  'talent.com',
  'ziprecruiter.com',
];

const DIRECT_ATS_HOSTS = [
  'adp.com',
  'applytojob.com',
  'ashbyhq.com',
  'bamboohr.com',
  'greenhouse.io',
  'icims.com',
  'jobvite.com',
  'lever.co',
  'myworkdayjobs.com',
  'oraclecloud.com',
  'paylocity.com',
  'smartrecruiters.com',
  'successfactors.com',
  'workable.com',
  'workdayjobs.com',
];

const DESCRIPTION_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'our', 'that', 'the', 'this', 'to', 'we', 'will', 'with', 'you',
  'your',
]);

export function normalizeJobText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bclosing\b/g, 'closer')
    .replace(/\brepresentative\b/g, 'rep')
    .replace(/\bexecutive\b/g, 'exec')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeJobUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(ref|source|src|gh_src|trk|tracking)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}${url.search}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function applicationLinkScore(job: DedupeableJob): number {
  const host = hostname(job.applyUrl);
  let score = hostMatches(host, DIRECT_ATS_HOSTS) ? 300 : hostMatches(host, AGGREGATOR_HOSTS) ? 0 : 200;
  if (job.description.length >= 800) score += 30;
  else if (job.description.length >= 250) score += 15;
  if (job.logoUrl) score += 5;
  if (job.salary && job.salary !== 'Compensation not listed') score += 5;
  return score;
}

function tokenSet(value: string, limit = Number.POSITIVE_INFINITY): Set<string> {
  return new Set(normalizeJobText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !DESCRIPTION_STOP_WORDS.has(token))
    .slice(0, limit));
}

function similarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function locationSignature(job: DedupeableJob): string {
  const countries = [...new Set(job.countries.map((country) => normalizeJobText(country)).filter(Boolean))].sort();
  const location = normalizeJobText(job.location);
  if (/^(remote|worldwide|global|anywhere|location not listed)$/.test(location)) {
    return `${job.workMode}:${countries.join(',') || location}`;
  }
  return `${job.workMode}:${location}`;
}

export function areDuplicateJobs(left: DedupeableJob, right: DedupeableJob): boolean {
  const company = normalizeJobText(left.company);
  if (!company || company !== normalizeJobText(right.company)) return false;

  const leftTitle = tokenSet(left.title);
  const rightTitle = tokenSet(right.title);
  const titleSimilarity = similarity(leftTitle, rightTitle);
  const leftUrl = normalizeJobUrl(left.applyUrl);
  const rightUrl = normalizeJobUrl(right.applyUrl);
  if (leftUrl && leftUrl === rightUrl) {
    if (titleSimilarity >= 0.5) return true;
    const leftDescription = tokenSet(left.description, 180);
    const rightDescription = tokenSet(right.description, 180);
    return leftDescription.size >= 12
      && rightDescription.size >= 12
      && similarity(leftDescription, rightDescription) >= 0.82;
  }
  if (locationSignature(left) !== locationSignature(right)) return false;

  if (titleSimilarity === 1) return true;
  if (titleSimilarity < 0.72) return false;

  const leftDescription = tokenSet(left.description, 180);
  const rightDescription = tokenSet(right.description, 180);
  return leftDescription.size >= 12
    && rightDescription.size >= 12
    && similarity(leftDescription, rightDescription) >= 0.82;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeJobText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeGroup<T extends DedupeableJob>(members: T[], preserveFirstId: boolean): ConsolidatedJob<T> {
  const preferred = members.reduce((best, candidate) => {
    const scoreDifference = applicationLinkScore(candidate) - applicationLinkScore(best);
    if (scoreDifference !== 0) return scoreDifference > 0 ? candidate : best;
    return candidate.id.localeCompare(best.id) < 0 ? candidate : best;
  });
  const id = preserveFirstId ? members[0].id : preferred.id;
  const sources = uniqueStrings([
    preferred.source,
    ...(preferred.sources ?? []),
    ...members.flatMap((member) => [member.source, ...(member.sources ?? [])]),
  ]);
  const duplicateIds = uniqueStrings([
    ...members.flatMap((member) => [member.id, ...(member.duplicateIds ?? [])]),
  ]).filter((candidateId) => candidateId !== id);
  return { ...preferred, id, sources, duplicateIds };
}

/**
 * Conservatively combines the same opportunity when it appears more than once.
 * Regional openings remain separate unless they share the exact application URL.
 */
export function consolidateDuplicateJobs<T extends DedupeableJob>(
  jobs: T[],
  options: { preserveFirstId?: boolean } = {},
): Array<ConsolidatedJob<T>> {
  const groups: T[][] = [];
  for (const job of jobs) {
    const group = groups.find((candidateGroup) => candidateGroup.some((candidate) => areDuplicateJobs(candidate, job)));
    if (group) group.push(job);
    else groups.push([job]);
  }
  return groups.map((group) => mergeGroup(group, options.preserveFirstId === true));
}
