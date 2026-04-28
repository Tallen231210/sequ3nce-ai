import React from 'react';
import { TaskRow } from './TaskRow';
import type { AdoptionChecklistData } from '../../convex';
import type { CtaTarget } from './types';

interface EarnSectionProps {
  earn: AdoptionChecklistData['earn'];
  onCta: (target: CtaTarget) => void;
}

// Earn rows are dynamic — the title and description reflect live backend
// state (current Money Bells rank, lifetime Creator Cash earnings,
// testimonial review status). Rows never display a "complete" checkmark
// because the opportunities recur monthly / continuously.
export function EarnSection({ earn, onCta }: EarnSectionProps) {
  const moneyBellsCta = { kind: 'subview' as const, tabId: 'community', subview: 'moneyBells' };
  const creatorCashCta = { kind: 'tab' as const, tabId: 'rewards' };
  const testimonialCta = { kind: 'tab' as const, tabId: 'rewards' };

  // ----- Money Bells row -----
  const mb = earn.moneyBells;
  const moneyBellsTitle = mb.optedIn
    ? mb.currentRank !== null
      ? `Money Bells · ${mb.monthLabel} · #${mb.currentRank} of ${mb.totalParticipants}`
      : `Money Bells · ${mb.monthLabel} · Not on the leaderboard yet`
    : 'Money Bells';
  const moneyBellsDescription = mb.optedIn
    ? `${mb.daysRemaining}d left this month — broadcast another deal to climb`
    : 'Opt in and broadcast closed deals to compete for monthly cash prizes';
  const moneyBellsCtaLabel = mb.optedIn ? 'Broadcast →' : 'Opt in →';

  // ----- Creator Cash row -----
  const cc = earn.creatorCash;
  const creatorCashTitle =
    cc.approvedCount > 0
      ? `Creator Cash · $${cc.totalEarned} from ${cc.approvedCount} approved clip${cc.approvedCount === 1 ? '' : 's'}`
      : 'Creator Cash';
  const creatorCashDescription =
    cc.approvedCount > 0
      ? 'Submit another clip — earn $20–30 per approved'
      : 'Submit a highlight clip — earn $20–30 per approved';

  // ----- Testimonial row -----
  const t = earn.testimonial;
  let testimonialTitle: string;
  let testimonialDescription: string;
  if (!t) {
    testimonialTitle = 'Testimonial';
    testimonialDescription = 'Submit a testimonial video for review';
  } else if (t.status === 'pending') {
    const days = Math.max(1, Math.floor((Date.now() - t.submittedAt) / 86_400_000));
    testimonialTitle = 'Testimonial · Pending review';
    testimonialDescription = `Submitted ${days}d ago — we'll let you know`;
  } else if (t.status === 'paid') {
    testimonialTitle = `Testimonial · Earned $${t.paidAmount ?? 0}`;
    testimonialDescription = 'Submit another testimonial';
  } else if (t.status === 'approved') {
    testimonialTitle = 'Testimonial · Approved (payment pending)';
    testimonialDescription = 'Hang tight — payment processing';
  } else {
    // rejected
    testimonialTitle = 'Testimonial · Rejected';
    testimonialDescription = 'Submit a new testimonial video';
  }

  return (
    <div>
      <div className="px-3 pt-3 pb-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Earn through Sequ3nce
        </div>
      </div>
      <div className="px-1 pb-2">
        <TaskRow
          complete={false}
          title={moneyBellsTitle}
          description={moneyBellsDescription}
          cta={{ label: moneyBellsCtaLabel, onClick: () => onCta(moneyBellsCta) }}
        />
        <TaskRow
          complete={false}
          title={creatorCashTitle}
          description={creatorCashDescription}
          cta={{ label: 'Submit →', onClick: () => onCta(creatorCashCta) }}
        />
        <TaskRow
          complete={false}
          title={testimonialTitle}
          description={testimonialDescription}
          cta={
            !t || t.status === 'paid' || t.status === 'rejected'
              ? { label: 'Submit →', onClick: () => onCta(testimonialCta) }
              : undefined
          }
        />
      </div>
    </div>
  );
}
