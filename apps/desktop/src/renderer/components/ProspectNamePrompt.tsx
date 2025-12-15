import React, { useState, useEffect, useRef } from 'react';

interface ProspectNamePromptProps {
  suggestedName?: string | null;
  source?: string | null; // "calendly", "google", "manual", etc.
  onSubmit: (name: string) => void;
  onDismiss?: () => void;
}

export function ProspectNamePrompt({
  suggestedName,
  source,
  onSubmit,
  onDismiss,
}: ProspectNamePromptProps) {
  const [name, setName] = useState(suggestedName || '');
  const [isEditing, setIsEditing] = useState(!suggestedName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update name if suggestion changes
  useEffect(() => {
    if (suggestedName && !name) {
      setName(suggestedName);
      setIsEditing(false);
    }
  }, [suggestedName]);

  // Auto-focus the input when editing
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape' && onDismiss) {
      onDismiss();
    }
  };

  const getSourceLabel = () => {
    switch (source) {
      case 'calendly':
        return 'From Calendly';
      case 'google':
        return 'From Google Calendar';
      default:
        return 'Scheduled call';
    }
  };

  // If we have a suggested name, show confirmation UI
  if (suggestedName && !isEditing) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 animate-fadeIn">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{name}</p>
              <p className="text-xs text-gray-500">{getSourceLabel()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleSubmit}
              className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded-md hover:bg-gray-800 transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show input field for manual entry or editing
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 animate-fadeIn">
      <p className="text-xs text-gray-500 mb-2">Who are you calling?</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter prospect name"
          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all"
          autoFocus
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </form>
      {suggestedName && (
        <button
          onClick={() => {
            setName(suggestedName);
            setIsEditing(false);
          }}
          className="mt-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Use suggested: {suggestedName}
        </button>
      )}
    </div>
  );
}
