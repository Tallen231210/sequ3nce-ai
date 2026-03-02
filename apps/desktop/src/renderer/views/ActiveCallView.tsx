import React, { useEffect, useRef, useState, useCallback } from 'react';
import type {
  CloserInfo,
  AmmoV2Analysis,
  TranscriptSegment,
  TeamResource,
} from '../convex';
import {
  getAmmoAnalysis,
  getTranscriptSegments,
  getActiveResources,
  isAmmoV2Enabled,
  updateCallNotes,
  cancelBot,
  requestReinforcement,
  callGoingLong,
} from '../convex';

interface ActiveCallViewProps {
  closerInfo: CloserInfo;
  callId: string;
  botId?: string;
  meetingTitle?: string;
  prospectName?: string;
}

export function ActiveCallView({
  closerInfo,
  callId,
  botId,
  meetingTitle,
  prospectName,
}: ActiveCallViewProps) {
  // Tab state
  const [selectedTab, setSelectedTab] = useState(0);

  // Duration timer
  const [duration, setDuration] = useState(0);

  // Data
  const [analysis, setAnalysis] = useState<AmmoV2Analysis | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [resources, setResources] = useState<TeamResource[]>([]);
  const [notes, setNotes] = useState('');
  const [v2Enabled, setV2Enabled] = useState(false);
  const [isLoadingResources, setIsLoadingResources] = useState(true);

  // Notes auto-save
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Actions
  const [isKicking, setIsKicking] = useState(false);
  const [showReinforcementInput, setShowReinforcementInput] = useState(false);
  const [reinforcementMsg, setReinforcementMsg] = useState('');
  const [isRequestingReinforcement, setIsRequestingReinforcement] = useState(false);
  const [reinforcementCooldown, setReinforcementCooldown] = useState(0);
  const [reinforcementSuccess, setReinforcementSuccess] = useState(false);
  const [showTimeOptions, setShowTimeOptions] = useState(false);
  const [callLongSent, setCallLongSent] = useState(false);
  const [callLongSuccess, setCallLongSuccess] = useState(false);
  const [isNotifyingLong, setIsNotifyingLong] = useState(false);

  // Transcript auto-scroll ref
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Cleanup refs
  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  // Duration timer
  useEffect(() => {
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Reinforcement cooldown timer
  useEffect(() => {
    if (reinforcementCooldown <= 0) return;
    const timer = setInterval(() => {
      setReinforcementCooldown((c) => {
        if (c <= 1) return 0;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [reinforcementCooldown]);

  // Data polling
  useEffect(() => {
    // Check V2
    isAmmoV2Enabled(closerInfo.teamId).then(setV2Enabled);

    // Load resources once
    setIsLoadingResources(true);
    getActiveResources(closerInfo.teamId).then((r) => {
      setResources(r);
      setIsLoadingResources(false);
    });

    // Poll ammo + transcript every 5s
    const poll = async () => {
      try {
        const [a, t] = await Promise.all([
          getAmmoAnalysis(callId),
          getTranscriptSegments(callId),
        ]);
        if (!mountedRef.current) return;
        if (a) setAnalysis(a);
        if (t.length > 0) setSegments(t);
      } catch (err) {
        console.error('[ActiveCall] Poll error:', err);
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [callId, closerInfo.teamId]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length]);

  // Notes auto-save with 2s debounce
  const handleNotesChange = useCallback(
    (value: string) => {
      setNotes(value);
      setNotesSaved(false);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        setIsSavingNotes(true);
        await updateCallNotes(callId, value);
        setIsSavingNotes(false);
        setNotesSaved(true);
      }, 2000);
    },
    [callId]
  );

  // Actions
  async function handleKickBot() {
    if (!botId) return;
    setIsKicking(true);
    await cancelBot(botId);
    setIsKicking(false);
  }

  async function handleRequestReinforcement() {
    setIsRequestingReinforcement(true);
    const ok = await requestReinforcement(
      closerInfo.teamId,
      closerInfo.closerId,
      closerInfo.name,
      callId,
      reinforcementMsg || undefined
    );
    setIsRequestingReinforcement(false);
    if (ok) {
      setReinforcementSuccess(true);
      setReinforcementMsg('');
      setShowReinforcementInput(false);
      setReinforcementCooldown(30);
      const t = setTimeout(() => { if (mountedRef.current) setReinforcementSuccess(false); }, 3000);
      timeoutsRef.current.push(t);
    }
  }

  async function handleCallGoingLong(minutes: number) {
    setShowTimeOptions(false);
    setIsNotifyingLong(true);
    const ok = await callGoingLong(closerInfo.teamId, closerInfo.closerId, callId, minutes);
    setIsNotifyingLong(false);
    if (ok) {
      setCallLongSent(true);
      setCallLongSuccess(true);
      const t = setTimeout(() => { if (mountedRef.current) setCallLongSuccess(false); }, 3000);
      timeoutsRef.current.push(t);
    }
  }

  // Talk ratio calculation
  const closerPercent = (() => {
    if (segments.length === 0) return 50;
    let closerChars = 0;
    let prospectChars = 0;
    for (const seg of segments) {
      const isCloser = seg.speaker.toLowerCase().includes('closer') || seg.speaker.toLowerCase() === 'agent';
      if (isCloser) closerChars += seg.text.length;
      else prospectChars += seg.text.length;
    }
    const total = closerChars + prospectChars;
    return total > 0 ? Math.round((closerChars / total) * 100) : 50;
  })();

  const tabs = [
    { label: 'Ammo', icon: 'bolt' },
    { label: 'Transcript', icon: 'doc' },
    { label: 'Notes', icon: 'pencil' },
    { label: 'Resources', icon: 'book' },
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-5 py-3 bg-[#fcfcfc] border-b border-gray-200/60 shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-black truncate">
            {meetingTitle || 'Active Call'}
          </h2>
          {prospectName && (
            <p className="text-[13px] text-gray-500">with {prospectName}</p>
          )}
        </div>

        {/* Duration */}
        <span className="text-base font-medium font-mono text-black">
          {formatDuration(duration)}
        </span>

        {/* Recording badge */}
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-md">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[12px] font-medium text-green-700">Recording</span>
        </span>

        {/* Kick Bot */}
        <button
          onClick={handleKickBot}
          disabled={isKicking || !botId}
          className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {isKicking ? (
            <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          Kick Bot
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-0.5 px-4 py-2 bg-[#fafafa] border-b border-gray-200/60 shrink-0">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setSelectedTab(i)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] transition-colors ${
              selectedTab === i
                ? 'bg-black text-white font-medium'
                : 'text-gray-500 hover:bg-gray-200/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden bg-[#fcfcfc]">
        {selectedTab === 0 && <AmmoTab analysis={analysis} v2Enabled={v2Enabled} />}
        {selectedTab === 1 && <TranscriptTab segments={segments} endRef={transcriptEndRef} />}
        {selectedTab === 2 && (
          <NotesTab
            notes={notes}
            onChange={handleNotesChange}
            isSaving={isSavingNotes}
            saved={notesSaved}
          />
        )}
        {selectedTab === 3 && <ResourcesTab resources={resources} isLoading={isLoadingResources} />}
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-t border-gray-200/60 bg-white shrink-0">
        {/* Reinforcement */}
        {reinforcementSuccess ? (
          <span className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-green-700 bg-green-50 rounded-lg">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Reinforcement Requested!
          </span>
        ) : reinforcementCooldown > 0 ? (
          <span className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-gray-500 bg-gray-100 rounded-lg">
            Wait {reinforcementCooldown}s
          </span>
        ) : showReinforcementInput ? (
          <div className="flex items-center gap-1.5">
            <input
              value={reinforcementMsg}
              onChange={(e) => setReinforcementMsg(e.target.value)}
              placeholder="Context (optional)"
              className="w-[140px] px-2 py-1.5 text-[12px] border border-gray-300 rounded-md focus:outline-none focus:border-gray-400"
            />
            {isRequestingReinforcement ? (
              <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <button
                onClick={handleRequestReinforcement}
                className="px-3 py-1.5 text-[12px] font-semibold text-white bg-orange-500 rounded-md hover:bg-orange-600"
              >
                Send
              </button>
            )}
            <button
              onClick={() => setShowReinforcementInput(false)}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowReinforcementInput(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clipRule="evenodd" /></svg>
            Request Reinforcement
          </button>
        )}

        {/* Call Going Long */}
        {callLongSent ? (
          callLongSuccess ? (
            <span className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-green-700 bg-green-50 rounded-lg">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              Team Notified
            </span>
          ) : null
        ) : isNotifyingLong ? (
          <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        ) : showTimeOptions ? (
          <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-100 rounded-md border border-amber-300">
            {[15, 30, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => handleCallGoingLong(m)}
                className="px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 rounded hover:bg-amber-100 transition-colors"
              >
                {m === 60 ? '1hr' : `${m}m`}
              </button>
            ))}
            <button onClick={() => setShowTimeOptions(false)} className="text-gray-400 p-1">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowTimeOptions(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Call Going Long
          </button>
        )}

        <div className="flex-1" />

        {/* Talk Ratio */}
        <div className="w-[200px]">
          <div className="flex justify-between text-[10px] font-medium text-gray-500 mb-1">
            <span>Talk Ratio</span>
            <span>{closerPercent}% / {100 - closerPercent}%</span>
          </div>
          <div className="flex gap-px h-1.5 rounded-full overflow-hidden">
            <div className="bg-black/70 rounded-l-full" style={{ width: `${closerPercent}%` }} />
            <div className="bg-blue-400/50 rounded-r-full" style={{ width: `${100 - closerPercent}%` }} />
          </div>
          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
            <span>Closer</span>
            <span>Prospect</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Ammo Tab ---

function AmmoTab({ analysis, v2Enabled }: { analysis: AmmoV2Analysis | null; v2Enabled: boolean }) {
  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" /></svg>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-[14px] font-medium text-gray-500">Analyzing call...</span>
        </div>
        <p className="text-[12px] text-gray-400">Live coaching data will appear as the conversation progresses</p>
      </div>
    );
  }

  const beliefs = [
    { key: 'problem', label: 'Problem', value: analysis.beliefs.problem },
    { key: 'solution', label: 'Solution', value: analysis.beliefs.solution },
    { key: 'vehicle', label: 'Vehicle', value: analysis.beliefs.vehicle },
    { key: 'self', label: 'Self', value: analysis.beliefs.self },
    { key: 'time', label: 'Time', value: analysis.beliefs.time },
    { key: 'money', label: 'Money', value: analysis.beliefs.money },
    { key: 'urgency', label: 'Urgency', value: analysis.beliefs.urgency },
  ];

  const objectionLabel = (type: string) => {
    const map: Record<string, string> = {
      think_about_it: 'Think About It',
      spouse: 'Spouse/Partner',
      money: 'Money/Budget',
      time: 'Bad Timing',
      trust: 'Trust/Skepticism',
      comparison: 'Comparing Options',
    };
    return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const engagementColors: Record<string, { bg: string; text: string }> = {
    high: { bg: 'bg-green-100', text: 'text-green-700' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    low: { bg: 'bg-red-100', text: 'text-red-700' },
  };
  const ec = engagementColors[analysis.engagement.level] || engagementColors.medium;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Engagement */}
      <Section title="Engagement Level">
        <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
          <span className={`text-[13px] font-semibold px-2 py-1 rounded ${ec.bg} ${ec.text}`}>
            {analysis.engagement.level.charAt(0).toUpperCase() + analysis.engagement.level.slice(1)}
          </span>
          <span className="text-[13px] text-black">{analysis.engagement.reason}</span>
        </div>
      </Section>

      {/* Buying Beliefs */}
      <Section title="Buying Beliefs">
        <div className="space-y-2 p-2.5 bg-gray-50 rounded-lg">
          {beliefs.map((b) => (
            <div key={b.key} className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-gray-500 w-[70px] shrink-0">{b.label}</span>
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(b.value / 7) * 100}%`,
                    backgroundColor: beliefColor(b.value),
                  }}
                />
              </div>
              <span className="text-[11px] font-mono text-gray-500 w-[30px] text-right">{b.value}/7</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Objection Predictions */}
      {analysis.objectionPrediction.length > 0 && (
        <Section title="Objection Predictions">
          <div className="space-y-1.5">
            {analysis.objectionPrediction.map((p) => (
              <div key={p.type} className="flex items-center justify-between p-2 bg-orange-50 rounded-md">
                <span className="text-[13px] text-orange-700">{objectionLabel(p.type)}</span>
                <span className="text-[12px] font-medium text-orange-700">{p.probability}%</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Pain Points */}
      {analysis.painPoints.length > 0 && (
        <Section title="Pain Points">
          <div className="space-y-1.5">
            {analysis.painPoints.map((p, i) => (
              <div key={i} className="p-2 text-[13px] text-black bg-gray-50 rounded-md">
                {p}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-gray-600 mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function beliefColor(value: number): string {
  if (value <= 2) return '#dc2626';
  if (value <= 4) return '#d97706';
  if (value <= 6) return '#16a34a';
  return '#15803d';
}

// --- Transcript Tab ---

function TranscriptTab({
  segments,
  endRef,
}: {
  segments: TranscriptSegment[];
  endRef: React.RefObject<HTMLDivElement>;
}) {
  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-gray-500">Waiting for transcript...</span>
        </div>
        <p className="text-[12px] text-gray-400">Transcript will appear as participants speak</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
        <span className="text-[14px] font-semibold text-black">Live Transcript</span>
        <span className="text-[11px] text-gray-400">{segments.length} segments</span>
      </div>

      {/* Segments */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-1.5">
          {segments.map((seg) => {
            const isCloser = seg.speaker.toLowerCase().includes('closer') || seg.speaker.toLowerCase() === 'agent';
            return (
              <div
                key={seg._id}
                className={`p-2.5 rounded-lg ${
                  isCloser ? 'bg-gray-100' : 'bg-white border border-gray-100'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[11px] font-medium ${isCloser ? 'text-gray-500' : 'text-blue-600'}`}>
                    {seg.speaker}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {formatTimestamp(seg.timestamp)}
                  </span>
                </div>
                <p className="text-[13px] text-gray-700">{seg.text}</p>
              </div>
            );
          })}
          <div ref={endRef as React.RefObject<HTMLDivElement>} />
        </div>
      </div>
    </div>
  );
}

// --- Notes Tab ---

function NotesTab({
  notes,
  onChange,
  isSaving,
  saved,
}: {
  notes: string;
  onChange: (v: string) => void;
  isSaving: boolean;
  saved: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your notes here..."
        className="flex-1 p-3 text-[14px] text-black bg-gray-50 resize-none focus:outline-none"
      />
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200/60 bg-white shrink-0">
        <span className="text-[11px] text-gray-400">{notes.length} characters</span>
        {isSaving ? (
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <span className="w-2 h-2 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Saving...
          </span>
        ) : saved ? (
          <span className="flex items-center gap-1 text-[11px] text-green-600">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}

// --- Resources Tab ---

function ResourcesTab({ resources, isLoading }: { resources: TeamResource[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-[13px] text-gray-500">Loading resources...</span>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <svg className="w-7 h-7 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <span className="text-[14px] text-gray-500">No Resources</span>
        <span className="text-[12px] text-gray-400 mt-1">Your manager hasn't added any resources yet</span>
      </div>
    );
  }

  const typeConfig: Record<string, { icon: string; bg: string; text: string }> = {
    script: { icon: 'doc.text', bg: 'bg-blue-50', text: 'text-blue-600' },
    payment_link: { icon: 'creditcard', bg: 'bg-green-50', text: 'text-green-600' },
    document: { icon: 'doc', bg: 'bg-purple-50', text: 'text-purple-600' },
    link: { icon: 'link', bg: 'bg-orange-50', text: 'text-orange-600' },
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-2">
      {resources.map((r) => {
        const tc = typeConfig[r.type] || typeConfig.link;
        const urlOrContent = r.url || r.content;
        return (
          <div key={r._id} className="flex items-center gap-2.5 p-2.5 bg-white rounded-lg border border-gray-100">
            <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${tc.bg}`}>
              <svg className={`w-3.5 h-3.5 ${tc.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-black truncate">{r.title}</p>
              {r.description && <p className="text-[11px] text-gray-500 truncate">{r.description}</p>}
            </div>
            {urlOrContent && (
              <>
                <button
                  onClick={() => { try { navigator.clipboard.writeText(urlOrContent); } catch {} }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Copy"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => window.open(urlOrContent, '_blank')}
                  className="p-1.5 text-blue-500 hover:text-blue-700 transition-colors"
                  title="Open"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Helpers ---

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(startTime: number): string {
  const m = Math.floor(startTime / 60);
  const s = Math.floor(startTime % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
