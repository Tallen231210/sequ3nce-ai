import React from 'react';
import type { CloserInfo } from '../convex';

interface JobBoardViewProps {
  closerInfo: CloserInfo;
}

// Temporary "coming soon" placeholder until job postings are available.
// Full implementation is preserved in git history — restore from the commit
// before this change when postings go live.
export function JobBoardView({ closerInfo }: JobBoardViewProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-black mb-1">Opportunities Coming Soon</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            We're building a marketplace that connects top closers with high-ticket sales teams.
            Check back soon for exclusive opportunities.
          </p>
        </div>
      </div>
    </div>
  );
}
