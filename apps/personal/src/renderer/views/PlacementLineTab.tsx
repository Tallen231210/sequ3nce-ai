import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPlacementLineStatus,
  joinPlacementLine,
  type PlacementLineStatus,
} from '../classroomApi';

// ============================================================================
// The Placement Line — Job Board → Internal. Not a job list: partner
// companies ask Sequ3nce for closers and Sequ3nce sends them member
// PROFILES. Four states: non-VIP pitch → profile checklist → the join
// moment → the waiting room (deliberately calm: silence is normal, we
// reach out when a partner matches).
// ============================================================================

interface PlacementLineTabProps {
  userId: string;
  onGoToProfile?: () => void;
}

const CROWN = (
  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6l4 3 4-6 4 6 4-3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6z" />
  </svg>
);

export function PlacementLineTab({ userId, onGoToProfile }: PlacementLineTabProps) {
  const [status, setStatus] = useState<PlacementLineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const s = await getPlacementLineStatus(userId);
    if (mountedRef.current) {
      setStatus(s);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    setError(null);
    const r = await joinPlacementLine(userId);
    if (mountedRef.current) {
      if (r.error) setError(r.error);
      await load();
      setJoining(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-400 text-center py-16">Loading…</div>;
  }

  // ---- State 1: not VIP — the pitch ----
  if (!status || !status.isVip) {
    return (
      <div className="flex flex-col items-center py-14 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-500 flex items-center justify-center mb-5">
          {CROWN}
        </div>
        <h3 className="text-xl font-bold text-black dark:text-white mb-2">The Placement Line</h3>
        <p className="text-[13.5px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-md mb-6">
          Companies come to Sequ3nce asking for proven closers — and we hand them
          member profiles directly. No applications, no job hunting. Your profile
          does the work, and the intro comes from us.
        </p>
        <div className="rounded-xl border border-yellow-300 dark:border-yellow-700/60 bg-yellow-50 dark:bg-yellow-900/10 px-5 py-3">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
            Reserved for Yearly (VIP) members
          </p>
        </div>
      </div>
    );
  }

  // ---- State 4: on the Line — the waiting room ----
  if (status.joinedAt) {
    const joinedDate = new Date(status.joinedAt).toLocaleDateString(undefined, {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="rounded-2xl border-2 border-yellow-400/70 bg-yellow-50 dark:bg-yellow-900/10 p-6 text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-full bg-yellow-400 text-black flex items-center justify-center mb-3">
            {CROWN}
          </div>
          <h3 className="text-lg font-bold text-black dark:text-white">
            You&apos;re on The Placement Line
          </h3>
          <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-1">
            Since {joinedDate} · Profile live with our placement team
          </p>
        </div>

        <h4 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
          How this works
        </h4>
        <div className="space-y-4 mb-8">
          {[
            ['A partner asks us for closers', 'Companies we have direct relationships with tell us what seat they need filled — comp, offer, leads.'],
            ['We match from the Line', 'Your profile and verified numbers are what we shop. The better they look, the more often you come up.'],
            ['You get the intro', 'When it’s you, we reach out here in the app and make a warm, personal introduction. No cold applications, ever.'],
          ].map(([title, body], i) => (
            <div key={title} className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-black dark:bg-white text-white dark:text-black text-[12px] font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-black dark:text-white">{title}</p>
                <p className="text-[12.5px] text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200 dark:border-zinc-800 px-5 py-4">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1">
            Quiet weeks are normal — and a good sign to keep closing.
          </p>
          <p className="text-[12.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Placements move on partner timelines, not ours. Every call you record
            and every dollar you verify while you wait makes your profile stronger
            for the next match. When a partner wants you, you&apos;ll hear from us
            directly — you don&apos;t need to do anything else here.
          </p>
        </div>
      </div>
    );
  }

  // ---- States 2 & 3: VIP — checklist, then the join moment ----
  const CHECKS: Array<[keyof PlacementLineStatus['checks'], string, string]> = [
    ['photo', 'Profile photo', 'Partners meet your face before your numbers.'],
    ['headline', 'Headline', 'One line that says what you close.'],
    ['bio', 'Bio', 'Your story — background, offers, what you want next.'],
    ['publicProfile', 'Public profile', 'Your profile link has to be live for us to send it.'],
    ['verifiedStats', 'Verified stats', 'Partners only see numbers we’ve certified. Submit verification from your profile.'],
  ];
  const doneCount = Object.values(status.checks).filter(Boolean).length;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="text-center mb-8">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-500 flex items-center justify-center mb-3">
          {CROWN}
        </div>
        <h3 className="text-xl font-bold text-black dark:text-white mb-2">The Placement Line</h3>
        <p className="text-[13.5px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
          Partner companies ask us for closers, and we send them member profiles
          directly. <span className="font-semibold text-gray-800 dark:text-gray-200">Your profile is your application</span> —
          it has to be undeniable before it goes out under our name.
        </p>
      </div>

      {status.eligible ? (
        <div className="rounded-2xl border-2 border-yellow-400/70 bg-yellow-50 dark:bg-yellow-900/10 p-6 text-center">
          <p className="text-[14px] font-semibold text-black dark:text-white mb-1">
            Your profile is ready.
          </p>
          <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mb-4">
            Photo, story, and gold-standard verified numbers — this is what partners want to see.
          </p>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="px-6 py-3 rounded-xl bg-yellow-400 text-black text-[14px] font-bold hover:bg-yellow-300 transition-colors disabled:opacity-50"
          >
            {joining ? 'Joining…' : 'Enter The Placement Line'}
          </button>
          {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Get your profile send-ready
            </h4>
            <span className="text-[12px] font-semibold text-gray-400">{doneCount}/{CHECKS.length}</span>
          </div>
          <div className="space-y-2 mb-6">
            {CHECKS.map(([key, label, hint]) => {
              const done = status.checks[key];
              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                    done
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/10'
                      : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    done ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {done ? '✓' : ''}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-[13.5px] font-semibold ${done ? 'text-emerald-800 dark:text-emerald-300' : 'text-black dark:text-white'}`}>
                      {label}
                    </p>
                    {!done && (
                      <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {onGoToProfile && (
            <button
              onClick={onGoToProfile}
              className="w-full px-5 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black text-[13.5px] font-semibold hover:opacity-85 transition-opacity"
            >
              Finish my profile
            </button>
          )}
        </>
      )}
    </div>
  );
}
