"use client";

import {
  type ProfileData,
  NavBar,
  SocialIcons,
  AvailableBadge,
  WhatsAppCTA,
  FeaturedStat,
  StatsGrid,
  SectionHeading,
  ExpertiseSection,
  VerifiedExplanation,
  ProfileFooter,
} from "../[slug]/ProfileComponents";

const mockProfile: ProfileData = {
  name: "Marcus Rivera",
  headline: "High-Ticket Sales Closer | $4.7M+ Collected | Coaching & Info Products",
  bio: "7 years of high-ticket closing experience across coaching, agency, and info product spaces. Consistently close at 35%+ on cold-set calls. Specialize in consultative selling for offers $3k\u2013$25k. Former D1 athlete \u2014 I bring the same competitive intensity to every call.\n\nI've closed for 3 eight-figure brands and helped scale a coaching offer from $800k/yr to $3.2M in 14 months. My strength is turning skeptical prospects into committed buyers through deep discovery and genuine rapport.\n\nLooking for setter-closer teams running 20+ calls/week with warm traffic and a proven offer.",
  location: "Miami, FL",
  photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face",
  industries: ["Coaching", "Info Products", "Agencies", "SaaS", "Health & Wellness"],
  ticketRange: "$3,000 \u2013 $25,000",
  skills: [
    "Consultative Selling",
    "Objection Handling",
    "Tonality & Pacing",
    "Follow-Up Sequences",
    "CRM Management",
    "Discovery Calls",
    "High-Ticket Closing",
    "Rapport Building",
  ],
  socialLinks: {
    linkedin: "https://linkedin.com/in/example",
    twitter: "https://x.com/example",
    instagram: "https://instagram.com/example",
    calendly: "https://calendly.com/example",
  },
  isAvailable: true,
  introVideoUrl: null,
  highlightReelUrl: null,
  whatsappNumber: "15551234567",
  stats: {
    callsCompleted: 1_247,
    closeRate: 36,
    cashCollected: 4_720_000,
    avgDealSize: 7_800,
    avgDuration: 2280,
    talkRatio: 42,
  },
};

const highlightClips = [
  {
    label: "Handles $8k Price Objection",
    duration: "2:34",
    description: "Prospect pushes back on pricing \u2014 Marcus reframes value and closes",
  },
  {
    label: "Discovery \u2014 Uncovering Deep Pain",
    duration: "3:12",
    description: "Deep discovery that shifts the prospect from browsing to buying",
  },
  {
    label: "Overcoming \u201CI Need to Think About It\u201D",
    duration: "1:48",
    description: "Classic stall handled with empathy and urgency",
  },
  {
    label: "Full Close \u2014 $12k Coaching Package",
    duration: "4:15",
    description: "Complete close sequence from trial close to commitment",
  },
];

export default function DemoProfilePage() {
  const profile = mockProfile;

  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      <main className="max-w-[680px] lg:max-w-[960px] mx-auto px-6 pt-10 pb-20">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center mb-10">
          <img
            src={profile.photoUrl!}
            alt={profile.name}
            className="w-[160px] h-[160px] rounded-full object-cover border-4 border-white shadow-lg shadow-zinc-200/50 mb-5"
          />

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

        {/* Intro Video Placeholder */}
        <section className="mt-10">
          <SectionHeading>Intro Video</SectionHeading>
          <div className="aspect-video rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-zinc-900 flex items-center justify-center">
                <svg className="w-7 h-7 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-[14px] font-medium text-zinc-600">60-Second Intro</p>
              <p className="text-[12px] text-zinc-400 mt-0.5">Closers record a short intro about their experience</p>
            </div>
          </div>
        </section>

        {/* About */}
        {profile.bio && (
          <section className="mt-10">
            <SectionHeading>About</SectionHeading>
            <p className="text-[15px] text-zinc-600 leading-relaxed whitespace-pre-line">
              {profile.bio}
            </p>
          </section>
        )}

        {/* Highlight Reel */}
        <section className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <SectionHeading>Highlight Reel</SectionHeading>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full mb-4">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307z" clipRule="evenodd" />
              </svg>
              From Real Calls
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {highlightClips.map((clip) => (
              <div key={clip.label} className="rounded-xl overflow-hidden border border-zinc-200 bg-white hover:shadow-md transition-shadow">
                <div className="relative aspect-video bg-gradient-to-br from-zinc-100 to-zinc-50 flex items-center justify-center cursor-pointer group">
                  {/* Simulated waveform background */}
                  <div className="absolute inset-x-0 bottom-0 h-16 flex items-end justify-center gap-[3px] px-8 opacity-20">
                    {Array.from({ length: 40 }, (_, i) => (
                      <div
                        key={i}
                        className="w-[3px] bg-zinc-400 rounded-full"
                        style={{ height: `${10 + Math.sin(i * 0.5) * 20 + Math.random() * 25}px` }}
                      />
                    ))}
                  </div>

                  {/* Play button */}
                  <div className="w-14 h-14 rounded-full bg-zinc-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>

                  {/* Blur region indicator (left side) */}
                  <div
                    className="absolute top-0 left-0 h-full w-[50%] pointer-events-none"
                    style={{
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      background: 'rgba(255, 255, 255, 0.3)',
                    }}
                  />

                  {/* Prospect blurred label */}
                  <div className="absolute top-3 left-3 px-2 py-0.5 text-[10px] font-medium text-zinc-400 bg-white/60 rounded-md backdrop-blur-sm">
                    Prospect (blurred)
                  </div>

                  {/* Closer label */}
                  <div className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-medium text-zinc-600 bg-white/80 rounded-md">
                    Marcus
                  </div>
                </div>

                {/* Label + duration */}
                <div className="px-4 py-3 border-t border-zinc-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] font-medium text-zinc-900 truncate">{clip.label}</p>
                    <span className="text-[12px] text-zinc-400 font-mono shrink-0 ml-2">{clip.duration}</span>
                  </div>
                  <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{clip.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

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
