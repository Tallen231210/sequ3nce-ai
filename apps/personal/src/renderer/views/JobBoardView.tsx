import React, { useState, useEffect, useCallback } from 'react';
import type { CloserInfo, JobPosting, JobInterest } from '../convex';
import {
  getOpenJobPostings,
  getMyJobInterests,
  expressJobInterest,
  withdrawJobInterest,
  toggleAvailability,
  getMyProfile,
} from '../convex';

type Tab = 'browse' | 'interests' | 'profile';

interface JobBoardViewProps {
  closerInfo: CloserInfo;
}

const INDUSTRIES = [
  'Solar', 'Insurance', 'Real Estate', 'SaaS', 'Coaching',
  'Agency', 'Info Products', 'E-Commerce', 'Financial Services', 'Other',
];

const TICKET_RANGES = [
  'Under $1k', '$1k-$3k', '$3k-$10k', '$10k-$25k', '$25k-$50k', '$50k+',
];

export function JobBoardView({ closerInfo }: JobBoardViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [interests, setInterests] = useState<JobInterest[]>([]);
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const [industry, setIndustry] = useState('');
  const [ticketRange, setTicketRange] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [availableToggling, setAvailableToggling] = useState(false);

  const userId = closerInfo.b2cUserId;

  const loadPostings = useCallback(async () => {
    setIsLoading(true);
    const data = await getOpenJobPostings({
      industry: industry || undefined,
      ticketRange: ticketRange || undefined,
    });
    setPostings(data);
    setIsLoading(false);
  }, [industry, ticketRange]);

  const loadInterests = useCallback(async () => {
    if (!userId) return;
    const data = await getMyJobInterests(userId);
    setInterests(data);
    setInterestedIds(new Set(data.map((i) => i.jobPostingId)));
  }, [userId]);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    const data = await getMyProfile(userId);
    setProfileData(data);
  }, [userId]);

  useEffect(() => {
    loadPostings();
    loadInterests();
    loadProfile();
  }, [loadPostings, loadInterests, loadProfile]);

  useEffect(() => {
    loadPostings();
  }, [industry, ticketRange, loadPostings]);

  const handleExpressInterest = async (postingId: string) => {
    if (!userId) return;
    setActionLoading(postingId);
    const result = await expressJobInterest(postingId, userId);
    if (result.success) {
      setInterestedIds((prev) => new Set([...prev, postingId]));
      setPostings((prev) =>
        prev.map((p) =>
          p._id === postingId ? { ...p, interestCount: p.interestCount + 1 } : p
        )
      );
      await loadInterests();
    }
    setActionLoading(null);
  };

  const handleWithdrawInterest = async (postingId: string) => {
    if (!userId) return;
    setActionLoading(postingId);
    const result = await withdrawJobInterest(postingId, userId);
    if (result.success) {
      setInterestedIds((prev) => {
        const next = new Set(prev);
        next.delete(postingId);
        return next;
      });
      setPostings((prev) =>
        prev.map((p) =>
          p._id === postingId
            ? { ...p, interestCount: Math.max(0, p.interestCount - 1) }
            : p
        )
      );
      setInterests((prev) => prev.filter((i) => i.jobPostingId !== postingId));
    }
    setActionLoading(null);
  };

  const handleToggleAvailability = async () => {
    if (!userId || !profileData) return;
    setAvailableToggling(true);
    const newAvailable = !profileData.isAvailable;
    const result = await toggleAvailability(userId, newAvailable);
    if (result.success) {
      setProfileData({ ...profileData, isAvailable: newAvailable });
    }
    setAvailableToggling(false);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'browse', label: 'Browse Jobs' },
    { id: 'interests', label: `My Interests${interests.length > 0 ? ` (${interests.length})` : ''}` },
    { id: 'profile', label: 'My Profile' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Job Board
        </h2>

        {/* Tab toggle */}
        <div className="flex gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 w-fit mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {activeTab === 'browse' && (
          <BrowseTab
            postings={postings}
            interestedIds={interestedIds}
            industry={industry}
            ticketRange={ticketRange}
            onIndustryChange={setIndustry}
            onTicketRangeChange={setTicketRange}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
            onExpressInterest={handleExpressInterest}
            onWithdrawInterest={handleWithdrawInterest}
            isLoading={isLoading}
            actionLoading={actionLoading}
          />
        )}
        {activeTab === 'interests' && (
          <InterestsTab
            interests={interests}
            onWithdraw={handleWithdrawInterest}
            actionLoading={actionLoading}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            profileData={profileData}
            onToggleAvailability={handleToggleAvailability}
            isToggling={availableToggling}
          />
        )}
      </div>
    </div>
  );
}

