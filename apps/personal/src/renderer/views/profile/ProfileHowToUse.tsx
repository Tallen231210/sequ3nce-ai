import React, { useEffect, useRef, useState } from 'react';

// ============================================================================
// "How closers use this profile" — the profile had no stated purpose, so
// nobody built one. Two lines that give it a job (DM it; attach it to a
// resume) and a copy-link button so the link is one click away.
// Copy deliberately avoids "high-ticket" (co-founder's no-list).
// ============================================================================

interface ProfileHowToUseProps {
  profileSlug: string | null;
}

export function ProfileHowToUse({ profileSlug }: ProfileHowToUseProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetRef.current) clearTimeout(resetRef.current); }, []);

  const url = profileSlug ? `https://sequ3nce.ai/p/${profileSlug}` : null;

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (rare in Electron); the link is shown next to the button anyway.
    }
  }

  return (
    <div
      data-testid="profile-how-to"
      className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
    >
      <p className="text-[13px] font-semibold text-gray-900 dark:text-white">How closers use this profile</p>
      <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">
        <li>
          <strong className="text-gray-900 dark:text-white">DM it.</strong> Owners of premium offers — coaching,
          info products, agencies — hire from their DMs, not job boards. When you reach out on Instagram or
          LinkedIn, send your link. It answers &ldquo;who are you?&rdquo; before they ask.
        </li>
        <li>
          <strong className="text-gray-900 dark:text-white">Attach it.</strong> Applying with a resume? Put the
          link on it. Your recorded calls and verified numbers are the proof a resume can&apos;t carry.
        </li>
      </ul>
      <div className="mt-3 flex items-center gap-3 min-w-0">
        <button
          type="button"
          data-testid="profile-copy-link"
          onClick={copyLink}
          disabled={!url}
          className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
            url
              ? 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {copied ? 'Copied' : url ? 'Copy profile link' : 'Claim your URL below first'}
        </button>
        {url && (
          <span className="text-[12px] text-gray-500 dark:text-gray-400 truncate">{url.replace('https://', '')}</span>
        )}
      </div>
    </div>
  );
}
