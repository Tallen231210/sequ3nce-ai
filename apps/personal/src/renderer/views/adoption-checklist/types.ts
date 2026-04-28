export type SetupTaskId =
  | 'profile'
  | 'firstCall'
  | 'highlightClip'
  | 'coachingCall'
  | 'stream';

export type EarnTaskId = 'moneyBells' | 'creatorCash' | 'testimonial';

export type TaskId = SetupTaskId | EarnTaskId;

// Where the "Try it now →" CTA sends the user.
export type CtaTarget =
  | { kind: 'tab'; tabId: string }
  | { kind: 'modal'; modalId: 'quickBot' | 'stream' }
  | { kind: 'subview'; tabId: string; subview: string };

export interface SetupTaskConfig {
  id: SetupTaskId;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTarget: CtaTarget;
  bannerCopy: string;
}
