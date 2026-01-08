// Ammo V2 Panel - Real-time AI-powered sales call analysis
// Shows engagement level, buying beliefs, objection prediction, and pain points

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Copy, Check, Zap, AlertTriangle, MessageSquareQuote } from 'lucide-react';

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
  money: { label: 'Money', tooltip: "Do they believe it's worth the investment?" },
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

// Engagement badge styles
const ENGAGEMENT_STYLES = {
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
        <span className="text-xs font-medium text-zinc-600">{label}</span>
        <span className={cn("text-xs font-semibold", textColorClass)}>{value}%</span>
      </div>
      <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500 ease-out rounded-full", colorClass)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// Get likelihood label based on probability
function getLikelihoodLabel(probability: number): { text: string; bgColor: string; textColor: string } {
  if (probability >= 60) {
    return { text: 'Very Likely', bgColor: 'bg-red-100', textColor: 'text-red-700' };
  }
  if (probability >= 30) {
    return { text: 'Likely', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' };
  }
  return { text: 'Less Likely', bgColor: 'bg-zinc-100', textColor: 'text-zinc-600' };
}

// Objection Prediction Card
function ObjectionCard({ type, probability }: { type: string; probability: number }) {
  const label = OBJECTION_LABELS[type] || type;
  const likelihood = getLikelihoodLabel(probability);

  return (
    <div className="flex items-center justify-between p-2 bg-zinc-50 rounded-lg border border-zinc-200">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <Badge
        variant="outline"
        className={cn("text-xs font-semibold border-0", likelihood.bgColor, likelihood.textColor)}
      >
        {likelihood.text}
      </Badge>
    </div>
  );
}

// Pain Point Quote with copy functionality
function PainPointQuote({ quote, onCopy }: { quote: string; onCopy?: (text: string) => void }) {
  const [copied, setCopied] = React.useState(false);

  const handleClick = () => {
    if (onCopy) {
      onCopy(quote);
    } else {
      navigator.clipboard.writeText(quote);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleClick}
      className="relative p-3 bg-white rounded-lg border border-zinc-200 hover:border-zinc-300 cursor-pointer transition-all duration-150 group"
    >
      <p className="text-sm text-zinc-700 leading-relaxed italic">"{quote}"</p>
      <div className={cn(
        "absolute inset-0 rounded-lg flex items-center justify-center bg-white/95 transition-opacity duration-150",
        copied ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <div className="flex items-center gap-1 text-green-600">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">Copied!</span>
        </div>
      </div>
      <div className="absolute bottom-2 right-3 text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <Copy className="w-3 h-3" />
        click to copy
      </div>
    </div>
  );
}

// Loading state for objections
function ObjectionLoadingState() {
  return (
    <div className="flex items-center justify-center py-4 text-zinc-400">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
        <p className="text-sm">Analyzing for potential objections...</p>
      </div>
    </div>
  );
}

// No Analysis State
function NoAnalysisState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
      <Zap className="w-8 h-8 mb-2 opacity-50" />
      <p className="text-sm text-center">AI analysis will appear here</p>
    </div>
  );
}

// Default initial state - all beliefs at 0%
const DEFAULT_ANALYSIS: AmmoV2Analysis = {
  engagement: { level: 'medium', reason: 'Waiting for conversation data...' },
  beliefs: {
    problem: 0,
    solution: 0,
    vehicle: 0,
    self: 0,
    time: 0,
    money: 0,
    urgency: 0,
  },
  objectionPrediction: [],
  painPoints: [],
};

// Main Ammo V2 Panel Component
interface AmmoV2PanelProps {
  analysis: AmmoV2Analysis | null;
  onCopy?: (text: string) => void;
  compact?: boolean;
  showTitle?: boolean;
}

export function AmmoV2Panel({
  analysis,
  onCopy,
  compact = false,
  showTitle = true,
}: AmmoV2PanelProps) {
  // Use actual analysis if available, otherwise show default state with 0% values
  const displayAnalysis = analysis || DEFAULT_ANALYSIS;
  const hasRealData = analysis !== null;
  const engagementStyle = ENGAGEMENT_STYLES[displayAnalysis.engagement.level];

  if (!hasRealData && compact) {
    return <NoAnalysisState />;
  }

  return (
    <div className={cn("flex flex-col space-y-4", compact ? "p-2" : "p-0")}>
      {/* Engagement Section */}
      <div className="p-4 bg-white rounded-lg border border-zinc-200">
        <div className="flex items-center justify-between mb-2">
          {showTitle && (
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Engagement</h3>
          )}
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-semibold",
              engagementStyle.bg,
              engagementStyle.text,
              engagementStyle.border
            )}
          >
            {displayAnalysis.engagement.level.toUpperCase()}
          </Badge>
        </div>
        <p className="text-sm text-zinc-600 leading-relaxed">{displayAnalysis.engagement.reason}</p>
      </div>

      {/* Buying Beliefs Section */}
      <div className="p-4 bg-white rounded-lg border border-zinc-200">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Buying Beliefs</h3>
        <div className="space-y-3">
          {(Object.keys(BELIEF_LABELS) as Array<keyof AmmoV2Analysis['beliefs']>).map((key) => (
            <BeliefBar key={key} beliefKey={key} value={displayAnalysis.beliefs[key]} />
          ))}
        </div>
      </div>

      {/* Objection Prediction Section */}
      <div className="p-4 bg-white rounded-lg border border-zinc-200">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-zinc-500" />
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Likely Objections</h3>
        </div>
        {!hasRealData ? (
          <ObjectionLoadingState />
        ) : displayAnalysis.objectionPrediction.length > 0 ? (
          <div className="space-y-2">
            {displayAnalysis.objectionPrediction.map((obj, idx) => (
              <ObjectionCard key={idx} type={obj.type} probability={obj.probability} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 text-center py-2">No objections predicted yet</p>
        )}
      </div>

      {/* Pain Points Section */}
      <div className="p-4 bg-white rounded-lg border border-zinc-200">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareQuote className="w-4 h-4 text-zinc-500" />
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pain Points</h3>
          {displayAnalysis.painPoints.length > 0 && (
            <Badge variant="secondary" className="text-xs">{displayAnalysis.painPoints.length}</Badge>
          )}
        </div>
        {displayAnalysis.painPoints.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {displayAnalysis.painPoints.map((quote, idx) => (
              <PainPointQuote key={idx} quote={quote} onCopy={onCopy} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 text-center py-2">
            {hasRealData ? 'No pain points captured yet' : 'Listening for pain points...'}
          </p>
        )}
      </div>

      {/* Last Updated */}
      {displayAnalysis.analyzedAt && (
        <p className="text-xs text-zinc-400 text-center">
          Last updated: {new Date(displayAnalysis.analyzedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

// Compact version for live call cards (shows just key metrics)
interface AmmoV2CompactProps {
  analysis: AmmoV2Analysis | null;
}

export function AmmoV2Compact({ analysis }: AmmoV2CompactProps) {
  if (!analysis) {
    return (
      <div className="text-xs text-zinc-400 text-center py-2">
        AI analysis pending...
      </div>
    );
  }

  const engagementStyle = ENGAGEMENT_STYLES[analysis.engagement.level];

  // Calculate average belief score
  const beliefValues = Object.values(analysis.beliefs);
  const avgBelief = Math.round(beliefValues.reduce((a, b) => a + b, 0) / beliefValues.length);

  // Find the top objection
  const topObjection = analysis.objectionPrediction[0];

  return (
    <div className="space-y-2">
      {/* Engagement Badge */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-semibold",
            engagementStyle.bg,
            engagementStyle.text,
            engagementStyle.border
          )}
        >
          {analysis.engagement.level.toUpperCase()} ENGAGEMENT
        </Badge>
        <span className="text-xs text-zinc-500">
          Avg Belief: {avgBelief}%
        </span>
      </div>

      {/* Top objection if exists */}
      {topObjection && topObjection.probability >= 30 && (
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <AlertTriangle className="w-3 h-3" />
          <span>
            Likely: {OBJECTION_LABELS[topObjection.type] || topObjection.type}
          </span>
        </div>
      )}

      {/* Pain points count */}
      {analysis.painPoints.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <MessageSquareQuote className="w-3 h-3" />
          <span>{analysis.painPoints.length} pain point{analysis.painPoints.length !== 1 ? 's' : ''} captured</span>
        </div>
      )}
    </div>
  );
}
