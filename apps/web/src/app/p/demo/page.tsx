"use client";

import {
  type ProfileData,
  NavBar,
  SocialIcons,
  AvailableBadge,
  WhatsAppCTA,
  FeaturedStat,
  StatsGrid,
  VideoEmbed,
  SectionHeading,
  ExpertiseSection,
  VerifiedExplanation,
  ProfileFooter,
  getInitials,
} from "../[slug]/ProfileComponents";

const mockProfile: ProfileData = {
  name: "Marcus Rivera",
  headline: "High-Ticket Sales Closer | Coaching & Info Products",
  bio: "7 years of high-ticket closing experience across coaching, agency, and info product spaces. Consistently close at 35%+ on cold-set calls. Specialize in consultative selling for offers $3k\u2013$25k. Former D1 athlete \u2014 I bring the same competitive intensity to every call.\n\nLooking for setter-closer teams running 20+ calls/week with warm traffic and a proven offer.",
  location: "Miami, FL",
  photoUrl: null,
  industries: ["Coaching", "Info Products", "Agencies", "SaaS"],
  ticketRange: "$3k-$10k",
  skills: ["Consultative Selling", "Objection Handling", "Tonality", "Follow-Up Sequences", "CRM Management", "Discovery Calls"],
  socialLinks: {
    linkedin: "https://linkedin.com/in/example",
    twitter: "https://x.com/example",
    instagram: "https://instagram.com/example",
    calendly: "https://calendly.com/example",
  },
  isAvailable: true,
  introVideoUrl: "https://www.loom.com/share/example123",
  highlightReelUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  whatsappNumber: "15551234567",
  stats: {
    callsCompleted: 847,
    closeRate: 36,
    cashCollected: 2_340_000,
    avgDealSize: 6_800,
    avgDuration: 2280,
    talkRatio: 42,
  },
};

export default function DemoProfilePage() {
  const profile = mockProfile;

  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      <main className="max-w-[680px] lg:max-w-[960px] mx-auto px-6 pt-10 pb-20">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center mb-10">
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

          <h1 className="text-[32px] font-bold text-zinc-900 mb-1 leading-tight">
            {profile.name}
          </h1>

          {profile.headline && (
            <p className="text-[16px] text-zinc-500 mb-3 max-w-md">
              {profile.headline}
            </p>
          )}

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
            {profile.isAvailable && <AvailableBadge />}
          </div>

          {profile.socialLinks && (
            <div className="mb-5">
              <SocialIcons links={profile.socialLinks} />
            </div>
          )}

          {profile.whatsappNumber && (
            <WhatsAppCTA number={profile.whatsappNumber} name={profile.name} />
          )}
        </div>

        {/* Featured Stat */}
        {profile.stats && profile.stats.cashCollected > 0 && (
          <FeaturedStat amount={profile.stats.cashCollected} />
        )}

        {/* Stats Grid */}
        <StatsGrid stats={profile.stats} />

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

        {/* Highlight Reel — placeholder for demo */}
        <section className="mt-10">
          <SectionHeading>Highlight Reel</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['Handles Price Objection', 'Discovery — Uncovering Pain Points'].map((label) => (
              <div key={label} className="rounded-xl overflow-hidden border border-zinc-200 bg-white">
                <div className="aspect-video bg-zinc-100 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-10 h-10 mx-auto text-zinc-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    <p className="text-[13px] text-zinc-400">Call recording clip</p>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
                  <p className="text-[14px] font-medium text-zinc-900">{label}</p>
                  <span className="text-[12px] text-zinc-400 font-mono">2:34</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* External Highlight Reel (fallback) */}
        {profile.highlightReelUrl && (
          <VideoEmbed url={profile.highlightReelUrl} title="Highlight Reel" />
        )}

        {/* Expertise */}
        <ExpertiseSection
          industries={profile.industries}
          ticketRange={profile.ticketRange}
          skills={profile.skills}
        />

        {/* Verified by Sequ3nce */}
        <VerifiedExplanation />

        {/* Footer */}
        <ProfileFooter />
      </main>
    </div>
  );
}
