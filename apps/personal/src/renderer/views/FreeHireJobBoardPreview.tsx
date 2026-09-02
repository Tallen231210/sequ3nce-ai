import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getFreeHireActivities,
  saveFreeHireActivity,
  type CloserInfo,
  type FreeHireActivity,
  type FreeHireJobStage,
  type FreeHireTrackedJobSnapshot,
} from '../convex';
import type { FreeHireJob, FreeHireSearchResponse } from '../types/electron';
import { PlacementLineTab } from './PlacementLineTab';

type TopTab = 'public' | 'internal';
type PublicSection = 'discover' | 'applications' | 'insights';
type RoleLane = 'for-you' | 'sales' | 'closer' | 'account-executive' | 'high-ticket' | 'leadership';
type JobStage = FreeHireJobStage;
type WorkMode = 'all' | 'remote' | 'hybrid' | 'onsite';
type PostedWindow = 'any' | '7' | '30';
type SortMode = 'newest' | 'relevance';
type CountryScope = string;

interface TrackedJob {
  stage?: JobStage;
  job: FreeHireJob;
  note?: string;
  dismissed: boolean;
  createdAt: number;
  updatedAt: number;
  stageChangedAt: number;
}
type TrackingState = 'loading' | 'synced' | 'local' | 'needs-login';
interface FreeHireJobBoardPreviewProps { closerInfo: CloserInfo }
interface RoleDefinition { id: RoleLane; label: string; shortLabel: string; description: string }

const ROLE_LANES: RoleDefinition[] = [
  { id: 'for-you', label: 'For You', shortLabel: 'For You', description: 'The newest sales opportunities' },
  { id: 'sales', label: 'Sales', shortLabel: 'Sales', description: 'Opportunities across every sales function' },
  { id: 'closer', label: 'Closer', shortLabel: 'Closer', description: 'Dedicated closing opportunities' },
  { id: 'account-executive', label: 'Account Executive', shortLabel: 'Account Executive', description: 'Full-cycle closing roles' },
  { id: 'high-ticket', label: 'High-Ticket', shortLabel: 'High-Ticket', description: 'High-consideration offers' },
  { id: 'leadership', label: 'Sales Leadership', shortLabel: 'Leadership', description: 'Manager and director roles' },
];

const STAGE_META: Array<{ id: JobStage; label: string; description: string }> = [
  { id: 'saved', label: 'Saved', description: 'Worth a closer look' },
  { id: 'preparing', label: 'Preparing', description: 'Application in progress' },
  { id: 'applied', label: 'Applied', description: 'Waiting for a response' },
  { id: 'interviewing', label: 'Interviewing', description: 'Active conversations' },
];

const PAGE_SIZE = 24;
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRY_OPTIONS: Array<[string, string]> = [
  ['any', 'Worldwide'],
  ...COUNTRY_CODES.map((code): [string, string] => [code, regionNames.of(code) ?? code])
    .sort((a, b) => a[1].localeCompare(b[1])),
];

