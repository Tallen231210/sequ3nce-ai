import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { CloserInfo, TeamResource } from '../convex';
import {
  getActiveResources,
  addResource,
  updateResource,
  deleteResource,
  reorderResources,
} from '../convex';

interface ResourcesViewProps {
  closerInfo: CloserInfo;
}

type ResourceType = 'script' | 'payment_link' | 'document' | 'link';

interface ResourceFormData {
  type: ResourceType;
  title: string;
  description: string;
  content: string;
  url: string;
}

const EMPTY_FORM: ResourceFormData = {
  type: 'payment_link',
  title: '',
  description: '',
  content: '',
  url: '',
};

const TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: 'payment_link', label: 'Payment Link' },
  { value: 'script', label: 'Script' },
  { value: 'document', label: 'Document' },
  { value: 'link', label: 'Link' },
];

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; bg: string; darkBg: string; text: string; label: string }> = {
  script: {
    label: 'Script',
    bg: 'bg-blue-50',
    darkBg: 'dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  payment_link: {
    label: 'Payment Link',
    bg: 'bg-green-50',
    darkBg: 'dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
  document: {
    label: 'Document',
    bg: 'bg-purple-50',
    darkBg: 'dark:bg-purple-900/30',
    text: 'text-purple-600 dark:text-purple-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  link: {
    label: 'Link',
    bg: 'bg-orange-50',
    darkBg: 'dark:bg-orange-900/30',
    text: 'text-orange-600 dark:text-orange-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
};

function showsUrlField(type: ResourceType): boolean {
  return type === 'payment_link' || type === 'document' || type === 'link';
}

function showsContentField(type: ResourceType): boolean {
  return type === 'script';
}

export function ResourcesView({ closerInfo }: ResourcesViewProps) {
  const [resources, setResources] = useState<TeamResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ResourceFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const b2cUserId = closerInfo.b2cUserId;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const loadResources = useCallback(() => {
    setIsLoading(true);
    getActiveResources(closerInfo.teamId).then((r) => {
      if (!mountedRef.current) return;
      setResources(r);
      setIsLoading(false);
    }).catch((err) => {
      console.error('[Resources] Failed to load:', err);
      if (mountedRef.current) setIsLoading(false);
    });
  }, [closerInfo.teamId]);

  useEffect(() => { loadResources(); }, [loadResources]);

  function handleCopy(resource: TeamResource) {
    const text = resource.url || resource.content || '';
    try { navigator.clipboard.writeText(text); } catch {}
    setCopiedId(resource._id);
    const t = setTimeout(() => { if (mountedRef.current) setCopiedId(null); }, 2000);
    timeoutsRef.current.push(t);
  }

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(resource: TeamResource) {
    setEditingId(resource._id);
    setForm({
      type: resource.type as ResourceType,
      title: resource.title,
      description: resource.description || '',
      content: resource.content || '',
      url: resource.url || '',
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSave() {
    if (!b2cUserId) return;
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    setIsSaving(true);
    setFormError(null);

    if (editingId) {
      const result = await updateResource(b2cUserId, editingId, {
        title: form.title,
        description: form.description || undefined,
        content: showsContentField(form.type) ? form.content || undefined : undefined,
        url: showsUrlField(form.type) ? form.url || undefined : undefined,
      });
      if (result.error) {
        if (mountedRef.current) { setFormError(result.error); setIsSaving(false); }
        return;
      }
    } else {
      const result = await addResource(
        b2cUserId,
        form.type,
        form.title,
        form.description || undefined,
        showsContentField(form.type) ? form.content || undefined : undefined,
        showsUrlField(form.type) ? form.url || undefined : undefined,
      );
      if (result.error) {
        if (mountedRef.current) { setFormError(result.error); setIsSaving(false); }
        return;
      }
    }

    if (mountedRef.current) {
      setIsSaving(false);
      closeForm();
      loadResources();
    }
  }

  async function handleDelete(resourceId: string) {
    if (!b2cUserId) return;
    setDeletingId(resourceId);
    const result = await deleteResource(b2cUserId, resourceId);
    if (mountedRef.current) {
      setDeletingId(null);
      if (!result.error) loadResources();
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0 || !b2cUserId) return;
    const newOrder = [...resources];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setResources(newOrder);
    await reorderResources(b2cUserId, newOrder.map((r) => r._id));
  }

  async function handleMoveDown(index: number) {
    if (index >= resources.length - 1 || !b2cUserId) return;
    const newOrder = [...resources];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setResources(newOrder);
    await reorderResources(b2cUserId, newOrder.map((r) => r._id));
  }

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[14px] text-gray-500 dark:text-zinc-400">Loading resources...</span>
      </div>
    );
  }

  // --- Form modal ---
  const formModal = showForm && (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingId ? 'Edit Resource' : 'Add Resource'}
          </h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          {formError && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          {/* Type selector — only for new resources */}
          {!editingId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const tc = TYPE_CONFIG[opt.value];
                  const selected = form.type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: opt.value }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        selected
                          ? `${tc.bg} ${tc.darkBg} ${tc.text} border-current`
                          : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {tc.icon}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Stripe Payment Link"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional short description"
              maxLength={500}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 focus:outline-none"
            />
          </div>

          {/* URL field (for payment_link, document, link) */}
          {showsUrlField(form.type) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">URL</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
                maxLength={2000}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 focus:outline-none"
              />
            </div>
          )}

          {/* Content textarea (for scripts) */}
          {showsContentField(form.type) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Script Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Paste your script here..."
                rows={6}
                maxLength={10000}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 focus:outline-none resize-none"
              />
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{form.content.length}/10,000</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2">
          <button
            onClick={closeForm}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !form.title.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-40"
          >
            {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Resource'}
          </button>
        </div>
      </div>
    </div>
  );

  // --- Empty state ---
  if (resources.length === 0 && !showForm) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        {formModal}
        <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-gray-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">No Resources Yet</h2>
        <p className="text-[14px] text-gray-500 dark:text-zinc-400 max-w-sm mb-4">
          Add your payment links, scripts, and other resources. They'll appear in your ammo panel during live calls.
        </p>
        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Resource
        </button>
      </div>
    );
  }

  // --- Resource list ---
  return (
    <div className="flex flex-col h-full">
      {formModal}

      <div className="px-6 pt-5 pb-3 shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Resources</h1>
          <p className="text-[14px] text-gray-500 dark:text-zinc-400 mt-1">Manage your sales resources.</p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Resource
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-2">
        {resources.map((resource, index) => {
          const tc = TYPE_CONFIG[resource.type] || TYPE_CONFIG.link;
          const urlOrContent = resource.url || resource.content;
          const isCopied = copiedId === resource._id;
          const isDeleting = deletingId === resource._id;

          return (
            <div
              key={resource._id}
              className={`flex items-start gap-3 p-4 bg-white dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700 hover:border-gray-200 dark:hover:border-zinc-600 transition-colors ${isDeleting ? 'opacity-50' : ''}`}
            >
              {/* Icon */}
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tc.bg} ${tc.darkBg} ${tc.text}`}>
                {tc.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-[14px] font-semibold text-black dark:text-white truncate">{resource.title}</h3>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tc.bg} ${tc.darkBg} ${tc.text}`}>
                    {tc.label}
                  </span>
                </div>
                {resource.description && (
                  <p className="text-[12px] text-gray-500 dark:text-zinc-400 mb-1">{resource.description}</p>
                )}
                {resource.type === 'script' && resource.content && (
                  <p className="text-[12px] text-gray-400 dark:text-zinc-500 line-clamp-2 italic">{resource.content}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Reorder arrows */}
                <div className="flex flex-col mr-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-0.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 disabled:opacity-20 transition-colors"
                    title="Move up"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index >= resources.length - 1}
                    className="p-0.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 disabled:opacity-20 transition-colors"
                    title="Move down"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>

                {/* Copy */}
                {urlOrContent && (
                  <button
                    onClick={() => handleCopy(resource)}
                    className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                    title="Copy"
                  >
                    {isCopied ? (
                      <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                )}

                {/* Open URL */}
                {resource.url && (
                  <button
                    onClick={() => window.open(resource.url!, '_blank')}
                    className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                    title="Open"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}

                {/* Edit */}
                <button
                  onClick={() => openEditForm(resource)}
                  className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                  title="Edit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(resource._id)}
                  disabled={isDeleting}
                  className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
