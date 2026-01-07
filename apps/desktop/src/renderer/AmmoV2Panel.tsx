// Ammo V2 Panel - Real-time AI-powered sales call analysis
// Shows engagement level, buying beliefs, objection prediction, and pain points

import React from 'react';

// Types for Ammo V2 analysis
export interface AmmoV2Analysis {
  engagement: {
    level: "high" | "medium" | "low";
    reason: string;
  };
  beliefs: {
    problem: number;
    solution: number;
    vehicle: number;
    self: number;
    time: number;
    money: number;
    urgency: number;
  };
  objectionPrediction: Array<{
    type: string;
    probability: number;
  }>;
  painPoints: string[];
  analyzedAt?: number;
}

// Belief labels for display
const BELIEF_LABELS: Record<keyof AmmoV2Analysis['beliefs'], { label: string; tooltip: string }> = {
  problem: { label: 'Problem', tooltip: 'Do they believe they have a real problem?' },
  solution: { label: 'Solution', tooltip: 'Do they believe a solution exists?' },
  vehicle: { label: 'Vehicle', tooltip: 'Do they believe THIS solution is the right one?' },
  self: { label: 'Self', tooltip: 'Do they believe THEY can succeed with it?' },
  time: { label: 'Time', tooltip: 'Do they believe NOW is the right time?' },
  money: { label: 'Money', tooltip: 'Do they believe it\'s worth the investment?' },
  urgency: { label: 'Urgency', tooltip: 'Is there urgency to make a decision?' },
};

// Objection type labels
const OBJECTION_LABELS: Record<string, string> = {
  think_about_it: 'Think About It',
  spouse: 'Spouse/Partner',
  money: 'Money/Budget',
  time: 'Bad Timing',
  trust: 'Trust/Skepticism',
  comparison: 'Comparing Options',
};

// Get color based on percentage
function getBeliefColor(pct: number): string {
  if (pct <= 30) return 'bg-red-500';
  if (pct <= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getBeliefTextColor(pct: number): string {
  if (pct <= 30) return 'text-red-600';
  if (pct <= 60) return 'text-yellow-600';
  return 'text-green-600';
}

// Engagement badge colors
const ENGAGEMENT_COLORS = {
  high: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  low: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
};

// Belief Progress Bar Component
function BeliefBar({ beliefKey, value }: { beliefKey: keyof AmmoV2Analysis['beliefs']; value: number }) {
  const { label, tooltip } = BELIEF_LABELS[beliefKey];
  const colorClass = getBeliefColor(value);
  const textColorClass = getBeliefTextColor(value);

  return (
    <div className="group relative" title={tooltip}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-gray-600">{label}</span>
        <span className={`text-[11px] font-semibold ${textColorClass}`}>{value}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// Objection Prediction Card
function ObjectionCard({ type, probability }: { type: string; probability: number }) {
  const label = OBJECTION_LABELS[type] || type;

  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
      <span className="text-[12px] font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${probability >= 60 ? 'bg-red-500' : probability >= 30 ? 'bg-yellow-500' : 'bg-gray-400'} rounded-full`}
            style={{ width: `${probability}%` }}
          />
        </div>
        <span className={`text-[11px] font-semibold ${probability >= 60 ? 'text-red-600' : probability >= 30 ? 'text-yellow-600' : 'text-gray-500'}`}>
          {probability}%
        </span>
      </div>
    </div>
  );
}

// Pain Point Quote
function PainPointQuote({ quote, onCopy }: { quote: string; onCopy: (text: string) => void }) {
  const [copied, setCopied] = React.useState(false);

  const handleClick = () => {
    onCopy(quote);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleClick}
      className="relative p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer transition-all duration-150 group"
    >
      <p className="text-[12px] text-gray-700 leading-snug">"{quote}"</p>
      <div className={`absolute inset-0 rounded-lg flex items-center justify-center bg-white/95 transition-opacity duration-150 ${copied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-1 text-green-600">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[11px] font-medium">Copied!</span>
        </div>
      </div>
      <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        click to copy
      </div>
    </div>
  );
}

// Waiting State Component
function WaitingState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-full border-2 border-gray-300 animate-ping opacity-30" />
      </div>
      <p className="text-sm text-gray-500 mb-1">Analyzing call...</p>
      <p className="text-xs text-gray-400 text-center px-6">AI insights will appear after ~45 seconds of conversation</p>
    </div>
  );
}

// No Call State
function NoCallState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
      <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <p className="text-xs text-center px-4">Start a call to see AI-powered insights</p>
    </div>
  );
}

// Main Ammo V2 Panel Component
export function AmmoV2Panel({
  callId,
  analysis,
  onCopy,
}: {
  callId: string | null;
  analysis: AmmoV2Analysis | null;
  onCopy: (text: string) => void;
}) {
  if (!callId) {
    return <NoCallState />;
  }

  if (!analysis) {
    return <WaitingState />;
  }

  const engagementColor = ENGAGEMENT_COLORS[analysis.engagement.level];

  return (
    <div className="flex flex-col h-full p-2 space-y-3 overflow-y-auto">
      {/* Engagement Section */}
      <div className="p-3 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Engagement</h3>
          <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border ${engagementColor.bg} ${engagementColor.text} ${engagementColor.border}`}>
            {analysis.engagement.level.toUpperCase()}
          </span>
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">{analysis.engagement.reason}</p>
      </div>

      {/* Buying Beliefs Section */}
      <div className="p-3 bg-white rounded-lg border border-gray-200">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Buying Beliefs</h3>
        <div className="space-y-2.5">
          {(Object.keys(BELIEF_LABELS) as Array<keyof AmmoV2Analysis['beliefs']>).map((key) => (
            <BeliefBar key={key} beliefKey={key} value={analysis.beliefs[key]} />
          ))}
        </div>
      </div>

      {/* Objection Prediction Section */}
      {analysis.objectionPrediction.length > 0 && (
        <div className="p-3 bg-white rounded-lg border border-gray-200">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Likely Objections</h3>
          <div className="space-y-1.5">
            {analysis.objectionPrediction.map((obj, idx) => (
              <ObjectionCard key={idx} type={obj.type} probability={obj.probability} />
            ))}
          </div>
        </div>
      )}

      {/* Pain Points Section */}
      {analysis.painPoints.length > 0 && (
        <div className="p-3 bg-white rounded-lg border border-gray-200">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Pain Points</h3>
          <div className="space-y-1.5">
            {analysis.painPoints.map((quote, idx) => (
              <PainPointQuote key={idx} quote={quote} onCopy={onCopy} />
            ))}
          </div>
        </div>
      )}

      {/* Last Updated */}
      {analysis.analyzedAt && (
        <p className="text-[10px] text-gray-400 text-center">
          Last updated: {new Date(analysis.analyzedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