// ==================== Browse Tab ====================

function BrowseTab({
  postings,
  interestedIds,
  industry,
  ticketRange,
  onIndustryChange,
  onTicketRangeChange,
  expandedId,
  onToggleExpand,
  onExpressInterest,
  onWithdrawInterest,
  isLoading,
  actionLoading,
}: {
  postings: JobPosting[];
  interestedIds: Set<string>;
  industry: string;
  ticketRange: string;
  onIndustryChange: (v: string) => void;
  onTicketRangeChange: (v: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onExpressInterest: (id: string) => void;
  onWithdrawInterest: (id: string) => void;
  isLoading: boolean;
  actionLoading: string | null;
}) {
  return (
    <>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={industry}
          onChange={(e) => onIndustryChange(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">All Industries</option>
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>{ind}</option>
          ))}
        </select>
        <select
          value={ticketRange}
          onChange={(e) => onTicketRangeChange(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">All Ticket Ranges</option>
          {TICKET_RANGES.map((range) => (
            <option key={range} value={range}>{range}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-black dark:border-zinc-600 dark:border-t-white rounded-full animate-spin" />
        </div>
      ) : postings.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">No jobs found</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {industry || ticketRange
              ? 'Try adjusting your filters.'
              : 'No job postings are available right now. Check back soon!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {postings.map((posting) => {
            const isExpanded = expandedId === posting._id;
            const isInterested = interestedIds.has(posting._id);
            const isActioning = actionLoading === posting._id;

            return (
              <div
                key={posting._id}
                className="border border-gray-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800/50 overflow-hidden"
              >
                <button
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                  onClick={() => onToggleExpand(posting._id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {posting.title}
                        </h3>
                        {isInterested && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Interested
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
                        {posting.teamName && <span>{posting.teamName}</span>}
                        {posting.industry && (
                          <>
                            <span className="text-gray-300 dark:text-zinc-600">|</span>
                            <span>{posting.industry}</span>
                          </>
                        )}
                        {posting.ticketRange && (
                          <>
                            <span className="text-gray-300 dark:text-zinc-600">|</span>
                            <span>{posting.ticketRange}</span>
                          </>
                        )}
                        {posting.ote && (
                          <>
                            <span className="text-gray-300 dark:text-zinc-600">|</span>
                            <span>{posting.ote}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 mt-1 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-zinc-700/50 pt-3">
                    <p className="text-sm text-gray-600 dark:text-zinc-300 whitespace-pre-line mb-3">
                      {posting.description}
                    </p>

                    {posting.requiredSkills && posting.requiredSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {posting.requiredSkills.map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 text-[11px] rounded-full bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-zinc-400 mb-4">
                      <span>Posted {new Date(posting.createdAt).toLocaleDateString()}</span>
                      <span>{posting.interestCount} interested</span>
                    </div>

                    {isInterested ? (
                      <button
                        onClick={() => onWithdrawInterest(posting._id)}
                        disabled={isActioning}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                      >
                        {isActioning ? 'Withdrawing...' : 'Withdraw Interest'}
                      </button>
                    ) : (
                      <button
                        onClick={() => onExpressInterest(posting._id)}
                        disabled={isActioning}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
                      >
                        {isActioning ? 'Submitting...' : "I'm Interested"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ==================== Interests Tab ====================

function InterestsTab({
  interests,
  onWithdraw,
  actionLoading,
}: {
  interests: JobInterest[];
  onWithdraw: (postingId: string) => void;
  actionLoading: string | null;
}) {
  if (interests.length === 0) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
        <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">No interests yet</h3>
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          Browse jobs and click "I'm Interested" to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {interests.map((interest) => {
        const posting = interest.posting;
        if (!posting) return null;
        const isActioning = actionLoading === interest.jobPostingId;

        return (
          <div
            key={interest._id}
            className="border border-gray-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800/50 p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">
                    {posting.title}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      posting.status === 'open'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400'
                    }`}
                  >
                    {posting.status === 'open' ? 'Open' : 'Closed'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
                  {posting.teamName && <span>{posting.teamName}</span>}
                  {posting.industry && (
                    <>
                      <span className="text-gray-300 dark:text-zinc-600">|</span>
                      <span>{posting.industry}</span>
                    </>
                  )}
                  <span className="text-gray-300 dark:text-zinc-600">|</span>
                  <span>Applied {new Date(interest.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                onClick={() => onWithdraw(interest.jobPostingId)}
                disabled={isActioning}
                className="text-xs text-gray-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
              >
                {isActioning ? 'Withdrawing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== Profile Tab ====================

function ProfileTab({
  profileData,
  onToggleAvailability,
  isToggling,
}: {
  profileData: any;
  onToggleAvailability: () => void;
  isToggling: boolean;
}) {
  if (!profileData) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
          Set up your profile first
        </h3>
        <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-sm mx-auto">
          Complete your profile in the Profile tab so businesses can find and contact you.
        </p>
      </div>
    );
  }

  const missingFields: string[] = [];
  if (!profileData.photoUrl && !profileData.photoStorageId) missingFields.push('Photo');
  if (!profileData.headline) missingFields.push('Headline');
  if (!profileData.manualStats && !profileData.statsSource) missingFields.push('Stats');

  return (
    <div className="max-w-lg">
      {/* Available toggle */}
      <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800/50 mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Show in Talent Directory
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
            When enabled, Sequ3nce companies can discover your profile
          </p>
        </div>
        <button
          onClick={onToggleAvailability}
          disabled={isToggling}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:opacity-50 ${
            profileData.isAvailable
              ? 'bg-green-500'
              : 'bg-gray-200 dark:bg-zinc-600'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              profileData.isAvailable ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Profile preview */}
      <div className="p-4 border border-gray-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800/50 mb-4">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
          How businesses see you
        </h3>
        <div className="flex items-center gap-3">
          {profileData.photoUrl || profileData.photoStorageId ? (
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-700 flex-shrink-0 overflow-hidden">
              {profileData.photoUrl && (
                <img
                  src={profileData.photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-700 flex-shrink-0 flex items-center justify-center text-sm font-medium text-gray-500">
              {(profileData.name || '?')
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .slice(0, 2)}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {profileData.name || 'Your Name'}
            </p>
            {profileData.headline && (
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                {profileData.headline}
              </p>
            )}
          </div>
          {profileData.isManuallyVerified && (
            <span className="ml-auto px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              Verified
            </span>
          )}
        </div>

        {profileData.industries && profileData.industries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {profileData.industries.map((ind: string) => (
              <span
                key={ind}
                className="px-2 py-0.5 text-[11px] rounded-full bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300"
              >
                {ind}
              </span>
            ))}
          </div>
        )}

        {profileData.profileSlug && (
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-3">
            sequ3nce.ai/p/{profileData.profileSlug}
          </p>
        )}
      </div>

      {/* Missing fields warning */}
      {missingFields.length > 0 && (
        <div className="p-4 border border-amber-200 dark:border-amber-800/50 rounded-xl bg-amber-50 dark:bg-amber-900/20">
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
            Complete your profile
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Missing: {missingFields.join(', ')}. Go to the Profile tab to add these.
          </p>
        </div>
      )}
    </div>
  );
}
