import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, WeeklyContest, WeeklySubmission } from '../../convex';
import {
  getActiveContest,
  getContestSubmissions,
  getMyContestSubmission,
  getMyContestVote,
  castContestVote,
  removeContestVote,
  getPastContests,
  completeWeeklyContest,
} from '../../convex';
import { ContestSubmitModal } from './ContestSubmitModal';
import { ContestCreateModal } from './ContestCreateModal';

interface CallOfTheWeekViewProps {
  closerInfo: CloserInfo;
}

const POLL_INTERVAL = 15_000;

function daysLeft(endDate: string): number {
  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0116.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-2.52.952m0 0a6.003 6.003 0 01-2.52-.952" />
    </svg>
  );
}

function getVoteButtonLabel(isOwn: boolean, isVoted: boolean): string {
  if (isOwn) return 'You';
  if (isVoted) return 'Voted';
  return 'Vote';
}

export function CallOfTheWeekView({ closerInfo }: CallOfTheWeekViewProps) {
  const [contest, setContest] = useState<WeeklyContest | null>(null);
  const [submissions, setSubmissions] = useState<WeeklySubmission[]>([]);
  const [mySubmission, setMySubmission] = useState<WeeklySubmission | null>(null);
  const [myVote, setMyVote] = useState<{ _id: string; submissionId: string } | null>(null);
  const [pastContests, setPastContests] = useState<WeeklyContest[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const mountedRef = useRef(true);

  const userId = closerInfo.b2cUserId || '';
  const isFounder = closerInfo.badges?.includes('founder') ?? false;

  const loadData = useCallback(async () => {
    const [activeContest, history] = await Promise.all([
      getActiveContest(),
      getPastContests(),
    ]);
    if (!mountedRef.current) return;
    setContest(activeContest);
    setPastContests(history);

    if (activeContest && userId) {
      const [subs, mySub, myV] = await Promise.all([
        getContestSubmissions(activeContest._id),
        getMyContestSubmission(activeContest._id, userId),
        getMyContestVote(activeContest._id, userId),
      ]);
      if (!mountedRef.current) return;
      setSubmissions(subs);
      setMySubmission(mySub);
      setMyVote(myV);
    } else {
      setSubmissions([]);
      setMySubmission(null);
      setMyVote(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    const interval = setInterval(() => { if (mountedRef.current) loadData(); }, POLL_INTERVAL);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [loadData]);

  const handleVote = async (submissionId: string) => {
    if (!contest || voting || !userId) return;
    setVoting(true);
    if (myVote?.submissionId === submissionId) {
      await removeContestVote(userId, contest._id);
    } else {
      await castContestVote(userId, contest._id, submissionId);
    }
    await loadData();
    setVoting(false);
  };

  const handleComplete = async () => {
    if (!contest || completing || !userId) return;
    if (!window.confirm('End this contest and pick the winner based on votes?')) return;
    setCompleting(true);
    await completeWeeklyContest(contest._id, userId);
    await loadData();
    setCompleting(false);
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">
        Loading contest...
      </div>
    );
  }

  const votedSubmitter = myVote
    ? submissions.find((s) => s._id === myVote.submissionId)?.submitterName
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrophyIcon />
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {contest ? contest.title : 'Call of the Week'}
            </h2>
            {contest && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {contest.description}
              </p>
            )}
          </div>
          {contest && (
            <span className="ml-2 px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-full">
              ${contest.prizeAmount} Prize
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {contest && (() => {
            const remaining = daysLeft(contest.weekEndDate);
            return (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {remaining} day{remaining !== 1 ? 's' : ''} left
              </span>
            );
          })()}
          {isFounder && !contest && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-colors"
            >
              Create Contest
            </button>
          )}
          {isFounder && contest && (
            <button
              onClick={handleComplete}
              disabled={completing}
              className="px-3 py-1.5 text-xs font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {completing ? 'Ending...' : 'End Contest'}
            </button>
          )}
        </div>
      </div>

      {/* Active contest */}
      {contest ? (
        <>
          {/* Submit / status bar */}
          <div className="flex items-center justify-between mb-4">
            {mySubmission ? (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Submitted: {mySubmission.title}
              </span>
            ) : (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="px-4 py-2 text-sm font-medium bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-colors"
              >
                Submit Your Call
              </button>
            )}
            {votedSubmitter && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                You voted for <span className="font-semibold text-gray-700 dark:text-gray-300">{votedSubmitter}</span>
              </span>
            )}
          </div>

          {/* Submissions grid */}
          {submissions.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
              No submissions yet. Be the first!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {submissions.map((sub) => {
                const isOwn = sub.userId === userId;
                const isVoted = myVote?.submissionId === sub._id;
                return (
                  <div
                    key={sub._id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isVoted
                        ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800/50'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {sub.submitterName || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                          {sub.title}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-medium uppercase rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {sub.type === 'highlight' ? 'Clip' : 'Link'}
                      </span>
                    </div>

                    {/* Share link display */}
                    {sub.type === 'share_link' && sub.shareUrl && (
                      <a
                        href={sub.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-600 dark:text-gray-400 underline break-all line-clamp-1 block mb-2"
                      >
                        {sub.shareUrl}
                      </a>
                    )}

                    {/* Highlight clip indicator */}
                    {sub.type === 'highlight' && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                        </svg>
                        Highlight Clip
                      </div>
                    )}

                    {/* Vote row */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {sub.voteCount} vote{sub.voteCount !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => handleVote(sub._id)}
                        disabled={isOwn || voting}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 ${
                          isVoted
                            ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {getVoteButtonLabel(isOwn, isVoted)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <span className="mb-3 block"><TrophyIcon className="w-5 h-5 mx-auto" /></span>
          <p className="text-gray-600 dark:text-gray-400 text-sm">No contest this week</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            Check back Monday for the next Call of the Week!
          </p>
        </div>
      )}

      {/* Past winners */}
      {pastContests.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Past Winners</h3>
          <div className="space-y-2">
            {pastContests.map((pc) => (
              <div
                key={pc._id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {pc.winnerName || 'No winner'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {pc.winnerSubmissionTitle || pc.title}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    ${pc.prizeAmount}
                  </span>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {pc.weekStartDate}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showSubmitModal && contest && (
        <ContestSubmitModal
          contestId={contest._id}
          userId={userId}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={() => { setShowSubmitModal(false); loadData(); }}
        />
      )}
      {showCreateModal && (
        <ContestCreateModal
          userId={userId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); loadData(); }}
        />
      )}
    </div>
  );
}
