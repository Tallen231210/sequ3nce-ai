"use client";

import React from "react";
import { Logo } from "@/components/ui/logo";

// ==================== Types ====================

export interface ProfileData {
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  photoUrl: string | null;
  industries: string[];
  ticketRange: string | null;
  skills: string[];
  socialLinks: {
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
    calendly?: string;
  } | null;
  isAvailable?: boolean;
  introVideoUrl?: string | null;
  highlightReelUrl?: string | null;
  whatsappNumber?: string | null;
  stats: {
    callsCompleted: number;
    closeRate: number | null;
    cashCollected: number;
    avgDealSize: number | null;
    avgDuration: number | null;
    talkRatio: number | null;
  } | null;
}

// ==================== Utilities ====================

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}k`;
  return `$${amount.toLocaleString()}`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

export function extractVideoEmbedUrl(url: string): { embedUrl: string; platform: string } | null {
  if (!url) return null;
  const lower = url.toLowerCase();

  // Loom
  if (lower.includes("loom.com/share/")) {
    const id = url.split("/share/")[1]?.split("?")[0];
    if (id) return { embedUrl: `https://www.loom.com/embed/${id}`, platform: "Loom" };
  }

  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s]+)/);
  if (ytMatch) return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`, platform: "YouTube" };

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return { embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`, platform: "Vimeo" };

  return null;
}

// ==================== Components ====================

export function NavBar() {
  return (
    <nav className="flex items-center justify-center py-5 border-b border-zinc-100">
      <Logo height={20} href="https://sequ3nce.ai" />
    </nav>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-zinc-900 uppercase tracking-wider mb-4">
      {children}
    </h2>
  );
}

export function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
  );
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
      <VerifiedIcon className="w-3 h-3" />
      Verified by Sequ3nce
    </span>
  );
}

export function AvailableBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
      Available for Hire
    </span>
  );
}

export function SocialIcons({ links }: { links: NonNullable<ProfileData["socialLinks"]> }) {
  const items = [
    { url: links.linkedin, label: "LinkedIn", icon: (
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    )},
    { url: links.twitter, label: "X", icon: (
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    )},
    { url: links.instagram, label: "Instagram", icon: (
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    )},
    { url: links.website, label: "Website", icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    )},
    { url: links.calendly, label: "Book a Call", icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    )},
  ].filter((item) => item.url);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {items.map(({ url, label, icon }) => {
        const isFilled = label === "LinkedIn" || label === "X" || label === "Instagram";
        return (
          <a
            key={label}
            href={url!}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-50 border border-zinc-200 text-zinc-400 hover:text-zinc-600 hover:border-zinc-300 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFilled ? "currentColor" : "none"} stroke={isFilled ? "none" : "currentColor"} strokeWidth={isFilled ? 0 : 1.5}>
              {icon}
            </svg>
          </a>
        );
      })}
    </div>
  );
}

// ==================== Featured Stat ====================

