"use client";

import React, { useEffect, useState, useRef } from 'react';
import type { CloserInfo, TeamResource } from '@/lib/closer/client';
import { getActiveResources } from '@/lib/closer/client';

interface ResourcesViewProps {
  closerInfo: CloserInfo;
}

export function ResourcesView({ closerInfo }: ResourcesViewProps) {
  const [resources, setResources] = useState<TeamResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Re-arm on every run. React's development double-mount fires the cleanup
    // below and then re-runs this effect on the SAME component instance, so a
    // ref left at false silently discards every response that follows and the
    // view sits on "Loading…" forever. Setting it here rather than only at
    // useRef(true) makes the mount and unmount symmetrical.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    setIsLoading(true);
    getActiveResources(closerInfo.teamId).then((r) => {
      if (!mountedRef.current) return;
      setResources(r);
      setIsLoading(false);
    }).catch((err) => {
      console.error('[Resources] Failed to load:', err);
      if (mountedRef.current) setIsLoading(false);
    });
  }, [closerInfo.teamId]);

  function handleCopy(resource: TeamResource) {
    const text = resource.url || resource.content || '';
    try { navigator.clipboard.writeText(text); } catch {}
    setCopiedId(resource._id);
    const t = setTimeout(() => { if (mountedRef.current) setCopiedId(null); }, 2000);
    timeoutsRef.current.push(t);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[14px] text-gray-500">Loading resources...</span>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">No Resources Yet</h2>
        <p className="text-[14px] text-gray-500 max-w-sm">
          Sales scripts, payment links, and documents from your manager will appear here.
        </p>
      </div>
    );
  }

  const typeConfig: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    script: {
      label: 'Script',
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
    },
    payment_link: {
      label: 'Payment Link',
      bg: 'bg-green-50',
      text: 'text-green-600',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
      ),
    },
    document: {
      label: 'Document',
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
    },
    link: {
      label: 'Link',
      bg: 'bg-orange-50',
      text: 'text-orange-600',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h1 className="text-2xl font-bold text-black">Resources</h1>
        <p className="text-[14px] text-gray-500 mt-1">Sales scripts, payment links, and documents from your manager.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-2">
        {resources.map((resource) => {
          const tc = typeConfig[resource.type] || typeConfig.link;
          const urlOrContent = resource.url || resource.content;
          const isCopied = copiedId === resource._id;

          return (
            <div key={resource._id} className="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
              {/* Icon */}
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tc.bg} ${tc.text}`}>
                {tc.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-[14px] font-semibold text-black truncate">{resource.title}</h3>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tc.bg} ${tc.text}`}>
                    {tc.label}
                  </span>
                </div>
                {resource.description && (
                  <p className="text-[12px] text-gray-500 mb-1">{resource.description}</p>
                )}
                {resource.type === 'script' && resource.content && (
                  <p className="text-[12px] text-gray-400 line-clamp-2 italic">{resource.content}</p>
                )}
              </div>

              {/* Actions */}
              {urlOrContent && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(resource)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  {resource.url && (
                    <button
                      onClick={() => window.open(resource.url!, '_blank')}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
