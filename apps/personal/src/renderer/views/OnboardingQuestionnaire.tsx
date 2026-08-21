import React, { useState } from 'react';
import type { CloserInfo } from '../convex';
import { completeOnboarding } from '../convex';
import logoImage from '../../assets/logo.png';

interface OnboardingQuestionnaireProps {
  closerInfo: CloserInfo;
  onComplete: (updatedInfo: CloserInfo) => void;
}

const STEPS = [
  {
    // "Where did you find us?" died with the funnel launch — buyers come
    // through a sales call and their source is already on the lead record.
    // A goal is something we can actually act on.
    question: 'What\'s your #1 goal for the next 90 days?',
    subtitle: 'We\'ll point you at the right things first.',
    key: 'source', // stored in the legacy source field, values prefixed goal_
    options: [
      { value: 'goal_land_first_seat', label: 'Land my first commission seat' },
      { value: 'goal_better_offer', label: 'Move to a better offer' },
      { value: 'goal_close_more', label: 'Close more on my current offer' },
      { value: 'goal_build_record', label: 'Build a verified track record' },
    ],
  },
  {
    question: 'How much are you currently making as a closer?',
    subtitle: 'Per month. This helps us tailor your experience.',
    key: 'income',
    options: [
      { value: '0-1k', label: '$0 – $1,000' },
      { value: '2-5k', label: '$2,000 – $5,000' },
      { value: '5-10k', label: '$5,000 – $10,000' },
      { value: '10-20k', label: '$10,000 – $20,000' },
      { value: '20k+', label: '$20,000+' },
    ],
  },
  {
    question: 'What are you struggling most with?',
    subtitle: 'We\'ll help you tackle this.',
    key: 'struggle',
    options: [
      { value: 'finding_offer', label: 'Finding a better offer to close on' },
      { value: 'networking', label: 'Networking and making friends in the industry' },
      { value: 'improving_skills', label: 'Improving your skills' },
      { value: 'staying_consistent', label: 'Staying consistent and motivated' },
    ],
  },
] as const;

export function OnboardingQuestionnaire({ closerInfo, onComplete }: OnboardingQuestionnaireProps) {
  const [showWelcome, setShowWelcome] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStep = STEPS[step];
  const selectedValue = answers[currentStep.key] || null;
  const isLastStep = step === STEPS.length - 1;

  const handleSelect = (value: string) => {
    setAnswers((prev) => ({ ...prev, [currentStep.key]: value }));
  };

  const handleNext = async () => {
    if (!selectedValue) return;

    if (isLastStep) {
      setIsSubmitting(true);
      const result = await completeOnboarding(
        closerInfo.b2cUserId!,
        answers.source,
        answers.income,
        answers.struggle,
      );
      setIsSubmitting(false);

      if (result.success) {
        onComplete({ ...closerInfo, onboardingCompleted: true });
      }
    } else {
      setStep(step + 1);
    }
  };

  if (showWelcome) {
    return (
      <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
        <div className="titlebar h-8 shrink-0" />
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <img src={logoImage} alt="Sequ3nce" className="h-16 mb-8 dark-invert" />
          <h1 className="text-3xl font-bold text-center mb-3">
            Welcome to the stack{closerInfo.name ? `, ${closerInfo.name.split(' ')[0]}` : ''}.
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8 max-w-md">
            Everything you were promised lives right here. Two quick questions
            first, then you&apos;re in.
          </p>
          <div className="w-full max-w-md space-y-3 mb-10">
            {[
              ['Six-week closing program', 'Community → Training. Start with module 1 today.'],
              ['Weekly live coaching calls', 'Run inside the app by our head coach — schedule is in Community.'],
              ['The room', 'Closers running real floors. Ask anything, any hour.'],
              ['Your verified track record', 'Every call recorded, analysed and scored — it builds from your first call.'],
            ].map(([title, sub]) => (
              <div key={title} className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                <svg className="w-5 h-5 mt-0.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowWelcome(false)}
            className="w-full max-w-md py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:opacity-80 transition-opacity"
          >
            Let&apos;s go
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Draggable titlebar */}
      <div className="titlebar h-8 shrink-0" />

      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Logo */}
        <img src={logoImage} alt="Sequ3nce" className="h-24 mb-10 dark-invert" />

        {/* Progress dots */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step
                  ? 'bg-gray-900 dark:bg-white'
                  : i < step
                    ? 'bg-gray-400 dark:bg-gray-500'
                    : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Question */}
        <h1 className="text-2xl font-bold text-center mb-1">
          {currentStep.question}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
          {currentStep.subtitle}
        </p>

        {/* Options */}
        <div className="w-full max-w-sm space-y-2">
          {currentStep.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                selectedValue === option.value
                  ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Continue button */}
        <button
          onClick={handleNext}
          disabled={!selectedValue || isSubmitting}
          className="mt-8 w-full max-w-sm py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:opacity-80 disabled:opacity-30 transition-opacity"
        >
          {isSubmitting ? 'Saving...' : isLastStep ? 'Get Started' : 'Continue'}
        </button>

        {/* Step counter */}
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          {step + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
