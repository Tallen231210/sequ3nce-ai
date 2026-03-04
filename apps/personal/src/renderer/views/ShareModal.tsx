import React, { useEffect, useState, useRef } from 'react';
import type { CloserInfo, SharedLinkInfo } from '../convex';
import { createSharedLink, getSharedLinksForCall, revokeSharedLink } from '../convex';

interface ShareModalProps {
  callId: string;
  closerInfo: CloserInfo;
  onClose: () => void;
}

export function ShareModal({ callId, closerInfo, onClose }: ShareModalProps) {
  const [existingLinks, setExistingLinks] = useState<SharedLinkInfo[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password state
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadLinks();
  }, [callId]);

  async function loadLinks() {
    setIsLoadingLinks(true);
    const links = await getSharedLinksForCall(callId);
    if (mountedRef.current) {
      setExistingLinks(links.filter((l) => l.isActive));
      setIsLoadingLinks(false);
    }
  }

  async function handleGenerate(accessType: 'full_access' | 'compliance') {
    setIsGenerating(true);
    setGeneratingType(accessType);
    setError(null);
    setGeneratedUrl(null);

    const opts: { accessType: 'full_access' | 'compliance'; password?: string } = { accessType };
    if (accessType === 'full_access' && passwordEnabled && password.trim()) {
      opts.password = password.trim();
    }

    const result = await createSharedLink(callId, closerInfo.closerId, closerInfo.teamId, opts);

    if (!mountedRef.current) return;
    setIsGenerating(false);
    setGeneratingType(null);

    if (result) {
      setGeneratedUrl(result.url);
      copyToClipboard(result.url);
      loadLinks();
    } else {
      setError('Failed to generate link. Please try again.');
    }
  }

  async function handleRevoke(linkId: string) {
    const ok = await revokeSharedLink(linkId);
    if (ok && mountedRef.current) {
      setExistingLinks((prev) => prev.filter((l) => l._id !== linkId));
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => { if (mountedRef.current) setCopied(false); }, 2000);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[560px] max-h-[85vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Share Recording</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Link type cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* Full Access Card */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Full Access</h3>
              </div>
              <ul className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
                <li>Video + full transcript + AI analysis</li>
                <li>For coaches, mentors, team leads</li>
              </ul>
              {/* Password toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={passwordEnabled}
                  onChange={(e) => setPasswordEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] text-gray-600 dark:text-gray-400">Password protect</span>
              </label>
              {passwordEnabled && (
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a password"
                  maxLength={128}
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-400"
                />
              )}
              <button
                onClick={() => handleGenerate('full_access')}
                disabled={isGenerating || (passwordEnabled && !password.trim())}
                className="w-full py-2 text-[12px] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating && generatingType === 'full_access' ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : (
                  'Generate Link'
                )}
              </button>
            </div>

            {/* Compliance Safe Card */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Compliance Safe</h3>
              </div>
              <ul className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
                <li>Video + AI-redacted transcript</li>
                <li>Names, amounts, PII replaced with [REDACTED]</li>
                <li>For social media & public sharing</li>
              </ul>
              <button
                onClick={() => handleGenerate('compliance')}
                disabled={isGenerating}
                className="w-full py-2 text-[12px] font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating && generatingType === 'compliance' ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redacting transcript...
                  </span>
                ) : (
                  'Generate Link'
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] text-red-500 text-center">{error}</p>
          )}

          {/* Generated URL */}
          {generatedUrl && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 flex items-center gap-2">
              <input
                type="text"
                value={generatedUrl}
                readOnly
                className="flex-1 text-[12px] bg-transparent text-gray-700 dark:text-gray-300 outline-none truncate"
              />
              <button
                onClick={() => copyToClipboard(generatedUrl)}
                className="shrink-0 px-3 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}

          {/* Existing Links */}
          {!isLoadingLinks && existingLinks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Active Links ({existingLinks.length})
              </h4>
              <div className="space-y-1.5">
                {existingLinks.map((link) => (
                  <ExistingLinkRow
                    key={link._id}
                    link={link}
                    onRevoke={() => handleRevoke(link._id)}
                    onCopy={() => copyToClipboard(link.url)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExistingLinkRow({
  link,
  onRevoke,
  onCopy,
}: {
  link: SharedLinkInfo;
  onRevoke: () => void;
  onCopy: () => void;
}) {
  const [copiedRow, setCopiedRow] = useState(false);
  const isCompliance = link.accessType === 'compliance';

  function handleCopy() {
    onCopy();
    setCopiedRow(true);
    setTimeout(() => setCopiedRow(false), 1500);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md">
      {/* Type badge */}
      <span
        className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full ${
          isCompliance
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
            : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
        }`}
      >
        {isCompliance ? 'Compliance' : 'Full Access'}
      </span>
      {link.hasPassword && (
        <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
      {/* URL */}
      <span className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
        {link.url}
      </span>
      {/* Date */}
      <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
        {new Date(link.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
      {/* Copy */}
      <button
        onClick={handleCopy}
        className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        title="Copy link"
      >
        {copiedRow ? (
          <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
      {/* Revoke */}
      <button
        onClick={onRevoke}
        className="shrink-0 p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        title="Revoke link"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
