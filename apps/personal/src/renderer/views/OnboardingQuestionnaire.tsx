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
    question: 'Where did you find us?',
    subtitle: 'This helps us understand what\'s working.',
    key: 'source',
    options: [
      { value: 'instagram', label: 'Instagram' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'google', label: 'Google' },
      { value: 'referral', label: 'Referral' },
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