export function FreeHireJobBoardPreview({ closerInfo }: FreeHireJobBoardPreviewProps) {
  const [topTab, setTopTab] = useState<TopTab>('public');
  const [section, setSection] = useState<PublicSection>('discover');
  const [roleLane, setRoleLane] = useState<RoleLane>('for-you');
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [workMode, setWorkMode] = useState<WorkMode>('all');
  const [countryScope, setCountryScope] = useState<CountryScope>('any');
  const [postedWindow, setPostedWindow] = useState<PostedWindow>('any');
  const [jobs, setJobs] = useState<FreeHireJob[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [tracked, setTracked] = useState<Record<string, TrackedJob>>({});
  const trackedRef = useRef<Record<string, TrackedJob>>({});
  const [trackingReady, setTrackingReady] = useState(false);
  const [trackingState, setTrackingState] = useState<TrackingState>('loading');
  const [toast, setToast] = useState<string | null>(null);

  const userId = closerInfo.b2cUserId ?? '';
  const isFounder = closerInfo.badges?.includes('founder') || closerInfo.badges?.includes('admin');
  const firstName = closerInfo.name?.trim().split(/\s+/)[0] || 'there';
  const storageKey = `sequ3nce:dev-job-board:${userId || 'anonymous'}`;

  useEffect(() => {
    let active = true;
    let local: Record<string, TrackedJob> = {};
    try {
      const saved = window.localStorage.getItem(storageKey);
      local = saved ? normalizeLocalTracking(JSON.parse(saved)) : {};
    } catch {
      local = {};
    }
    trackedRef.current = local;
    setTracked(local);
    setTrackingReady(true);

    const sessionToken = closerInfo.sessionToken;
    if (!sessionToken) {
      setTrackingState('needs-login');
      return () => { active = false; };
    }

    setTrackingState('loading');
    void getFreeHireActivities(sessionToken).then(async (result) => {
      if (!active) return;
      if (!result.activities) {
        setTrackingState(result.needsRelogin ? 'needs-login' : 'local');
        return;
      }

      const remote = Object.fromEntries(
        result.activities.map((activity) => [activity.externalJobId, activityFromServer(activity)]),
      );
      const merged = { ...local, ...remote };
      trackedRef.current = merged;
      setTracked(merged);
      setTrackingState('synced');

      // One-time migration for activity created in the earlier local preview.
      // Remote records always win; only local-only records are uploaded.
      const localOnly = Object.entries(local).filter(([id]) => !remote[id]);
      await Promise.all(localOnly.map(([externalJobId, activity]) =>
        saveFreeHireActivity({
          sessionToken,
          externalJobId,
          stage: activity.stage,
          note: activity.note,
          dismissed: activity.dismissed,
          job: jobSnapshot(activity.job),
        }),
      ));
    }).catch(() => {
      if (active) setTrackingState('local');
    });
    return () => { active = false; };
  }, [storageKey, closerInfo.sessionToken]);

  useEffect(() => {
    if (trackingReady) window.localStorage.setItem(storageKey, JSON.stringify(tracked));
  }, [storageKey, tracked, trackingReady]);

  const loadJobs = useCallback(async (offset: number, append: boolean) => {
    if (!window.electron?.freeHire) {
      setError('The development job feed is unavailable. Restart the Electron app to load the new preload bridge.');
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    append ? setLoadingMore(true) : setLoading(true);
    if (!append) setError(null);
    try {
      const result: FreeHireSearchResponse = await window.electron.freeHire.search({
        lane: roleLane,
        sort: sortMode,
        workMode: workMode === 'all' ? undefined : workMode,
        country: countryScope === 'any' ? undefined : countryScope,
        postedWithinDays: postedWindow === 'any' ? undefined : Number(postedWindow) as 7 | 30,
        limit: PAGE_SIZE,
        offset,
      });
      setJobs((current) => append ? mergeJobs(current, result.jobs) : result.jobs);
      setTotal(result.total);
      setSelectedJobId((current) => append && current ? current : result.jobs[0]?.id ?? null);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message.replace(/^Error invoking remote method '[^']+':\s*/, ''));
      if (!append) { setJobs([]); setTotal(0); }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [roleLane, sortMode, workMode, countryScope, postedWindow]);

  useEffect(() => { void loadJobs(0, false); }, [loadJobs, refreshToken]);

  const visibleJobs = useMemo(
    () => jobs.filter((job) => !tracked[job.id]?.dismissed),
    [jobs, tracked],
  );
  const selectedJob = visibleJobs.find((job) => job.id === selectedJobId) ?? visibleJobs[0] ?? null;
  const commitActivity = useCallback((job: FreeHireJob, changes: {
    stage?: JobStage;
    note?: string;
    dismissed: boolean;
  }) => {
    const current = trackedRef.current[job.id];
    const now = Date.now();
    const note = changes.note?.trim() || undefined;
    const shouldRemove = !changes.stage && !note && !changes.dismissed;
    const next = { ...trackedRef.current };
    if (shouldRemove) {
      delete next[job.id];
    } else {
      next[job.id] = {
        stage: changes.stage,
        note,
        dismissed: changes.dismissed,
        job,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        stageChangedAt: current?.stage === changes.stage ? current.stageChangedAt : now,
      };
    }
    trackedRef.current = next;
    setTracked(next);

    if (closerInfo.sessionToken) {
      void saveFreeHireActivity({
        sessionToken: closerInfo.sessionToken,
        externalJobId: job.id,
        stage: changes.stage,
        note,
        dismissed: changes.dismissed,
        job: jobSnapshot(job),
      }).then((result) => {
        if (!result.success) setTrackingState(result.needsRelogin ? 'needs-login' : 'local');
      });
    }
  }, [closerInfo.sessionToken]);
  const setJobStage = useCallback((job: FreeHireJob, stage: JobStage | undefined) => {
    const current = trackedRef.current[job.id];
    commitActivity(job, {
      stage,
      note: stage ? current?.note : undefined,
      dismissed: false,
    });
  }, [commitActivity]);
  const setJobNote = useCallback((job: FreeHireJob, note: string) => {
    const current = trackedRef.current[job.id];
    commitActivity(job, {
      stage: current?.stage ?? 'saved',
      note,
      dismissed: false,
    });
  }, [commitActivity]);
  const dismissJob = useCallback((job: FreeHireJob) => {
    commitActivity(job, { stage: undefined, note: undefined, dismissed: true });
    setSelectedJobId((current) => current === job.id ? null : current);
  }, [commitActivity]);
  const restoreJob = useCallback((job: FreeHireJob) => {
    commitActivity(job, { stage: undefined, note: undefined, dismissed: false });
  }, [commitActivity]);
  const hydrateJob = useCallback((job: FreeHireJob) => {
    setJobs((current) => current.map((item) => item.id === job.id ? job : item));
    setTracked((current) => {
      if (!current[job.id]) return current;
      const next = { ...current, [job.id]: { ...current[job.id], job } };
      trackedRef.current = next;
      return next;
    });
  }, []);
  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);
  const selectRoleLane = useCallback((lane: RoleLane) => setRoleLane(lane), []);

  return (
    <div data-testid="freehire-job-board" className="h-full w-full min-w-0 flex flex-col overflow-hidden bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100">
      <header className="px-4 sm:px-5 xl:px-6 pt-5 sm:pt-6 shrink-0 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1 basis-[280px]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Job Board</h2>
              <span className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">Live development feed</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Sales opportunities from the FreeHire catalogue, tracked privately in Sequ3nce.</p>
          </div>
          {topTab === 'public' && (
            <button onClick={() => setRefreshToken((value) => value + 1)} disabled={loading} className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-zinc-700 px-3 py-2 text-[10.5px] font-semibold text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-zinc-500 disabled:opacity-40 transition-colors">
              <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh jobs
            </button>
          )}
        </div>
        <div className="flex max-w-full gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 w-fit mb-4">
          <TopTabButton active={topTab === 'public'} onClick={() => setTopTab('public')}>Public Job Board</TopTabButton>
          <TopTabButton active={topTab === 'internal'} onClick={() => setTopTab('internal')}>The Placement Line</TopTabButton>
        </div>
      </header>

      {topTab === 'internal' ? (
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 xl:px-6 pb-6"><PlacementLineTab userId={userId} isFounder={!!isFounder} /></div>
      ) : (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          <nav className="px-4 sm:px-5 xl:px-6 shrink-0 min-w-0">
            <div className="border-b border-gray-100 dark:border-zinc-800 flex items-center gap-5 overflow-x-auto overflow-y-hidden">
              <SectionButton active={section === 'discover'} onClick={() => setSection('discover')}>Discover</SectionButton>
              <SectionButton active={section === 'applications'} onClick={() => setSection('applications')}>Applications<span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${section === 'applications' ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500'}`}>{Object.values(tracked).filter((activity) => activity.stage && !activity.dismissed).length}</span></SectionButton>
              <SectionButton active={section === 'insights'} onClick={() => setSection('insights')}>Market insights</SectionButton>
            </div>
          </nav>

          {section === 'discover' && <DiscoverView firstName={firstName} roleLane={roleLane} onRoleChange={selectRoleLane} sortMode={sortMode} onSortModeChange={setSortMode} workMode={workMode} onWorkModeChange={setWorkMode} countryScope={countryScope} onCountryScopeChange={setCountryScope} postedWindow={postedWindow} onPostedWindowChange={setPostedWindow} jobs={visibleJobs} total={total} selectedJob={selectedJob} selectedJobId={selectedJobId} onSelectJob={setSelectedJobId} tracked={tracked} onSetStage={setJobStage} onSetNote={setJobNote} onDismiss={dismissJob} onHydrateJob={hydrateJob} loading={loading} loadingMore={loadingMore} error={error} onRetry={() => setRefreshToken((value) => value + 1)} onLoadMore={() => void loadJobs(jobs.length, true)} onOpenApplications={() => setSection('applications')} onToast={showToast} />}
          {section === 'applications' && <ApplicationsView tracked={tracked} trackingState={trackingState} onSetStage={setJobStage} onRestore={restoreJob} onSelectJob={(job) => { if (!jobs.some((item) => item.id === job.id)) setJobs((current) => [job, ...current]); setSelectedJobId(job.id); setSection('discover'); }} />}
          {section === 'insights' && <InsightsView jobs={jobs} total={total} roleLane={roleLane} />}
        </div>
      )}

      {toast && <div className="fixed right-5 bottom-5 z-[120] flex items-center gap-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 shadow-xl"><span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-[11px] font-bold">✓</span><span className="text-[12px] font-medium text-gray-700 dark:text-gray-200">{toast}</span></div>}
    </div>
  );
}

function TopTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-md transition-all ${active ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>{children}</button>;
}

function SectionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`relative shrink-0 flex items-center py-2.5 text-[12px] font-semibold transition-colors ${active ? 'text-black dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>{children}{active && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-black dark:bg-white" />}</button>;
}

interface DiscoverProps {
  firstName: string; roleLane: RoleLane; onRoleChange: (lane: RoleLane) => void;
  sortMode: SortMode; onSortModeChange: (sort: SortMode) => void;
  workMode: WorkMode; onWorkModeChange: (mode: WorkMode) => void;
  countryScope: CountryScope; onCountryScopeChange: (country: CountryScope) => void;
  postedWindow: PostedWindow; onPostedWindowChange: (value: PostedWindow) => void;
  jobs: FreeHireJob[]; total: number; selectedJob: FreeHireJob | null; selectedJobId: string | null;
  onSelectJob: (id: string) => void; tracked: Record<string, TrackedJob>;
  onSetStage: (job: FreeHireJob, stage: JobStage | undefined) => void;
  onSetNote: (job: FreeHireJob, note: string) => void;
  onDismiss: (job: FreeHireJob) => void;
  onHydrateJob: (job: FreeHireJob) => void;
  loading: boolean; loadingMore: boolean; error: string | null; onRetry: () => void; onLoadMore: () => void;
  onOpenApplications: () => void; onToast: (message: string) => void;
}

function DiscoverView(props: DiscoverProps) {
  const { firstName, roleLane, onRoleChange, sortMode, onSortModeChange, workMode, onWorkModeChange, countryScope, onCountryScopeChange, postedWindow, onPostedWindowChange, jobs, total, selectedJob, selectedJobId, onSelectJob, tracked, onSetStage, onSetNote, onDismiss, onHydrateJob, loading, loadingMore, error, onRetry, onLoadMore, onOpenApplications, onToast } = props;
  const activeLane = ROLE_LANES.find((lane) => lane.id === roleLane) ?? ROLE_LANES[0];
  const selectedCountry = COUNTRY_OPTIONS.find(([code]) => code === countryScope)?.[1] ?? countryScope;
  const scopeLabel = `${selectedCountry} · ${sortMode === 'newest' ? 'newest first' : 'best match first'}`;
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto lg:overflow-hidden overflow-x-hidden px-4 sm:px-5 xl:px-6 pb-6">
      <div className="pt-4 pb-3 shrink-0">
        <p className="text-[9px] font-medium uppercase tracking-[0.13em] text-gray-500 dark:text-gray-400">Curated sales catalogue</p>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-1.5">
          <div><h3 className="text-[18px] font-semibold tracking-tight text-gray-950 dark:text-white">Find your next role, {firstName}</h3><p className="text-[11px] text-gray-400 mt-1">Choose a sales lane—general web search stays intentionally out of the experience.</p></div>
          {!loading && !error && <div className="text-right shrink-0"><p className="text-[17px] font-bold tabular-nums">{formatCount(total)}</p><p className="text-[8px] font-mono uppercase tracking-wider text-gray-400">matching roles</p></div>}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))] gap-2 mb-3 shrink-0">
        {ROLE_LANES.map((lane) => <button key={lane.id} onClick={() => onRoleChange(lane.id)} className={`min-w-0 rounded-lg border p-3 text-left transition-all ${roleLane === lane.id ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black' : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-gray-400 dark:hover:border-zinc-600'}`}><div className="flex items-center justify-between gap-2"><span className="text-[10.5px] font-bold truncate">{lane.shortLabel}</span>{roleLane === lane.id && <CheckIcon className="w-3.5 h-3.5 shrink-0" />}</div><p className={`text-[8.5px] leading-snug mt-1.5 ${roleLane === lane.id ? 'text-white/65 dark:text-black/60' : 'text-gray-400'}`}>{lane.description}</p></button>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-gray-200 dark:border-zinc-800 bg-[#fafafa] dark:bg-zinc-900/50 p-2.5 mb-3 shrink-0">
        <div className="flex flex-wrap gap-2 min-w-0"><FilterSelect label="Sort" value={sortMode} onChange={(value) => onSortModeChange(value as SortMode)} options={[['newest', 'Newest'], ['relevance', 'Best match']]} /><FilterSelect label="Work mode" value={workMode} onChange={(value) => onWorkModeChange(value as WorkMode)} options={[['all', 'Any work mode'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']]} /><FilterSelect label="Country" value={countryScope} onChange={onCountryScopeChange} options={COUNTRY_OPTIONS} /><FilterSelect label="Posted" value={postedWindow} onChange={(value) => onPostedWindowChange(value as PostedWindow)} options={[['any', 'Any time'], ['7', 'Past 7 days'], ['30', 'Past 30 days']]} /></div>
        <p className="text-[8.5px] text-gray-400">{scopeLabel}</p>
      </div>

      {error ? <FeedError message={error} onRetry={onRetry} /> : loading ? <LoadingState /> : jobs.length === 0 ? <EmptyState lane={activeLane.label} /> : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,0.8fr)_minmax(360px,1.2fr)] gap-3 items-start lg:items-stretch min-w-0 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          <section className="min-w-0 lg:min-h-0 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden lg:flex lg:flex-col">
            <div className="px-3 py-2.5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-3"><div className="min-w-0"><h4 className="text-[11px] font-semibold truncate">{activeLane.label}</h4><p className="text-[8.5px] text-gray-400 mt-0.5">Showing {jobs.length} of {formatCount(total)}</p></div><span className="inline-flex items-center gap-1.5 text-[8.5px] text-blue-600 dark:text-blue-300 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />Live feed</span></div>
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto"><div className="divide-y divide-gray-100 dark:divide-zinc-800">{jobs.map((job) => <JobListCard key={job.id} job={job} roleLane={roleLane} active={job.id === selectedJobId} stage={tracked[job.id]?.stage} onSelect={() => onSelectJob(job.id)} onSave={() => { const currentStage = tracked[job.id]?.stage; if (!currentStage || currentStage === 'saved') onSetStage(job, currentStage === 'saved' ? undefined : 'saved'); }} />)}</div>{jobs.length < total && <div className="p-3 border-t border-gray-100 dark:border-zinc-800"><button onClick={onLoadMore} disabled={loadingMore} className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 py-2 text-[10px] font-semibold text-gray-600 dark:text-gray-300 hover:border-gray-400 disabled:opacity-50">{loadingMore ? 'Loading more…' : 'Load more roles'}</button></div>}</div>
          </section>
          {selectedJob && <JobDetailPanel job={selectedJob} activity={tracked[selectedJob.id]} onSetStage={(stage) => onSetStage(selectedJob, stage)} onSetNote={(note) => onSetNote(selectedJob, note)} onDismiss={() => onDismiss(selectedJob)} onHydrateJob={onHydrateJob} onOpenApplications={onOpenApplications} onToast={onToast} />}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"><span className="text-[8px] font-mono uppercase tracking-wider text-gray-400">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-[9.5px] font-semibold text-gray-700 dark:text-gray-200 outline-none cursor-pointer">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function JobListCard({ job, roleLane, active, stage, onSelect, onSave }: { job: FreeHireJob; roleLane: RoleLane; active: boolean; stage?: JobStage; onSelect: () => void; onSave: () => void }) {
  const matchedInDescription = roleLane === 'high-ticket' && !/high[ -]?ticket/i.test(job.title);
  const activelyTracked = !!stage;
  return <div data-testid="freehire-job-card" className={`relative transition-colors ${active ? 'bg-gray-50 dark:bg-zinc-800/55' : 'hover:bg-gray-50/70 dark:hover:bg-zinc-800/30'}`}><button onClick={onSelect} className="w-full min-w-0 text-left p-3 pr-11"><div className="flex items-start gap-2.5 min-w-0"><CompanyMark job={job} /><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold leading-snug line-clamp-2">{job.title}</p><p className="text-[9.5px] text-gray-500 dark:text-gray-400 mt-1 truncate">{job.company} · {job.location}</p><div className="flex items-center gap-1.5 mt-2 flex-wrap">{job.salary !== 'Compensation not listed' && <CompensationTag>{job.salary}</CompensationTag>}<Tag>{formatWorkMode(job.workMode)}</Tag>{matchedInDescription && <Tag>High-ticket match in description</Tag>}{realityLabel(job) && <RealityTag job={job} />}</div><div className="flex items-center justify-between gap-3 mt-2.5 text-[8.5px] text-gray-400"><span className="truncate">{postedLabel(job.postedAt)} · {job.source}</span>{stage && <span className="font-semibold text-gray-700 dark:text-gray-300 capitalize shrink-0">{stage}</span>}</div></div></div></button><button onClick={onSave} disabled={activelyTracked && stage !== 'saved'} className={`absolute right-3 top-3 w-7 h-7 rounded-md border flex items-center justify-center ${activelyTracked ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black' : 'border-gray-200 dark:border-zinc-700 text-gray-400 hover:text-gray-700'} disabled:cursor-default`} title={stage === 'saved' ? 'Remove saved job' : activelyTracked ? `Tracked as ${stage}` : 'Save job'}><BookmarkIcon className="w-3.5 h-3.5" filled={activelyTracked} /></button></div>;
}

function JobDetailPanel({ job, activity, onSetStage, onSetNote, onDismiss, onHydrateJob, onOpenApplications, onToast }: { job: FreeHireJob; activity?: TrackedJob; onSetStage: (stage: JobStage | undefined) => void; onSetNote: (note: string) => void; onDismiss: () => void; onHydrateJob: (job: FreeHireJob) => void; onOpenApplications: () => void; onToast: (message: string) => void }) {
  const [detailTab, setDetailTab] = useState<'overview' | 'signals'>('overview');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [noteDraft, setNoteDraft] = useState(activity?.note ?? '');
  const stage = activity?.stage;
  useEffect(() => {
    setDetailTab('overview');
    setLoadingDetail(true);
    let active = true;
    void window.electron.freeHire.getJob(job.id).then((detail) => {
      if (active) onHydrateJob({ ...job, ...detail });
    }).catch(() => {
      // The search excerpt remains usable when the optional detail request fails.
    }).finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [job.id, onHydrateJob]);
  useEffect(() => setNoteDraft(activity?.note ?? ''), [job.id, activity?.note]);
  const openApplication = () => { window.open(job.applyUrl, '_blank', 'noopener,noreferrer'); if (!stage) onSetStage('preparing'); onToast('Application page opened in your browser'); };
  return (
    <aside className="min-w-0 lg:min-h-0 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden lg:overflow-y-auto">
      <div className="p-4 border-b border-gray-100 dark:border-zinc-800"><div className="flex items-start gap-3"><CompanyMark job={job} size="lg" /><div className="min-w-0 flex-1"><h3 className="text-[14px] font-semibold leading-tight">{job.title}</h3><p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{job.company} · {job.location}</p><div className="flex flex-wrap gap-1.5 mt-2.5"><Tag>{job.salary}</Tag><Tag>{job.employmentType}</Tag><Tag>{job.seniority}</Tag></div></div></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3"><SignalCell label="Posted" value={postedLabel(job.postedAt)} /><SignalCell label="Work mode" value={formatWorkMode(job.workMode)} /><SignalCell label="Listing signal" value={realityLabel(job) || 'No signal'} /></div></div>
      <div className="flex items-center gap-4 px-4 border-b border-gray-100 dark:border-zinc-800"><DetailTab active={detailTab === 'overview'} onClick={() => setDetailTab('overview')}>Overview</DetailTab><DetailTab active={detailTab === 'signals'} onClick={() => setDetailTab('signals')}>Job signals</DetailTab></div>
      <div className="p-4">{detailTab === 'overview' ? <><div className="flex items-center justify-between gap-3"><DetailHeading>About the opportunity</DetailHeading>{loadingDetail && <span className="text-[8px] text-blue-600 dark:text-blue-300">Loading full description…</span>}</div><DescriptionContent job={job} /><DetailHeading className="mt-5">Skills and keywords</DetailHeading>{job.skills.length > 0 ? <div className="flex flex-wrap gap-1.5">{job.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div> : <p className="text-[10px] text-gray-400">No structured skills were supplied by the source.</p>}{stage && <div className="mt-5 pt-4 border-t border-gray-100 dark:border-zinc-800"><div className="flex items-center justify-between gap-3"><DetailHeading>Private note</DetailHeading><span className="text-[8px] text-gray-400">Only visible to you</span></div><textarea data-testid="freehire-private-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value.slice(0, 2000))} placeholder="Add interview context, a recruiter name, or a follow-up reminder…" className="w-full min-h-[74px] resize-y rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-[10px] leading-relaxed outline-none focus:border-gray-400 dark:focus:border-zinc-500" /><div className="flex items-center justify-between mt-2"><span className="text-[8px] text-gray-400 tabular-nums">{noteDraft.length}/2000</span><button onClick={() => { onSetNote(noteDraft); onToast('Private note saved'); }} disabled={noteDraft.trim() === (activity?.note ?? '')} className="rounded-md border border-gray-200 dark:border-zinc-700 px-2.5 py-1.5 text-[8.5px] font-semibold disabled:opacity-40">Save note</button></div></div>}</> : <JobSignals job={job} />}</div>
      <div className="p-3 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900"><div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"><button onClick={() => { if (!stage || stage === 'saved') { onSetStage(stage === 'saved' ? undefined : 'saved'); if (stage !== 'saved') onToast('Job saved to your private application board'); } else { onOpenApplications(); } }} className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-[10.5px] font-semibold hover:border-gray-400">{stage === 'saved' ? 'Remove from saved' : stage ? `View ${stage} application` : 'Save for later'}</button><button onClick={openApplication} className="flex items-center justify-center gap-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black px-3 py-2 text-[10.5px] font-semibold hover:opacity-85">Apply on source site <ExternalIcon className="w-3 h-3" /></button></div><div className="flex items-center justify-between gap-3 mt-2">{stage ? <button onClick={onOpenApplications} className="text-[9px] font-semibold text-gray-500 hover:text-black dark:hover:text-white">View in Applications →</button> : <span />}<button onClick={() => { onDismiss(); onToast('Job hidden from your feed'); }} className="text-[9px] font-semibold text-gray-400 hover:text-black dark:hover:text-white">Not interested</button></div><p className="text-[8.5px] text-gray-400 text-center mt-2">Sequ3nce opens the source listing; it does not submit an application for you.</p></div>
    </aside>
  );
}

function JobSignals({ job }: { job: FreeHireJob }) {
  const reality = job.reality;
  return <div><div className="flex items-start gap-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 p-3"><ShieldIcon className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" /><div><p className="text-[11px] font-semibold">{realityLabel(job) || 'No catalogue signal available'}</p><p className="text-[9.5px] text-gray-400 mt-1 leading-relaxed">These signals come from listing age and reposting behavior. They are useful context, not proof that a job is real or inactive.</p></div></div><div className="grid grid-cols-2 gap-2 mt-3"><SignalCell label="Listing age" value={reality?.ageDays !== null && reality?.ageDays !== undefined ? `${reality.ageDays} days` : 'Unknown'} /><SignalCell label="Reposts detected" value={String(reality?.repostCount ?? 0)} /><SignalCell label="Similar postings" value={String(reality?.massPostingCount ?? 0)} /><SignalCell label="Last observed" value={postedLabel(job.lastSeenAt)} /></div>{reality?.fakeFreshness && <p className="mt-3 text-[9.5px] leading-relaxed text-gray-500 dark:text-gray-400">The catalogue detected a possible refreshed posting date. Review the employer page before investing significant time.</p>}</div>;
}

function DescriptionContent({ job }: { job: FreeHireJob }) {
  if (job.descriptionBlocks.length === 0) {
    return <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">{job.description || 'The source did not include a description for this role.'}</p>;
  }
  return (
    <div className="space-y-2.5 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
      {job.descriptionBlocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h5 key={`${block.type}-${index}`} className="pt-2 text-[11px] font-semibold text-gray-900 dark:text-white">{block.text.replace(/:$/, '')}</h5>;
        }
        if (block.type === 'bullet') {
          return <div key={`${block.type}-${index}`} className="flex items-start gap-2 pl-1"><span className="mt-[7px] w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0" /><span>{block.text}</span></div>;
        }
        return <p key={`${block.type}-${index}`}>{block.text}</p>;
      })}
    </div>
  );
}

function ApplicationsView({ tracked, trackingState, onSetStage, onRestore, onSelectJob }: { tracked: Record<string, TrackedJob>; trackingState: TrackingState; onSetStage: (job: FreeHireJob, stage: JobStage | undefined) => void; onRestore: (job: FreeHireJob) => void; onSelectJob: (job: FreeHireJob) => void }) {
  const entries = Object.values(tracked).filter((activity): activity is TrackedJob & { stage: JobStage } => !!activity.stage && !activity.dismissed);
  const hidden = Object.values(tracked).filter((activity) => activity.dismissed);
  const applied = entries.filter(({ stage }) => stage === 'applied' || stage === 'interviewing').length;
  const interviewing = entries.filter(({ stage }) => stage === 'interviewing').length;
  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 xl:px-6 pb-6">
      <div className="pt-4 pb-4 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0 flex-1 basis-[280px]"><h3 className="text-[16px] font-semibold tracking-tight">Your applications</h3><p className="text-[11px] text-gray-400 mt-1">Roles saved from the live feed, private to this signed-in development profile.</p></div><div className="flex items-center gap-5"><ApplicationMetric label="Tracked" value={entries.length} /><ApplicationMetric label="Applied" value={applied} /><ApplicationMetric label="Interviewing" value={interviewing} /></div></div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3 items-start min-w-0">{STAGE_META.map((meta) => { const stageJobs = entries.filter((entry) => entry.stage === meta.id); return <section key={meta.id} className="rounded-lg bg-gray-50 dark:bg-zinc-900/70 border border-gray-100 dark:border-zinc-800 p-2.5 min-w-0"><header className="flex items-start justify-between gap-2 px-1 pb-2.5"><div><h4 className="text-[10.5px] font-bold">{meta.label}</h4><p className="text-[8.5px] text-gray-400 mt-0.5">{meta.description}</p></div><span className="w-5 h-5 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 flex items-center justify-center text-[9px] font-bold text-gray-500">{stageJobs.length}</span></header><div className="space-y-2">{stageJobs.map(({ job, stage, note, updatedAt }) => <ApplicationCard key={job.id} job={job} stage={stage} note={note} updatedAt={updatedAt} onSetStage={onSetStage} onSelect={() => onSelectJob(job)} />)}{stageJobs.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-700 py-7 px-2 text-center"><p className="text-[9.5px] text-gray-400">No roles here yet</p></div>}</div></section>; })}</div>
      {hidden.length > 0 && <details className="mt-4 rounded-lg border border-gray-200 dark:border-zinc-800"><summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-3 text-[10px] font-semibold"><span>Hidden roles</span><span className="rounded-full border border-gray-200 dark:border-zinc-700 px-2 py-0.5 text-[8.5px] text-gray-500">{hidden.length}</span></summary><div className="border-t border-gray-100 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800">{hidden.map(({ job }) => <div key={job.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="text-[10px] font-semibold truncate">{job.title}</p><p className="text-[8.5px] text-gray-400 mt-0.5 truncate">{job.company}</p></div><button onClick={() => onRestore(job)} className="shrink-0 rounded-md border border-gray-200 dark:border-zinc-700 px-2.5 py-1.5 text-[8.5px] font-semibold">Restore</button></div>)}</div></details>}
      <div data-testid="freehire-tracking-status" className="mt-4 rounded-lg border border-gray-200 dark:border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div className="flex items-start gap-3"><div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-gray-500 shrink-0"><LockIcon className="w-4 h-4" /></div><div><p className="text-[11px] font-semibold">Private application tracking</p><p className="text-[9.5px] text-gray-400 mt-1">{trackingState === 'synced' ? 'Synced to Convex using your authenticated Personal session.' : trackingState === 'needs-login' ? 'This cached session predates secure job sync. Sign out and back in once to enable it; local preview data remains available.' : trackingState === 'loading' ? 'Connecting to your private Convex workspace…' : 'Convex is unavailable, so this development preview is using its per-user local fallback.'}</p></div></div><span className="text-[8.5px] font-mono uppercase tracking-wider text-gray-400 shrink-0">{trackingState === 'synced' ? 'Authenticated sync' : trackingState === 'needs-login' ? 'Re-login needed' : trackingState === 'loading' ? 'Connecting' : 'Local fallback'}</span></div>
    </div>
  );
}

function ApplicationCard({ job, stage, note, updatedAt, onSetStage, onSelect }: { job: FreeHireJob; stage: JobStage; note?: string; updatedAt: number; onSetStage: (job: FreeHireJob, stage: JobStage | undefined) => void; onSelect: () => void }) {
  const stageIndex = STAGE_META.findIndex((item) => item.id === stage);
  const nextStage = STAGE_META[stageIndex + 1]?.id;
  return <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.025)] min-w-0"><button onClick={onSelect} className="w-full text-left min-w-0"><div className="flex items-start gap-2.5 min-w-0"><CompanyMark job={job} /><div className="min-w-0"><p className="text-[10.5px] font-semibold leading-snug line-clamp-2">{job.title}</p><p className="text-[9px] text-gray-400 mt-1 truncate">{job.company}</p></div></div><div className="flex items-center justify-between gap-2 mt-3 text-[8.5px]"><span className="text-gray-600 dark:text-gray-300 truncate">{formatWorkMode(job.workMode)}</span><span className="text-gray-400 shrink-0">{relativeActivityTime(updatedAt)}</span></div>{note && <p className="mt-2 rounded-md bg-gray-50 dark:bg-zinc-800/60 p-2 text-[8.5px] leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">{note}</p>}</button><div className="flex gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100 dark:border-zinc-800">{nextStage ? <button onClick={() => onSetStage(job, nextStage)} className="flex-1 rounded-md bg-black dark:bg-white text-white dark:text-black py-1.5 px-2 text-[8.5px] font-semibold hover:opacity-80">Move to {STAGE_META[stageIndex + 1].label}</button> : <button onClick={() => window.open(job.applyUrl, '_blank', 'noopener,noreferrer')} className="flex-1 rounded-md bg-black dark:bg-white text-white dark:text-black py-1.5 px-2 text-[8.5px] font-semibold hover:opacity-80">Open listing</button>}<button onClick={() => onSetStage(job, undefined)} className="rounded-md border border-gray-200 dark:border-zinc-700 px-2 text-[11px] text-gray-400 hover:text-gray-700" title="Remove from applications">×</button></div></div>;
}

