"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";

const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");

interface PublicProfile {
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
  stats: {
    callsCompleted: number;
    closeRate: number | null;
    cashCollected: number;
    avgDealSize: number | null;
    avgDuration: number | null;
    talkRatio: number | null;
  } | null;
}

// ==================== Utility Functions ====================

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}k`;
  return `$${amount.toLocaleString()}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

// ==================== Main Page ====================

export default function PublicProfilePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    async function fetchProfile() {
      try {
        const response = await fetch(
          `${CONVEX_SITE_URL}/b2c/public-profile?slug=${encodeURIComponent(slug)}`
        );

        if (response.status === 404) {
          setError("not_found");
          return;
        }
        if (!response.ok) {
          setError("error");
          return;
        }

        const data = await response.json();
        setProfile(data);
      } catch {
        setError("error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [slug]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <div className="max-w-[680px] mx-auto px-6 pt-16">
          <div className="flex flex-col items-center gap-6 animate-pulse">
            <div className="w-[120px] h-[120px] rounded-full bg-zinc-100" />
            <div className="h-7 w-48 bg-zinc-100 rounded-lg" />
            <div className="h-5 w-64 bg-zinc-100 rounded-lg" />
            <div className="grid grid-cols-2 gap-4 w-full mt-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 bg-zinc-50 rounded-xl border border-zinc-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error / not found state
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <div className="max-w-[680px] mx-auto px-6 pt-32 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-zinc-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Profile not found</h1>
          <p className="text-[15px] text-zinc-500">
            This closer profile doesn&apos;t exist or isn&apos;t available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      <main className="max-w-[680px] mx-auto px-6 pt-10 pb-20">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center mb-10">
          {/* Photo */}
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt={profile.name}
              className="w-[120px] h-[120px] rounded-full object-cover border-4 border-white shadow-lg shadow-zinc-200/50 mb-5"
            />
          ) : (
            <div className="w-[120px] h-[120px] rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 flex items-center justify-center border-4 border-white shadow-lg shadow-zinc-200/50 mb-5">
              <span className="text-3xl font-semibold text-zinc-500">
                {getInitials(profile.name)}
              </span>
            </div>
          )}

          {/* Name */}
          <h1 className="text-2xl font-bold text-zinc-900 mb-1">
            {profile.name}
          </h1>

          {/* Headline */}
          {profile.headline && (
            <p className="text-[16px] text-zinc-500 mb-3 max-w-md">
              {profile.headline}
            </p>
          )}

          {/* Location */}
          {profile.location && (
            <div className="flex items-center gap-1.5 text-[14px] text-zinc-400 mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {profile.location}
            </div>
          )}

          {/* Social Links */}
          {profile.socialLinks && (
            <SocialIcons links={profile.socialLinks} />
          )}
        </div>

        {/* Verified Stats */}
        <StatsGrid stats={profile.stats} />

        {/* About */}
        {profile.bio && (
          <section className="mt-10">
            <SectionHeading>About</SectionHeading>
            <p className="text-[15px] text-zinc-600 leading-relaxed whitespace-pre-line">
              {profile.bio}
            </p>
          </section>
        )}

        {/* Expertise */}
        {(profile.industries.length > 0 || profile.ticketRange || profile.skills.length > 0) && (
          <section className="mt-10">
            <SectionHeading>Expertise</SectionHeading>
            <div className="space-y-5">
              {profile.industries.length > 0 && (
                <div>
                  <p className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Industries</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.industries.map((industry) => (
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

              {profile.ticketRange && (
                <div>
                  <p className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Ticket Range</p>
                  <span className="inline-flex px-4 py-2 text-[14px] font-semibold text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-xl">
                    {profile.ticketRange}
                  </span>
                </div>
              )}

              {profile.skills.length > 0 && (
                <div>
                  <p className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
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
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-zinc-100 text-center">
          <p className="text-[12px] text-zinc-400 mb-1">
            Stats verified from actual recorded sales calls
          </p>
          <div className="flex items-center justify-center gap-1.5 text-[13px] text-zinc-400">
            Powered by
            <Logo height={14} href="https://sequ3nce.ai" />
          </div>
          <a
            href="https://sequ3nce.ai"
            className="inline-block mt-3 px-5 py-2 text-[13px] font-medium text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            Create your profile
          </a>
        </footer>
      </main>
    </div>
  );
}

// ==================== Sub-Components ====================

function NavBar() {
  return (
    <nav className="flex items-center justify-center py-5 border-b border-zinc-100">
      <Logo height={20} href="https://sequ3nce.ai" />
    </nav>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-zinc-900 uppercase tracking-wider mb-4">
      {children}
    </h2>
  );
}

function SocialIcons({ links }: { links: NonNullable<PublicProfile["socialLinks"]> }) {
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
            <svg className="w-4 h-4" viewBox={isFilled ? "0 0 24 24" : "0 0 24 24"} fill={isFilled ? "currentColor" : "none"} stroke={isFilled ? "none" : "currentColor"} strokeWidth={isFilled ? 0 : 1.5}>
              {icon}
            </svg>
          </a>
        );
      })}
    </div>
  );
}

function StatsGrid({ stats }: { stats: PublicProfile["stats"] }) {
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

  const statItems = [
    {
      label: "Close Rate",
      value: stats.closeRate !== null ? `${stats.closeRate}%` : "—",
    },
    {
      label: "Calls Completed",
      value: stats.callsCompleted.toLocaleString(),
    },
    {
      label: "Cash Collected",
      value: formatCurrency(stats.cashCollected),
    },
    {
      label: "Avg Deal Size",
      value: stats.avgDealSize !== null ? formatCurrency(stats.avgDealSize) : "—",
    },
    {
      label: "Avg Duration",
      value: stats.avgDuration !== null ? formatDuration(stats.avgDuration) : "—",
    },
    {
      label: "Talk / Listen",
      value: stats.talkRatio !== null ? `${stats.talkRatio}% / ${100 - stats.talkRatio}%` : "—",
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-[13px] font-semibold text-zinc-900 uppercase tracking-wider">
          Verified Stats
        </h2>
        <VerifiedBadge />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {statItems.map(({ label, value }) => (
          <div
            key={label}
            className="relative px-5 py-4 bg-white border border-zinc-200 rounded-xl"
          >
            <p className="text-[12px] text-zinc-400 font-medium mb-1">{label}</p>
            <p className="text-[22px] font-bold text-zinc-900 tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-zinc-400 mt-3 text-center flex items-center justify-center gap-1">
        <VerifiedIcon className="w-3 h-3 text-emerald-500" />
        Verified by Sequ3nce — based on actual recorded sales calls
      </p>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
      <VerifiedIcon className="w-3 h-3" />
      Verified
    </span>
  );
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
  );
}
