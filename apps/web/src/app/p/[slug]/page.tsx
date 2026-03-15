"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type ProfileData,
  type PublicClip,
  NavBar,
  SocialIcons,
  WhatsAppCTA,
  FeaturedStat,
  StatsGrid,
  VideoEmbed,
  HighlightReelSection,
  ExpertiseSection,
  VerifiedExplanation,
  ProfileFooter,
  getInitials,
} from "./ProfileComponents";

const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");

export default function PublicProfilePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [clips, setClips] = useState<PublicClip[]>([]);
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

    // Fetch highlight clips independently
    async function fetchClips() {
      try {
        const response = await fetch(
          `${CONVEX_SITE_URL}/b2c/highlight-clips/public?slug=${encodeURIComponent(slug)}`
        );
        if (response.ok) {
          const data = await response.json();
          setClips(data);
        }
      } catch {
        // Non-critical — clips just won't show
      }
    }
    fetchClips();
  }, [slug]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <div className="max-w-[680px] lg:max-w-[960px] mx-auto px-6 pt-16">
          <div className="flex flex-col items-center gap-6 animate-pulse">
            <div className="w-[160px] h-[160px] rounded-full bg-zinc-100" />
            <div className="h-8 w-48 bg-zinc-100 rounded-lg" />
            <div className="h-5 w-64 bg-zinc-100 rounded-lg" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 w-full mt-8">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-zinc-50 rounded-xl border border-zinc-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error / not found
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <div className="max-w-[680px] lg:max-w-[960px] mx-auto px-6 pt-32 text-center">
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

      <main className="max-w-[680px] lg:max-w-[960px] mx-auto px-6 pt-10 pb-20">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center mb-10">
          {/* Photo — 160px */}
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt={profile.name}
              className="w-[160px] h-[160px] rounded-full object-cover border-4 border-white shadow-lg shadow-zinc-200/50 mb-5"
            />
          ) : (
            <div className="w-[160px] h-[160px] rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 flex items-center justify-center border-4 border-white shadow-lg shadow-zinc-200/50 mb-5">
              <span className="text-4xl font-semibold text-zinc-500">
                {getInitials(profile.name)}
              </span>
            </div>
          )}

          {/* Name — 32px */}
          <h1 className="text-[32px] font-bold text-zinc-900 mb-1 leading-tight flex items-center gap-3">
            {profile.name}
            {profile.badges?.includes('founder') && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                Founder
              </span>
            )}
          </h1>

          {/* Headline */}
          {profile.headline && (
            <p className="text-[16px] text-zinc-500 mb-3 max-w-md">
              {profile.headline}
            </p>
          )}

          {/* Location + Available badge */}
          <div className="flex items-center gap-3 mb-4">
            {profile.location && (
              <div className="flex items-center gap-1.5 text-[14px] text-zinc-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                {profile.location}
              </div>
            )}
          </div>

          {/* Social Links */}
          {profile.socialLinks && (
            <div className="mb-5">
              <SocialIcons links={profile.socialLinks} />
            </div>
          )}

          {/* WhatsApp CTA */}
          {profile.whatsappNumber && (
            <WhatsAppCTA number={profile.whatsappNumber} name={profile.name} />
          )}
        </div>

        {/* Featured Stat — Cash Collected */}
        {profile.stats && profile.stats.cashCollected > 0 && (
          <FeaturedStat amount={profile.stats.cashCollected} isVerified={profile.isVerified !== false} />
        )}

        {/* Stats Grid */}
        <StatsGrid stats={profile.stats} isVerified={profile.isVerified !== false} />

        {/* Intro Video */}
        {profile.introVideoUrl && (
          <VideoEmbed url={profile.introVideoUrl} title="Intro Video" />
        )}

        {/* About */}
        {profile.bio && (
          <section className="mt-10">
            <h2 className="text-[13px] font-semibold text-zinc-900 uppercase tracking-wider mb-4">
              About
            </h2>
            <p className="text-[15px] text-zinc-600 leading-relaxed whitespace-pre-line">
              {profile.bio}
            </p>
          </section>
        )}

        {/* Highlight Reel — native clips take priority over external URL */}
        {clips.length > 0 ? (
          <HighlightReelSection clips={clips} />
        ) : profile.highlightReelUrl ? (
          <VideoEmbed url={profile.highlightReelUrl} title="Highlight Reel" />
        ) : null}

        {/* Expertise */}
        <ExpertiseSection
          industries={profile.industries}
          ticketRange={profile.ticketRange}
          skills={profile.skills}
        />

        {/* Verified by Sequ3nce */}
        <VerifiedExplanation isVerified={profile.isVerified !== false} />

        {/* Footer */}
        <ProfileFooter />
      </main>
    </div>
  );
}