function InsightsView({ jobs, total, roleLane }: { jobs: FreeHireJob[]; total: number; roleLane: RoleLane }) {
  const activeLane = ROLE_LANES.find((lane) => lane.id === roleLane)?.label ?? 'Sales';
  const freshThisWeek = jobs.filter((job) => daysAgo(job.postedAt) <= 7).length;
  const remoteCount = jobs.filter((job) => job.workMode === 'remote').length;
  const watchCount = jobs.filter((job) => job.reality?.fakeFreshness || (job.reality?.repostCount ?? 0) >= 3).length;
  const sourceCounts = useMemo(() => { const counts = new Map<string, number>(); jobs.forEach((job) => counts.set(job.source, (counts.get(job.source) ?? 0) + 1)); return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5); }, [jobs]);
  return <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 xl:px-6 pb-6"><div className="pt-4 pb-4"><p className="text-[9px] font-medium uppercase tracking-[0.13em] text-gray-500">Current feed snapshot</p><h3 className="text-[18px] font-semibold tracking-tight mt-1.5">Market insights</h3><p className="text-[11px] text-gray-400 mt-1">A factual summary of the currently loaded {activeLane} catalogue—no AI or fabricated benchmarks.</p></div><div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-2.5 mb-3"><InsightMetric label="Matching roles" value={formatCount(total)} note="Reported by the live catalogue" /><InsightMetric label="Loaded this week" value={String(freshThisWeek)} note={`Of ${jobs.length} roles loaded`} /><InsightMetric label="Remote roles" value={String(remoteCount)} note="In the current page" /><InsightMetric label="Needs review" value={String(watchCount)} note="Repost or freshness signal" /></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-3"><section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4"><h4 className="text-[12px] font-semibold">Source mix</h4><p className="text-[9.5px] text-gray-400 mt-1">Where the currently loaded listings originated</p><div className="mt-4 space-y-3">{sourceCounts.map(([source, count]) => <div key={source}><div className="flex justify-between text-[9.5px] mb-1.5"><span className="text-gray-600 dark:text-gray-300">{source}</span><span className="font-bold">{count}</span></div><div className="h-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-black dark:bg-white rounded-full" style={{ width: `${Math.max(6, (count / Math.max(1, jobs.length)) * 100)}%` }} /></div></div>)}{sourceCounts.length === 0 && <p className="text-[10px] text-gray-400">Load jobs to populate this view.</p>}</div></section><section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4"><div className="flex items-center gap-2"><ShieldIcon className="w-4 h-4 text-gray-500" /><h4 className="text-[12px] font-semibold">Listing transparency</h4></div><p className="text-[9.5px] text-gray-400 mt-1">How Sequ3nce presents catalogue reality signals</p><div className="mt-4 space-y-2"><TransparencyRow label="Fresh" note="Recently observed with no strong warning signal" /><TransparencyRow label="Review" note="Repeated or refreshed enough to warrant a second look" /><TransparencyRow label="Unknown" note="The catalogue did not return a reality classification" /></div><p className="text-[8.5px] text-gray-400 mt-4 leading-relaxed">Signals are presented as evidence, never as a definitive claim that an employer is or is not hiring.</p></section></div></div>;
}

