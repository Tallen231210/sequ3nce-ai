import type { SetupTaskConfig, SetupTaskId } from './types';

// Single source of truth for setup task copy + deep-link targets. Earn rows
// are built dynamically from live state, so they don't have a static config
// equivalent here — see EarnSection.tsx for that logic.
export const SETUP_TASKS: SetupTaskConfig[] = [
  {
    id: 'profile',
    title: 'Complete your public profile',
    description: 'Slug, photo, headline, and at least one industry. ~90 seconds.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'tab', tabId: 'profile' },
    bannerCopy: "Fill in your slug, photo, headline, and at least one industry — then Save.",
  },
  {
    id: 'firstCall',
    title: 'Record your first call with the bot',
    description: 'Quick Bot adds the recorder to any meeting URL — analysis runs automatically.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'modal', modalId: 'quickBot' },
    bannerCopy: "Paste any meeting URL → the bot auto-records + analyzes when the call starts.",
  },
  {
    id: 'highlightClip',
    title: 'Create a highlight clip',
    description: 'Pull the best 30 seconds out of any call — ready to share or submit for cash.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'tab', tabId: 'calls' },
    bannerCopy: "Open any call → drag to select a moment on the timeline → \"Save as highlight.\"",
  },
  {
    id: 'coachingCall',
    title: 'Join a coaching call (or watch a replay)',
    description: 'Drop in on a live coaching session, or pull up a past one.',
    ctaLabel: 'Try it now →',
    ctaTarget: { kind: 'subview', tabId: 'community', subview: 'coaching' },
    bannerCopy: "Join any upcoming coaching call, or watch a replay of a past one.",
  },
  // The 'stream' task was removed 2026-08-25 when Sequ3nce Stream was hidden
  // (Churp owns dictation). Saved progress with a stream key is ignored by
  // every consumer — they all iterate this array.
];

export function getSetupTask(id: SetupTaskId): SetupTaskConfig {
  const task = SETUP_TASKS.find((t) => t.id === id);
  if (!task) throw new Error(`Unknown setup task: ${id}`);
  return task;
}
