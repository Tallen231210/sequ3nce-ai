"use client";

import React from 'react';
import type { CallAnalysis } from '@/lib/closer/client';

interface CallDetailAnalysisTabProps {
  callAnalysis: CallAnalysis | undefined;
  isRecent?: boolean;
}

export function CallDetailAnalysisTab({ callAnalysis, isRecent }: CallDetailAnalysisTabProps) {
  if (!callAnalysis) {
    if (isRecent) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-gray-500">Analysis pending...</span>
          <span className="text-[11px] text-gray-400">This usually takes a few seconds after the call ends</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <span className="text-[13px] text-gray-500">Analysis not available for this call</span>
      </div>
    );
  }

  const dimensions = [
    { key: 'opening', label: 'Opening', data: callAnalysis.analysis.opening },
    { key: 'discovery', label: 'Discovery', data: callAnalysis.analysis.discovery },
    { key: 'presentation', label: 'Presentation', data: callAnalysis.analysis.presentation },
    { key: 'objectionHandling', label: 'Objection Handling', data: callAnalysis.analysis.objectionHandling },
    { key: 'closing', label: 'Closing', data: callAnalysis.analysis.closing },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Sales Process Scores */}
      <div>
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Sales Process Analysis
        </h3>
        <div className="space-y-2">
          {dimensions.map(({ key, label, data }) => (
            <ScoreCard key={key} label={label} score={data.score} summary={data.summary} />
          ))}
        </div>
      </div>

      {/* Call Flow */}
      <div>
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Call Flow
        </h3>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="space-y-2">
            {callAnalysis.callSequence.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="flex flex-col items-center shrink-0 mt-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  {i < callAnalysis.callSequence.length - 1 && (
                    <div className="w-px h-4 bg-gray-300 mt-0.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[12px] font-semibold text-black">{step.phase}</span>
                  <p className="text-[11px] text-gray-500 leading-snug">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, score, summary }: { label: string; score: string; summary: string }) {
  const scoreConfig = getScoreConfig(score);

  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="shrink-0 w-[120px]">
        <span className="text-[13px] font-medium text-black">{label}</span>
        <div className="mt-1">
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
            style={{ color: scoreConfig.color, backgroundColor: scoreConfig.bg }}
          >
            {scoreConfig.label}
          </span>
        </div>
      </div>
      <p className="text-[12px] text-gray-600 leading-relaxed flex-1">{summary}</p>
    </div>
  );
}

function getScoreConfig(score: string): { label: string; color: string; bg: string } {
  switch (score.toLowerCase()) {
    case 'strong':
      return { label: 'Strong', color: '#17a034', bg: '#f0fdf0' };
    case 'adequate':
      return { label: 'Adequate', color: '#b45309', bg: '#fffbeb' };
    case 'weak':
      return { label: 'Weak', color: '#dc2626', bg: '#fef2f2' };
    default:
      return { label: score, color: '#808080', bg: '#f3f3f3' };
  }
}
