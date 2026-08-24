import React, { useEffect, useRef, useState } from 'react';
import { getCommunityMembers } from '../../convex';
import type { CommunityMember } from '../community/types';
import { getAvatarGradient, getInitials } from '../community/types';

interface RecipientMultiSelectProps {
  currentUserId: string;
  selected: CommunityMember[];
  onChange: (members: CommunityMember[]) => void;
}

export function RecipientMultiSelect({ currentUserId, selected, onChange }: RecipientMultiSelectProps) {
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadMembers();
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const loadMembers = async (searchTerm?: string) => {
    setLoading(true);
    const result = await getCommunityMembers(50, searchTerm, undefined, true);
    const filtered = result.members.filter((m) => m.userId !== currentUserId);
    setMembers(filtered);
    setLoading(false);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadMembers(value || undefined);
    }, 300);
  };

  const isSelected = (userId: string) => selected.some((s) => s.userId === userId);

  const toggle = (member: CommunityMember) => {
    if (isSelected(member.userId)) {
      onChange(selected.filter((s) => s.userId !== member.userId));
    } else {
      onChange([...selected, member]);
    }
  };

  const removeChip = (userId: string) => {
    onChange(selected.filter((s) => s.userId !== userId));
  };

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <span
              key={m.userId}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white"
            >
              {m.name}
              <button
                onClick={() => removeChip(m.userId)}
                className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label={`Remove ${m.name}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search members…"
          className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
        />
      </div>

      <div className="max-h-[220px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        {loading ? (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">Loading…</div>
        ) : members.length === 0 ? (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
            {search ? 'No members found' : 'No members yet'}
          </div>
        ) : (
          members.map((member) => {
            const initials = getInitials(member.name);
            const gradient = getAvatarGradient(member.name);
            const active = isSelected(member.userId);
            return (
              <button
                key={member.userId}
                onClick={() => toggle(member)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                  active
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                {member.photoUrl ? (
                  <img src={member.photoUrl} alt={member.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-[10px] shrink-0`}>
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{member.name}</div>
                  {member.headline && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.headline}</div>
                  )}
                </div>
                <span
                  className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                    active
                      ? 'bg-black dark:bg-white border-black dark:border-white'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {active && (
                    <svg className="w-3 h-3 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
