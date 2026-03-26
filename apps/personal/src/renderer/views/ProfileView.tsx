import React, { useEffect, useState, useRef } from 'react';
import type { CloserInfo, B2CProfile, ProfileUpdateArgs } from '../convex';
import { getMyProfile, upsertProfile } from '../convex';
import { ProfilePhotoUpload } from './ProfilePhotoUpload';
import { ProfileSlugEditor } from './ProfileSlugEditor';
import {
  TagInput,
  SocialLinksSection,
  TicketRangeSelector,
  StatsSection,
  INDUSTRY_SUGGESTIONS,
  SKILL_SUGGESTIONS,
} from './ProfileFormSections';
import { ProfileVideoInputs } from './ProfileVideoInputs';
import { HighlightReelEditor } from './HighlightReelEditor';

interface ProfileViewProps {
  closerInfo: CloserInfo;
}

export function ProfileView({ closerInfo }: ProfileViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialLoadDone = useRef(false);

  // Profile fields
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [ticketRange, setTicketRange] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [socialLinks, setSocialLinks] = useState<NonNullable<B2CProfile['socialLinks']>>({});
  const [isPublic, setIsPublic] = useState(false);
  const [introVideoUrl, setIntroVideoUrl] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [autoStats, setAutoStats] = useState<B2CProfile['autoStats']>(null);
  const [manualStats, setManualStats] = useState<B2CProfile['manualStats']>(null);
  const [statsSource, setStatsSource] = useState<"auto" | "manual" | "combined">("auto");
  const [isManuallyVerified, setIsManuallyVerified] = useState(false);

  const mountedRef = useRef(true);
  const savingRef = useRef(false);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!closerInfo.b2cUserId) return;
    setIsLoading(true);
    getMyProfile(closerInfo.b2cUserId).then((profile) => {
      if (!mountedRef.current) return;
      if (profile) {
        setProfileSlug(profile.profileSlug);
        setPhotoUrl(profile.photoUrl);
        setHeadline(profile.headline || '');
        setLocation(profile.location || '');
        setBio(profile.bio || '');
        setIndustries(profile.industries || []);
        setTicketRange(profile.ticketRange);
        setSkills(profile.skills || []);
        setSocialLinks(profile.socialLinks || {});
        setIsPublic(profile.isPublic);
        setIntroVideoUrl(profile.introVideoUrl || '');

        setWhatsappNumber(profile.whatsappNumber || '');
        setAutoStats(profile.autoStats);
        setManualStats(profile.manualStats);
        setStatsSource(profile.statsSource || 'auto');
        setIsManuallyVerified(profile.isManuallyVerified || false);
      }
      setIsLoading(false);
      // Allow a tick for React to flush state before arming dirty tracking
      setTimeout(() => { initialLoadDone.current = true; }, 0);
    }).catch(() => {
      if (mountedRef.current) setIsLoading(false);
    });
  }, [closerInfo.b2cUserId]);

  function markDirty() {
    if (initialLoadDone.current) {
      setHasUnsavedChanges(true);
      setSaveSuccess(false);
    }
  }

  async function handleSave() {
    if (!closerInfo.b2cUserId || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const args: ProfileUpdateArgs = {
        userId: closerInfo.b2cUserId,
        headline: headline || undefined,
        bio: bio || undefined,
        location: location || undefined,
        industries: industries.length > 0 ? industries : undefined,
        ticketRange: ticketRange || undefined,
        skills: skills.length > 0 ? skills : undefined,
        socialLinks,
        isPublic,
        introVideoUrl: introVideoUrl || undefined,
        highlightReelUrl: undefined,
        whatsappNumber: whatsappNumber || undefined,
        statsSource,
        ...((statsSource === 'manual' || statsSource === 'combined') && manualStats ? { manualStats } : {}),
      };

      const result = await upsertProfile(args);
      if (!mountedRef.current) return;

      if (result.success) {
        setSaveSuccess(true);
        setHasUnsavedChanges(false);
        setTimeout(() => { if (mountedRef.current) setSaveSuccess(false); }, 3000);
      } else {
        setError(result.error || 'Failed to save profile');
      }
    } catch {
      if (mountedRef.current) setError('Network error. Please try again.');
    } finally {
      if (mountedRef.current) setIsSaving(false);
      savingRef.current = false;
    }
  }

  // Compute completeness
  const completionSteps = [
    !!photoUrl, !!headline, !!bio, !!location,
    industries.length > 0, !!ticketRange, skills.length > 0,
    Object.values(socialLinks).some((v) => !!v), !!profileSlug,
  ];
  const completedSteps = completionSteps.filter(Boolean).length;
  const completionPct = Math.round((completedSteps / completionSteps.length) * 100);

  if (!closerInfo.b2cUserId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <p className="text-gray-500 dark:text-gray-400 text-[14px]">
          Please log out and log back in to access your profile.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[14px] text-gray-500 dark:text-gray-400">Loading profile...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-black dark:text-white">Your Profile</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">
            Build your public closer profile
          </p>
        </div>
        {profileSlug && (
          <a
            href={`https://sequ3nce.ai/p/${profileSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-[13px] font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            View Public Profile
          </a>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {/* Completeness bar */}
        {completionPct < 100 && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                Profile completeness
              </span>
              <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
                {completionPct}%
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-black dark:bg-white rounded-full transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Photo & Identity */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
            Photo & Identity
          </h2>
          <div className="flex items-start gap-6">
            <ProfilePhotoUpload
              userId={closerInfo.b2cUserId}
              photoUrl={photoUrl}
              name={closerInfo.name}
              onPhotoUpdated={setPhotoUrl}
            />
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">Name</label>
                <p className="text-[14px] font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  {closerInfo.name}
                  {closerInfo.badges?.includes('founder') && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      Founder
                    </span>
                  )}
                  {closerInfo.badges?.includes('pioneer1') && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-700/50">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
                      Pioneer #1
                    </span>
                  )}
                </p>
              </div>
              <div>
                <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">
                  Headline <span className="text-gray-300 dark:text-gray-600">({headline.length}/120)</span>
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => { setHeadline(e.target.value.slice(0, 120)); markDirty(); }}
                  placeholder="High-Ticket Coaching Closer"
                  className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => { setLocation(e.target.value.slice(0, 100)); markDirty(); }}
                  placeholder="Austin, TX"
                  className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Profile URL */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Profile URL</h2>
          <ProfileSlugEditor
            userId={closerInfo.b2cUserId}
            currentSlug={profileSlug}
            name={closerInfo.name}
            onSlugClaimed={setProfileSlug}
          />
        </section>

        {/* About */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">About</h2>
          <div>
            <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">
              Bio <span className="text-gray-300 dark:text-gray-600">({bio.length}/2000)</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value.slice(0, 2000)); markDirty(); }}
              placeholder="Tell potential employers about your sales experience, closing style, and what makes you stand out..."
              rows={5}
              className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
            />
          </div>
        </section>

        {/* Expertise */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Expertise</h2>
          <TagInput
            label="Industries"
            tags={industries}
            onChange={(v) => { setIndustries(v); markDirty(); }}
            maxTags={10}
            suggestions={INDUSTRY_SUGGESTIONS}
            placeholder="Add an industry..."
          />
          <TicketRangeSelector value={ticketRange} onChange={(v) => { setTicketRange(v); markDirty(); }} />
          <TagInput
            label="Skills"
            tags={skills}
            onChange={(v) => { setSkills(v); markDirty(); }}
            maxTags={20}
            suggestions={SKILL_SUGGESTIONS}
            placeholder="Add a skill..."
          />
        </section>

        {/* Social Links */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Social & Links</h2>
          <SocialLinksSection links={socialLinks} onChange={(v) => { setSocialLinks(v); markDirty(); }} />
        </section>

        {/* Videos & Contact */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Videos & Contact</h2>
          <ProfileVideoInputs
            introVideoUrl={introVideoUrl}
            onIntroChange={(v) => { setIntroVideoUrl(v); markDirty(); }}
          />
          <div>
            <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">
              WhatsApp Number <span className="text-gray-300 dark:text-gray-600">(with country code)</span>
            </label>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={(e) => { setWhatsappNumber(e.target.value.replace(/\D/g, '').slice(0, 15)); markDirty(); }}
              placeholder="15551234567"
              className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Adds a &quot;Message Me&quot; button to your profile that opens WhatsApp
            </p>
          </div>
        </section>

        {/* Highlight Reel */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Highlight Reel</h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Showcase your best sales call moments on your public profile. Add clips from your Calls tab.
          </p>
          <HighlightReelEditor userId={closerInfo.b2cUserId!} />
        </section>

        {/* Performance Stats */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Performance Stats</h2>
          <StatsSection
            autoStats={autoStats}
            manualStats={manualStats}
            statsSource={statsSource}
            isManuallyVerified={isManuallyVerified}
            onStatsSourceChange={(v) => { setStatsSource(v); markDirty(); }}
            onManualStatsChange={(v) => { setManualStats(v); markDirty(); }}
          />
        </section>

        {/* Visibility */}
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Visibility</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => { setIsPublic(!isPublic); markDirty(); }}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isPublic ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isPublic ? 'translate-x-5' : ''
                }`}
              />
            </button>
            <div>
              <span className="text-[13px] font-medium text-gray-900 dark:text-white">
                Make profile public
              </span>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                {isPublic
                  ? 'Your profile is visible at sequ3nce.ai/p/' + (profileSlug || 'your-slug')
                  : 'Your profile is hidden from public view'}
              </p>
            </div>
          </label>
        </section>

        {/* Spacer for sticky save button */}
        <div className="h-20" />
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 px-6 py-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            {error && <span className="text-[13px] text-red-500 dark:text-red-400">{error}</span>}
            {saveSuccess && (
              <span className="text-[13px] text-green-600 dark:text-green-400">Profile saved!</span>
            )}
            {hasUnsavedChanges && !error && !saveSuccess && (
              <span className="text-[13px] text-amber-600 dark:text-amber-400">You have unsaved changes</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`px-6 py-2.5 text-[14px] font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              hasUnsavedChanges
                ? 'bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-500 dark:text-white dark:hover:bg-amber-600'
                : 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
