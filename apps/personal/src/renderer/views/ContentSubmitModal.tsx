import React, { useState, useRef, useEffect } from 'react';
import { submitClipForContent, submitTestimonialForContent } from '../convex';
import { CATEGORIES, PAYMENT_METHODS } from './contentConstants';

const CONSENT_TEXT =
  'I confirm this is my call and I grant Sequ3nce permission to edit and repost this clip on social media.';

interface ContentSubmitModalProps {
  type: 'clip' | 'testimonial';
  clipId?: string;
  clipLabel?: string;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ContentSubmitModal({
  type,
  clipId,
  clipLabel,
  userId,
  onClose,
  onSubmitted,
}: ContentSubmitModalProps) {
  const [label, setLabel] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0].value);
  const [paymentHandle, setPaymentHandle] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const canSubmit =
    consentGiven &&
    paymentHandle.trim().length > 0 &&
    !submitting &&
    (type === 'clip' ? !!clipId : label.trim().length > 0 && videoUrl.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const trimmedNote = note.trim() || undefined;

    let result: { success: boolean; error?: string };
    if (type === 'clip' && clipId) {
      result = await submitClipForContent(
        userId, clipId, category, paymentHandle.trim(), paymentMethod, consentGiven, trimmedNote
      );
    } else {
      result = await submitTestimonialForContent(
        userId, label.trim(), videoUrl.trim(), category, paymentHandle.trim(), paymentMethod, consentGiven, trimmedNote
      );
    }

    if (!mountedRef.current) return;
    setSubmitting(false);

    if (result.success) {
      onSubmitted();
    } else {
      setError(result.error || 'Failed to submit');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[440px] max-h-[620px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {type === 'clip' ? 'Submit Clip for Content' : 'Submit Testimonial'}
            </h3>
            {type === 'clip' && clipLabel && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[340px]">
                {clipLabel}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Testimonial-only fields */}
          {type === 'testimonial' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value.slice(0, 100))}
                  placeholder="e.g. Why I love Sequ3nce"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Video URL</label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value.slice(0, 500))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                />
              </div>
            </>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Note <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Any context for the reviewer..."
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 resize-none"
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
            <div className="flex gap-2">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm.value}
                  onClick={() => setPaymentMethod(pm.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    paymentMethod === pm.value
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payment handle */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {PAYMENT_METHODS.find(p => p.value === paymentMethod)?.label || paymentMethod} Handle
            </label>
            <input
              type="text"
              value={paymentHandle}
              onChange={(e) => setPaymentHandle(e.target.value.slice(0, 100))}
              placeholder={`Your ${PAYMENT_METHODS.find(p => p.value === paymentMethod)?.label || paymentMethod} username or email`}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400"
            />
          </div>

          {/* Consent */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              {CONSENT_TEXT}
            </span>
          </label>

          {error && <div className="text-xs text-red-500">{error}</div>}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-2.5 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </button>
        </div>
      </div>
    </div>
  );
}