export function FeaturedStat({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return (
    <div className="text-center py-8">
      <p className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
        Cash Collected
      </p>
      <p className="text-[56px] font-black text-zinc-900 tracking-tight leading-none">
        {formatCurrency(amount)}
      </p>
      <div className="flex items-center justify-center gap-1 mt-2">
        <VerifiedIcon className="w-4 h-4 text-emerald-500" />
        <span className="text-[12px] text-zinc-400 font-medium">Verified by Sequ3nce</span>
      </div>
    </div>
  );
}

// ==================== Stats Grid ====================

export function StatsGrid({ stats }: { stats: ProfileData["stats"] }) {
  if (!stats) {
    return (
      <div className="py-10 px-6 text-center bg-zinc-50 border border-zinc-200 rounded-2xl">
        <svg className="w-8 h-8 mx-auto text-zinc-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <p className="text-[14px] text-zinc-400">No verified stats yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <SectionHeading>Verified Stats</SectionHeading>
        <VerifiedBadge />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Close Rate with progress bar */}
        <StatCard label="Close Rate" value={stats.closeRate !== null ? `${stats.closeRate}%` : "—"}>
          {stats.closeRate !== null && (
            <div className="w-full h-1.5 bg-zinc-100 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-zinc-900 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(stats.closeRate, 100)}%` }}
              />
            </div>
          )}
        </StatCard>

        {/* Calls Completed */}
        <StatCard label="Calls Completed" value={stats.callsCompleted.toLocaleString()} />

        {/* Avg Deal Size */}
        <StatCard
          label="Avg Deal Size"
          value={stats.avgDealSize !== null ? formatCurrency(stats.avgDealSize) : "—"}
        />

        {/* Avg Duration */}
        <StatCard
          label="Avg Duration"
          value={stats.avgDuration !== null ? formatDuration(stats.avgDuration) : "—"}
        />

        {/* Talk / Listen with split bar */}
        <StatCard
          label="Talk / Listen"
          value={stats.talkRatio !== null ? `${stats.talkRatio}% / ${100 - stats.talkRatio}%` : "—"}
        >
          {stats.talkRatio !== null && (
            <div className="flex w-full h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-zinc-900 transition-all duration-500"
                style={{ width: `${stats.talkRatio}%` }}
              />
              <div
                className="h-full bg-zinc-200 transition-all duration-500"
                style={{ width: `${100 - stats.talkRatio}%` }}
              />
            </div>
          )}
        </StatCard>
      </div>
    </div>
  );
}

function StatCard({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="relative px-5 py-4 bg-white border border-zinc-200 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default">
      <p className="text-[12px] text-zinc-400 font-medium mb-1">{label}</p>
      <p className="text-[28px] font-bold text-zinc-900 tracking-tight">{value}</p>
      {children}
    </div>
  );
}

// ==================== Highlight Reel ====================

export interface PublicClip {
  _id: string;
  callId: string;
  label: string;
  startTime: number;
  endTime: number;
  isFullCall: boolean;
  blurRegion: string;
  sortOrder: number;
  recordingUrl: string | null;
}

function formatClipDuration(startTime: number, endTime: number): string {
  const totalSec = Math.round(endTime - startTime);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HighlightReelSection({ clips }: { clips: PublicClip[] }) {
  if (clips.length === 0) return null;

  return (
    <section className="mt-10">
      <SectionHeading>Highlight Reel</SectionHeading>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clips.map((clip) => (
          <ReelVideoCard key={clip._id} clip={clip} />
        ))}
      </div>
    </section>
  );
}

function ReelVideoCard({ clip }: { clip: PublicClip }) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  if (!clip.recordingUrl) {
    return (
      <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50">
        <div className="aspect-video flex items-center justify-center text-[14px] text-zinc-400">
          Recording unavailable
        </div>
        <div className="px-4 py-3 border-t border-zinc-100">
          <p className="text-[14px] font-medium text-zinc-900 truncate">{clip.label}</p>
        </div>
      </div>
    );
  }

  const timeFragment = clip.isFullCall ? '' : `#t=${clip.startTime},${clip.endTime}`;

  function handleTogglePlay() {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  }

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-200 bg-white hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-black cursor-pointer" onClick={handleTogglePlay}>
        <video
          ref={videoRef}
          src={`${clip.recordingUrl}${timeFragment}`}
          className="w-full h-full object-contain"
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          playsInline
        />

        {/* CSS Blur overlay on prospect side */}
        {clip.blurRegion !== 'none' && (
          <div
            className="absolute top-0 h-full pointer-events-none"
            style={{
              [clip.blurRegion === 'left' ? 'left' : 'right']: 0,
              width: '50%',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              background: 'rgba(255, 255, 255, 0.15)',
            }}
          />
        )}

        {/* Play overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-zinc-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Label + duration */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
        <p className="text-[14px] font-medium text-zinc-900 truncate">{clip.label}</p>
        <span className="text-[12px] text-zinc-400 font-mono shrink-0 ml-2">
          {formatClipDuration(clip.startTime, clip.endTime)}
        </span>
      </div>
    </div>
  );
}

// ==================== Video Embed ====================

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const result = extractVideoEmbedUrl(url);
  if (!result) return null;

  return (
    <section className="mt-10">
      <SectionHeading>{title}</SectionHeading>
      <div className="aspect-video rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50">
        <iframe
          src={result.embedUrl}
          title={title}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </section>
  );
}

// ==================== WhatsApp CTA ====================

export function WhatsAppCTA({ number, name }: { number: string; name: string }) {
  const message = encodeURIComponent(
    `Hi ${name}, I came across your Sequ3nce profile and I'm interested in discussing a sales opportunity.`
  );
  return (
    <a
      href={`https://wa.me/${number}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 text-[14px] font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      Message Me
    </a>
  );
}

// ==================== Verified Explanation ====================

export function VerifiedExplanation() {
  return (
    <section className="mt-16 py-8 border-t border-zinc-100">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <VerifiedIcon className="w-6 h-6 text-emerald-500" />
          <span className="text-[16px] font-bold text-zinc-900">Verified by</span>
          <Logo height={28} href="https://sequ3nce.ai" />
        </div>
        <p className="text-[13px] text-zinc-500 leading-relaxed">
          All statistics on this profile are computed from actual recorded sales calls.
          Close rates, cash collected, and performance metrics are verified by
          Sequ3nce&apos;s call intelligence platform — not self-reported.
        </p>
      </div>
    </section>
  );
}

// ==================== Expertise Section ====================

export function ExpertiseSection({ industries, ticketRange, skills }: {
  industries: string[];
  ticketRange: string | null;
  skills: string[];
}) {
  if (industries.length === 0 && !ticketRange && skills.length === 0) return null;

  return (
    <section className="mt-10">
      <SectionHeading>Expertise</SectionHeading>
      <div className="space-y-5">
        {industries.length > 0 && (
          <div>
            <p className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Industries</p>
            <div className="flex flex-wrap gap-2">
              {industries.map((industry) => (
                <span
                  key={industry}
                  className="px-3 py-1.5 text-[13px] font-medium text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-full"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>
        )}

        {ticketRange && (
          <div>
            <p className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Ticket Range</p>
            <span className="inline-flex px-4 py-2 text-[14px] font-semibold text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-xl">
              {ticketRange}
            </span>
          </div>
        )}

        {skills.length > 0 && (
          <div>
            <p className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Skills</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1.5 text-[13px] font-medium text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ==================== Footer ====================

export function ProfileFooter() {
  return (
    <footer className="mt-8 pb-10 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[13px] text-zinc-400">
        Powered by
        <Logo height={14} href="https://sequ3nce.ai" />
      </div>
    </footer>
  );
}
