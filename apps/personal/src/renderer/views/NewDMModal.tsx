import React, { useState, useEffect, useRef } from 'react';
import type { DMThread } from '../convex';
import { getCommunityMembers } from '../convex';
import type { CommunityMember } from './community/types';
import { getInitials, getAvatarGradient } from './community/types';

interface NewDMModalProps {
  userId: string;
  existingThreads: DMThread[];
  onlineUserIds: Set<string>;
  onSelect: (memberId: string, memberName: string, memberPhotoUrl: string | null) => void;
  onClose: () => void;
}

export function NewDMModal({
  userId,
  existingThreads,
  onlineUserIds,
  onSelect,
  onClose,
}: NewDMModalProps) {
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadMembers();
    inputRef.current?.focus();
  }, []);

  const loadMembers = async (searchTerm?: string) => {
    setLoading(true);
    const result = await getCommunityMembers(50, searchTerm);
    // Filter out self
    const filtered = result.members.filter((m) => m.userId !== userId);
    setMembers(filtered);
    setLoading(false);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadMembers(value || undefined);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[380px] max-h-[500px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">New Message</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search members..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
            />
          </div>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">Loading...</div>
          ) : members.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
              {search ? 'No members found' : 'No members yet'}
            </div>
          ) : (
            members.map((member) => {
              const initials = getInitials(member.name);
              const gradient = getAvatarGradient(member.name);
              const isOnline = onlineUserIds.has(member.userId);

              return (
                <button
                  key={member.userId}
                  onClick={() => onSelect(member.userId, member.name, member.photoUrl)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  {/* Avatar with online dot */}
                  <div className="relative shrink-0">
                    {member.photoUrl ? (
                      <img src={member.photoUrl} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-xs`}>
                        {initials}
                      </div>
                    )}
                    {isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
                    )}
                  </div>

                  {/* Name + headline */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{member.name}</div>
                    {member.headline && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.headline}</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
