import React, { useState, useRef } from 'react';

// ==================== Tag Input Component ====================

interface TagInputProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags: number;
  suggestions: string[];
  placeholder?: string;
}

const INDUSTRY_SUGGESTIONS = [
  'Coaching', 'SaaS', 'Real Estate', 'Info Products', 'E-commerce',
  'Solar', 'Insurance', 'Financial Services', 'Health & Wellness', 'Agency',
];

const SKILL_SUGGESTIONS = [
  'Objection Handling', 'One-Call Closing', 'High-Ticket Closing',
  'Follow-Up Sequences', 'Tonality', 'SPIN Selling', 'Consultative Selling',
  'Inbound Closing', 'Outbound Closing', 'Discovery',
];

const TICKET_RANGES = ['$1k-$3k', '$3k-$10k', '$10k-$25k', '$25k-$50k', '$50k+'];

export { INDUSTRY_SUGGESTIONS, SKILL_SUGGESTIONS, TICKET_RANGES };

export function TagInput({ label, tags, onChange, maxTags, suggestions, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed) || tags.length >= maxTags) return;
    onChange([...tags, trimmed]);
    setInput('');
    setShowSuggestions(false);
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const filteredSuggestions = suggestions.filter(
    (s) => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700 dark:text-zinc-300">
        {label}
        <span className="text-gray-400 dark:text-zinc-500 font-normal ml-1">
          ({tags.length}/{maxTags})
        </span>
      </label>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-medium bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="ml-0.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      {tags.length < maxTags && (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim()) {
                e.preventDefault();
                addTag(input);
              }
            }}
            placeholder={placeholder || `Add ${label.toLowerCase()}...`}
            className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 placeholder-gray-400 dark:placeholder-zinc-500"
          />

          {/* Suggestions dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(suggestion)}
                  className="w-full text-left px-3 py-2 text-[13px] text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Social Links Section ====================

interface SocialLinksProps {
  links: {
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
    calendly?: string;
  };
  onChange: (links: SocialLinksProps['links']) => void;
}

const SOCIAL_FIELDS: { key: keyof SocialLinksProps['links']; label: string; placeholder: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/yourname' },
  { key: 'twitter', label: 'X (Twitter)', placeholder: 'https://x.com/yourhandle' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'website', label: 'Website', placeholder: 'https://yourwebsite.com' },
  { key: 'calendly', label: 'Calendly', placeholder: 'https://calendly.com/yourname' },
];

export function SocialLinksSection({ links, onChange }: SocialLinksProps) {
  return (
    <div className="space-y-3">
      <label className="block text-[13px] font-medium text-gray-700 dark:text-zinc-300">
        Social Links
      </label>
      {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="block text-[12px] text-gray-500 dark:text-zinc-400 mb-1">{label}</label>
          <input
            type="url"
            value={links[key] || ''}
            onChange={(e) => onChange({ ...links, [key]: e.target.value })}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 placeholder-gray-400 dark:placeholder-zinc-500"
          />
        </div>
      ))}
    </div>
  );
}

// ==================== Ticket Range Selector ====================

interface TicketRangeProps {
  value: string | null;
  onChange: (range: string) => void;
}

export function TicketRangeSelector({ value, onChange }: TicketRangeProps) {
  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700 dark:text-zinc-300">
        Ticket Range
      </label>
      <div className="flex flex-wrap gap-2">
        {TICKET_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
              value === range
                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500'
            }`}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}