function FeedError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-8 text-center"><div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mx-auto"><InfoIcon className="w-4 h-4 text-gray-500" /></div><h4 className="text-[12px] font-semibold mt-3">The live feed could not load</h4><p className="text-[10px] text-gray-400 mt-1.5 max-w-md mx-auto leading-relaxed">{message}</p><button onClick={onRetry} className="mt-4 rounded-lg bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-[10px] font-semibold">Try again</button></div>; }
function EmptyState({ lane }: { lane: string }) { return <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-800 p-10 text-center"><h4 className="text-[12px] font-semibold">No {lane} roles match these filters</h4><p className="text-[10px] text-gray-400 mt-1.5">Try a wider posting window or a different work mode.</p></div>; }
function LoadingState() { return <div className="grid grid-cols-1 xl:grid-cols-2 gap-3"><div className="rounded-lg border border-gray-200 dark:border-zinc-800 overflow-hidden">{[0, 1, 2, 3].map((item) => <div key={item} className="p-4 border-b last:border-0 border-gray-100 dark:border-zinc-800 animate-pulse"><div className="h-3 rounded bg-gray-100 dark:bg-zinc-800 w-2/3" /><div className="h-2 rounded bg-gray-100 dark:bg-zinc-800 w-1/2 mt-2" /><div className="h-6 rounded bg-gray-100 dark:bg-zinc-800 w-full mt-3" /></div>)}</div><div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-5 animate-pulse"><div className="h-4 rounded bg-gray-100 dark:bg-zinc-800 w-3/4" /><div className="h-2 rounded bg-gray-100 dark:bg-zinc-800 w-1/2 mt-3" /><div className="h-32 rounded bg-gray-100 dark:bg-zinc-800 w-full mt-5" /></div></div>; }
function CompanyMark({ job, size = 'md' }: { job: FreeHireJob; size?: 'md' | 'lg' }) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [job.logoUrl]);
  const sizeClass = size === 'lg' ? 'w-11 h-11 text-[12px] rounded-lg' : 'w-9 h-9 text-[10px] rounded-md';
  return <div className={`${sizeClass} border border-gray-200 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800 text-black dark:text-white flex items-center justify-center shrink-0 font-bold tracking-tight overflow-hidden`}>{job.logoUrl && !logoFailed ? <img src={job.logoUrl} alt="" className="w-full h-full object-cover bg-white" loading="lazy" onError={() => setLogoFailed(true)} /> : companyInitials(job.company)}</div>;
}
function Tag({ children }: { children: React.ReactNode }) { return <span className="rounded-md bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 dark:text-gray-400">{children}</span>; }
function CompensationTag({ children }: { children: React.ReactNode }) { return <span className="rounded-md bg-blue-50 dark:bg-blue-950/35 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 dark:text-blue-300">{children}</span>; }
function RealityTag({ job }: { job: FreeHireJob }) { return <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 dark:border-blue-900 px-1.5 py-0.5 text-[8.5px] font-medium text-blue-700 dark:text-blue-300"><ShieldIcon className="w-2.5 h-2.5" />{realityLabel(job)}</span>; }
function DetailTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className={`relative py-2.5 text-[10.5px] font-semibold transition-colors ${active ? 'text-black dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}>{children}{active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-black dark:bg-white rounded-full" />}</button>; }
function DetailHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <h4 className={`text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 mb-2 ${className}`}>{children}</h4>; }
function SignalCell({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 dark:bg-zinc-800/70 p-2.5 min-w-0"><div className="text-[8px] font-mono uppercase tracking-wider text-gray-400">{label}</div><div className="text-[9.5px] font-semibold text-gray-700 dark:text-gray-300 mt-1 truncate">{value}</div></div>; }
function ApplicationMetric({ label, value }: { label: string; value: number }) { return <div className="text-right"><div className="text-[15px] font-bold tabular-nums">{value}</div><div className="text-[8px] font-mono uppercase tracking-wider text-gray-400 mt-0.5">{label}</div></div>; }
function InsightMetric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4"><p className="text-[8.5px] font-mono uppercase tracking-wider text-gray-400">{label}</p><p className="text-[20px] font-bold tracking-tight mt-1.5">{value}</p><p className="text-[9px] text-gray-400 mt-1">{note}</p></div>; }
function TransparencyRow({ label, note }: { label: string; note: string }) { return <div className="rounded-lg bg-gray-50 dark:bg-zinc-800/60 p-2.5"><p className="text-[10px] font-semibold">{label}</p><p className="text-[8.5px] text-gray-400 mt-0.5">{note}</p></div>; }

function jobSnapshot(job: FreeHireJob): FreeHireTrackedJobSnapshot {
  return {
    title: job.title,
    company: job.company,
    logoUrl: job.logoUrl || undefined,
    location: job.location,
    applyUrl: job.applyUrl,
    source: job.source,
    workMode: job.workMode,
    salary: job.salary,
    employmentType: job.employmentType,
    seniority: job.seniority,
    postedAt: job.postedAt || undefined,
  };
}

function jobFromSnapshot(id: string, job: FreeHireTrackedJobSnapshot): FreeHireJob {
  return {
    id,
    title: job.title,
    company: job.company,
    logoUrl: job.logoUrl ?? '',
    location: job.location,
    description: '',
    descriptionBlocks: [],
    applyUrl: job.applyUrl,
    source: job.source,
    workMode: job.workMode === 'remote' || job.workMode === 'hybrid' || job.workMode === 'onsite'
      ? job.workMode
      : 'unknown',
    skills: [],
    employmentType: job.employmentType,
    seniority: job.seniority,
    salary: job.salary,
    postedAt: job.postedAt ?? null,
    lastSeenAt: null,
    appliedCount: 0,
    domains: [],
    countries: [],
    reality: null,
  };
}

function activityFromServer(activity: FreeHireActivity): TrackedJob {
  return {
    stage: activity.stage,
    note: activity.note,
    dismissed: activity.dismissed,
    job: jobFromSnapshot(activity.externalJobId, activity.job),
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    stageChangedAt: activity.stageChangedAt,
  };
}

function normalizeLocalTracking(value: unknown): Record<string, TrackedJob> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const now = Date.now();
  const normalized: Record<string, TrackedJob> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Partial<TrackedJob>;
    if (!candidate.job || typeof candidate.job !== 'object') continue;
    const stage = candidate.stage;
    if (stage && !STAGE_META.some((meta) => meta.id === stage)) continue;
    normalized[id] = {
      stage,
      note: typeof candidate.note === 'string' ? candidate.note.slice(0, 2000) : undefined,
      dismissed: candidate.dismissed === true,
      job: candidate.job,
      createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : now,
      updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : now,
      stageChangedAt: typeof candidate.stageChangedAt === 'number' ? candidate.stageChangedAt : now,
    };
  }
  return normalized;
}

function mergeJobs(current: FreeHireJob[], incoming: FreeHireJob[]): FreeHireJob[] { const merged = new Map(current.map((job) => [job.id, job])); incoming.forEach((job) => merged.set(job.id, job)); return Array.from(merged.values()); }
function companyInitials(company: string): string { const words = company.split(/\s+/).filter(Boolean); return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || '?'; }
function daysAgo(date: string | null): number { if (!date) return Number.POSITIVE_INFINITY; const timestamp = new Date(date).getTime(); if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY; return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000)); }
function postedLabel(date: string | null): string { const days = daysAgo(date); if (!Number.isFinite(days)) return 'Date unknown'; if (days === 0) return 'Posted today'; if (days === 1) return 'Posted yesterday'; if (days < 30) return `Posted ${days}d ago`; return `Posted ${Math.floor(days / 30)}mo ago`; }
function formatWorkMode(mode: FreeHireJob['workMode']): string { if (mode === 'onsite') return 'On-site'; if (mode === 'unknown') return 'Work mode not listed'; return mode.charAt(0).toUpperCase() + mode.slice(1); }
function realityLabel(job: FreeHireJob): string { const reality = job.reality; if (!reality) return ''; if (reality.fakeFreshness || reality.repostCount >= 3) return 'Review signal'; if (reality.classification && reality.classification !== 'Unknown') return reality.classification; return 'Fresh'; }
function formatCount(value: number): string { return new Intl.NumberFormat('en-US', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value); }
function relativeActivityTime(timestamp: number): string { const elapsed = Math.max(0, Date.now() - timestamp); const minutes = Math.floor(elapsed / 60_000); if (minutes < 1) return 'Updated now'; if (minutes < 60) return `Updated ${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `Updated ${hours}h ago`; const days = Math.floor(hours / 24); return `Updated ${days}d ago`; }

type IconProps = { className?: string };
function RefreshIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2.1 5" /></svg>; }
function BookmarkIcon({ className, filled = false }: IconProps & { filled?: boolean }) { return <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5z" /></svg>; }
function ShieldIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>; }
function CheckIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 6" /></svg>; }
function ExternalIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5h5v5" /><path d="M10 14L19 5" /><path d="M19 14v5H5V5h5" /></svg>; }
function InfoIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>; }
function LockIcon({ className }: IconProps) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>; }
