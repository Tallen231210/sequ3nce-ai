import { expect, test } from '@playwright/test';
import {
  areDuplicateJobs,
  consolidateDuplicateJobs,
  type DedupeableJob,
} from '../../src/freehire-dedupe';

function job(overrides: Partial<DedupeableJob> = {}): DedupeableJob {
  return {
    id: 'job-1',
    title: 'High Ticket Sales Closer',
    company: 'Home Genius Exteriors',
    location: 'United States',
    description: 'Join our growing sales organization and meet qualified homeowners every day with training, coaching, benefits, advancement, leadership, and uncapped earning potential.',
    applyUrl: 'https://www.indeed.com/viewjob?jk=duplicate-role&utm_source=freehire.me',
    source: 'Indeed',
    workMode: 'remote',
    countries: ['us'],
    sources: ['Indeed'],
    duplicateIds: [],
    logoUrl: '',
    salary: 'USD 100,000–300,000',
    ...overrides,
  };
}

test.describe('FreeHire duplicate consolidation', () => {
  test('combines matching listings and prefers a direct ATS application', () => {
    const direct = job({
      id: 'job-2',
      title: 'High Ticket Sales Closing Expert',
      applyUrl: 'https://boards.greenhouse.io/homegenius/jobs/12345?gh_src=freehire',
      source: 'Greenhouse',
    });
    const results = consolidateDuplicateJobs([job(), direct], { preserveFirstId: true });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('job-1');
    expect(results[0].applyUrl).toContain('greenhouse.io');
    expect(results[0].sources).toEqual(['Greenhouse', 'Indeed']);
    expect(results[0].duplicateIds).toEqual(['job-2']);
  });

  test('keeps regional openings separate', () => {
    const florida = job({ location: 'Miami, FL', countries: ['us'] });
    const texas = job({
      id: 'job-2',
      location: 'Austin, TX',
      countries: ['us'],
      applyUrl: 'https://boards.greenhouse.io/homegenius/jobs/67890',
      source: 'Greenhouse',
    });

    expect(areDuplicateJobs(florida, texas)).toBe(false);
    expect(consolidateDuplicateJobs([florida, texas])).toHaveLength(2);
  });

  test('does not combine different roles that share a generic application URL', () => {
    const closer = job({ applyUrl: 'https://example.com/careers' });
    const manager = job({
      id: 'job-2',
      title: 'Regional Sales Manager',
      description: 'Own a regional team, coach account executives, forecast pipeline, manage performance, plan territories, recruit sellers, and present weekly revenue results to leadership.',
      applyUrl: 'https://example.com/careers',
    });

    expect(areDuplicateJobs(closer, manager)).toBe(false);
    expect(consolidateDuplicateJobs([closer, manager])).toHaveLength(2);
  });

  test('normalizes tracking parameters on otherwise identical application URLs', () => {
    const first = job({ applyUrl: 'https://jobs.example.com/roles/closer?id=123&utm_source=indeed' });
    const second = job({
      id: 'job-2',
      applyUrl: 'https://jobs.example.com/roles/closer?utm_campaign=sales&id=123',
      source: 'Company careers',
    });

    expect(areDuplicateJobs(first, second)).toBe(true);
    expect(consolidateDuplicateJobs([first, second])).toHaveLength(1);
  });
});
