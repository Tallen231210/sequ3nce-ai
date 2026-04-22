import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { CloserInfo, PublicJob } from '../convex';
import { getPublicJobs, addPublicJob, closePublicJob, deletePublicJob, updateJobTracking } from '../convex';

interface JobBoardViewProps {
  closerInfo: CloserInfo;
}

type Tab = 'public' | 'internal';

const INDUSTRIES = [
  'Solar', 'Insurance', 'Real Estate', 'SaaS', 'Coaching',
  'Agency', 'Info Products', 'E-Commerce', 'Financial Services', 'Other',
];

const SOURCES = ['LinkedIn', 'Indeed', 'Direct', 'Other'];

// Short relative-time formatter for "posted N ago" labels on job cards.
function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function JobBoardView({ closerInfo }: JobBoardViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('public');
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [industry, setIndustry] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const userId = closerInfo.b2cUserId;
  const isFounder = closerInfo.badges?.includes('founder') || closerInfo.badges?.includes('admin');

  const loadJobs = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const data = await getPublicJobs(userId, industry || undefined);
    setJobs(data);
    setIsLoading(false);
  }, [userId, industry]);

  useEffect(() => { if (activeTab === 'public') loadJobs(); }, [activeTab, loadJobs]);

  const handleTracking = useCallback(async (jobId: string, field: 'saved' | 'applied' | 'interviewed', value: boolean) => {
    if (!userId) return;
    setJobs((prev) => prev.map((j) => j._id === jobId ? {
      ...j,
      tracking: {
        saved: j.tracking?.saved ?? false,
        applied: j.tracking?.applied ?? false,
        interviewed: j.tracking?.interviewed ?? false,
        [field]: value,
      },
    } : j));
    await updateJobTracking(userId, jobId, { [field]: value });
  }, [userId]);

  const handleClose = useCallback(async (jobId: string) => {
    if (!userId) return;
    await closePublicJob(userId, jobId);
    loadJobs();
  }, [userId, loadJobs]);

  const handleDelete = useCallback(async (jobId: string) => {
    if (!userId) return;
    await deletePublicJob(userId, jobId);
    loadJobs();
  }, [userId, loadJobs]);

  // Per-user stats computed from the already-loaded jobs array (no extra query).
  // Reflects whatever filter is currently active (e.g. industry) so counts
  // match what the user is actually looking at.
  const stats = useMemo(() => ({
    active: jobs.length,
    saved: jobs.filter((j) => j.tracking?.saved).length,
    applied: jobs.filter((j) => j.tracking?.applied).length,
    interviewed: jobs.filter((j) => j.tracking?.interviewed).length,
  }), [jobs]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Job Board</h2>
        <div className="flex gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 w-fit mb-4">
          {([
            { id: 'public' as Tab, label: 'Public Job Board' },
            { id: 'internal' as Tab, label: 'Internal' },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {activeTab === 'internal' ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-black mb-1">Opportunities Coming Soon</h3>
            <p className="text-[13px] text-gray-500 leading-relaxed max-w-md">
              We're building a marketplace that connects top closers with high-ticket sales teams.
              Check back soon for exclusive opportunities.
            </p>
          </div>
        ) : (
          <>
            {/* Stat row — per-user totals for the currently-visible (filtered) set */}
            {!isLoading && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                <StatCell label="Active Jobs" value={stats.active} />
                <StatCell label="Saved" value={stats.saved} />
                <StatCell label="Applied" value={stats.applied} />
                <StatCell label="Interviewed" value={stats.interviewed} />
              </div>
            )}

            {/* Filter bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
                >
                  <option value="">All Industries</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              {isFounder && (
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Job
                </button>
              )}
            </div>

            {/* Add job form */}
            {showAddForm && isFounder && (
              <AddJobForm userId={userId || ''} onComplete={() => { setShowAddForm(false); loadJobs(); }} onCancel={() => setShowAddForm(false)} />
            )}

            {/* Job list */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[14px] font-medium text-gray-600 mb-1">No jobs posted yet</p>
                <p className="text-[12px] text-gray-400">Check back soon for opportunities</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <JobCard key={job._id} job={job} isFounder={!!isFounder} onTracking={handleTracking} onClose={handleClose} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ==================== Stat Cell ====================

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800">
      <div className="text-[9px] font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="text-[20px] font-bold text-gray-900 dark:text-white tabular-nums tracking-tight mt-0.5">
        {value}
      </div>
    </div>
  );
}

// ==================== Job Card ====================

function JobCard({ job, isFounder, onTracking, onClose, onDelete }: {
  job: PublicJob;
  isFounder: boolean;
  onTracking: (jobId: string, field: 'saved' | 'applied' | 'interviewed', value: boolean) => void;
  onClose: (jobId: string) => void;
  onDelete: (jobId: string) => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <div className="p-4 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-[14px] font-semibold text-black dark:text-white">{job.title}</h3>
          <div className="flex items-center gap-2 mt-0.5 text-[12px] text-gray-500">
            <span className="font-medium">{job.companyName}</span>
            <span>&middot;</span>
            <span>{job.location}</span>
            {job.salaryRange && (
              <>
                <span>&middot;</span>
                <span className="text-green-600 font-medium">{job.salaryRange}</span>
              </>
            )}
            <span>&middot;</span>
            <span className="text-gray-400">{formatRelative(job.createdAt)}</span>
          </div>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 shrink-0">
          {job.industry}
        </span>
      </div>

      {job.description && (
        <p className="text-[12px] text-gray-500 mb-3 line-clamp-2">{job.description}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {(['saved', 'applied', 'interviewed'] as const).map((field) => {
            const checked = job.tracking?.[field] ?? false;
            return (
              <label key={field} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onTracking(job._id, field, !checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-black focus:ring-black/20"
                />
                <span className={`text-[11px] font-medium capitalize ${checked ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}`}>
                  {field}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {isFounder && (
            <>
              <button onClick={() => onClose(job._id)} className="text-[10px] font-medium text-gray-400 hover:text-amber-500 transition-colors">Close</button>
              <button
                onClick={() => { if (deleteConfirm) { onDelete(job._id); setDeleteConfirm(false); } else setDeleteConfirm(true); }}
                className="text-[10px] font-medium text-gray-400 hover:text-red-500 transition-colors"
              >
                {deleteConfirm ? 'Confirm?' : 'Delete'}
              </button>
            </>
          )}
          <button
            onClick={() => window.open(job.applyUrl, '_blank')}
            className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
          >
            Apply
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
        </div>
      </div>

      {job.source && <div className="mt-2 text-[10px] text-gray-400">Source: {job.source}</div>}
    </div>
  );
}

// ==================== Add Job Form ====================

function AddJobForm({ userId, onComplete, onCancel }: { userId: string; onComplete: () => void; onCancel: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [salaryRange, setSalaryRange] = useState('');
  const [industryVal, setIndustryVal] = useState('');
  const [description, setDescription] = useState('');
  const [applyUrl, setApplyUrl] = useState('');
  const [source, setSource] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await addPublicJob({
      userId, companyName: companyName.trim(), title: title.trim(), location: location.trim(),
      salaryRange: salaryRange.trim() || undefined, industry: industryVal,
      description: description.trim() || undefined, applyUrl: applyUrl.trim(),
      source: source || undefined,
    });
    setIsSubmitting(false);
    if (result.error) { setError(result.error); return; }
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-gray-50 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700">
      <h4 className="text-[13px] font-semibold text-black dark:text-white mb-3">Add Public Job</h4>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name *" maxLength={100} required className="px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10" />
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title *" maxLength={200} required className="px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10" />
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (e.g., Remote) *" maxLength={100} required className="px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10" />
        <input type="text" value={salaryRange} onChange={(e) => setSalaryRange(e.target.value)} placeholder="Salary/OTE (e.g., $150k-$250k)" maxLength={100} className="px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10" />
        <select value={industryVal} onChange={(e) => setIndustryVal(e.target.value)} required className="px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10">
          <option value="">Industry *</option>
          {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10">
          <option value="">Source</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <input type="url" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} placeholder="Apply URL (https://...) *" required className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-black/10" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" maxLength={2000} rows={2} className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-black/10 resize-none" />
      {error && <p className="text-[11px] text-red-500 mb-2">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-[12px] font-medium text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="px-4 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-40 transition-colors">{isSubmitting ? 'Adding...' : 'Add Job'}</button>
      </div>
    </form>
  );
}
