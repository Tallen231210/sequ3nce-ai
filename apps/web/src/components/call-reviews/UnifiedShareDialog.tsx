"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Copy, Check, Link2, Users, ExternalLink } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { formatTime } from "./utils";

const MAX_SHARE_TITLE_LENGTH = 200;
const MAX_SHARE_NOTES_LENGTH = 1000;

interface UnifiedShareDialogProps {
  callId: Id<"calls">;
  teamId: Id<"teams">;
  closerId: Id<"closers">;
  userId: Id<"users">;
  userClerkId: string;
  currentTime: number;
  duration: number;
  closers: Array<{ _id: string; name: string }> | undefined;
  onClose: () => void;
}

export function UnifiedShareDialog({
  callId,
  teamId,
  closerId,
  userId,
  userClerkId,
  currentTime,
  duration,
  closers,
  onClose,
}: UnifiedShareDialogProps) {
  const [activeTab, setActiveTab] = useState<"team" | "link">("link");

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {/* Dialog header with tabs */}
        <div className="flex items-center border-b border-zinc-100">
          <button
            onClick={() => setActiveTab("link")}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "link"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <Link2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            Share via Link
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "team"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <Users className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            Share to Team
          </button>
          <button
            onClick={onClose}
            className="px-3 py-3 text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="p-6">
          {activeTab === "link" ? (
            <ShareViaLinkTab
              callId={callId}
              teamId={teamId}
              userClerkId={userClerkId}
              currentTime={currentTime}
              duration={duration}
              onClose={onClose}
            />
          ) : (
            <ShareToTeamTab
              callId={callId}
              teamId={teamId}
              closerId={closerId}
              userId={userId}
              currentTime={currentTime}
              duration={duration}
              closers={closers}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Tab 1: Share via Link
// ────────────────────────────────────────────

function ShareViaLinkTab({
  callId,
  teamId,
  userClerkId,
  currentTime,
  duration,
  onClose,
}: {
  callId: Id<"calls">;
  teamId: Id<"teams">;
  userClerkId: string;
  currentTime: number;
  duration: number;
  onClose: () => void;
}) {
  const createSharedLink = useMutation(api.sharedLinks.createSharedLink);
  const toggleSharedLink = useMutation(api.sharedLinks.toggleSharedLink);
  const existingLinks = useQuery(api.sharedLinks.getSharedLinksForCall, { callId });

  const [shareType, setShareType] = useState<"full" | "clip">("full");
  const [startSeconds, setStartSeconds] = useState(Math.max(0, Math.floor(currentTime - 5)));
  const [endSeconds, setEndSeconds] = useState(Math.min(duration, Math.floor(currentTime + 30)));
  const [includeComments, setIncludeComments] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const result = await createSharedLink({
        callId,
        teamId,
        shareType,
        startSeconds: shareType === "clip" ? startSeconds : undefined,
        endSeconds: shareType === "clip" ? endSeconds : undefined,
        includeComments,
        createdBy: userClerkId,
        createdByType: "manager",
      });
      setGeneratedUrl(result.url);
    } catch (err: any) {
      setError(err?.message || "Failed to create link");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older browsers / non-secure contexts
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggle = async (linkId: Id<"sharedLinks">, isActive: boolean) => {
    try {
      await toggleSharedLink({ linkId, isActive });
    } catch (err) {
      console.error("Failed to toggle link:", err);
    }
  };

  return (
    <div className="space-y-5">
      {/* Share type toggle */}
      <div>
        <label className="text-sm font-medium text-zinc-700 block mb-2">What to share</label>
        <div className="flex gap-2">
          <button
            onClick={() => setShareType("full")}
            className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
              shareType === "full"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
            }`}
          >
            Full call
          </button>
          <button
            onClick={() => setShareType("clip")}
            className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
              shareType === "clip"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
            }`}
          >
            Clip
          </button>
        </div>
      </div>

      {/* Clip time range */}
      {shareType === "clip" && (
        <div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-500 block mb-1">Start (seconds)</label>
              <input
                type="number"
                value={startSeconds}
                onChange={(e) => setStartSeconds(Math.max(0, Number(e.target.value)))}
                min={0}
                max={duration}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-500 block mb-1">End (seconds)</label>
              <input
                type="number"
                value={endSeconds}
                onChange={(e) => setEndSeconds(Math.min(duration, Number(e.target.value)))}
                min={startSeconds}
                max={duration}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          </div>
          <p className={`text-xs mt-1 ${startSeconds >= endSeconds ? "text-red-500" : "text-zinc-400"}`}>
            {startSeconds >= endSeconds
              ? "Start must be before end"
              : `${formatTime(startSeconds)} — ${formatTime(endSeconds)} (${Math.round(endSeconds - startSeconds)}s)`}
          </p>
        </div>
      )}

      {/* Include comments toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={includeComments}
          onChange={(e) => setIncludeComments(e.target.checked)}
          className="accent-zinc-900 w-4 h-4"
        />
        <span className="text-sm text-zinc-700">Include comments</span>
      </label>

      {/* Generate / Result */}
      {generatedUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2.5 bg-zinc-50 border border-zinc-200 rounded-md">
            <input
              type="text"
              value={generatedUrl}
              readOnly
              className="flex-1 bg-transparent text-sm text-zinc-700 outline-none"
            />
            <button
              onClick={() => handleCopy(generatedUrl)}
              className="shrink-0 p-1.5 rounded hover:bg-zinc-200 transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 text-zinc-500" />
              )}
            </button>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setGeneratedUrl(null)}>
              Create Another
            </Button>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isCreating || (shareType === "clip" && startSeconds >= endSeconds)}
            >
              {isCreating ? "Creating..." : "Generate Link"}
            </Button>
          </div>
        </>
      )}

      {/* Existing links */}
      {existingLinks && existingLinks.length > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Active Links ({existingLinks.filter((l) => l.isActive).length})
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {existingLinks.map((link) => (
              <div
                key={link._id}
                className={`flex items-center gap-2 p-2 rounded-md text-sm ${
                  link.isActive ? "bg-zinc-50" : "bg-zinc-50/50 opacity-50"
                }`}
              >
                <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                  link.shareType === "full"
                    ? "bg-blue-50 text-blue-600"
                    : "bg-amber-50 text-amber-600"
                }`}>
                  {link.shareType}
                </span>
                <span className="text-xs text-zinc-500 flex-1 truncate">
                  {new Date(link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {link.includeComments && " · with comments"}
                </span>
                <button
                  onClick={() => handleCopy(link.url)}
                  className="p-1 rounded hover:bg-zinc-200 transition-colors"
                  title="Copy link"
                >
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                </button>
                <button
                  onClick={() => handleToggle(link._id as Id<"sharedLinks">, !link.isActive)}
                  className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${
                    link.isActive
                      ? "text-red-600 hover:bg-red-50"
                      : "text-green-600 hover:bg-green-50"
                  }`}
                >
                  {link.isActive ? "Revoke" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Tab 2: Share to Team (existing share moment)
// ────────────────────────────────────────────

function ShareToTeamTab({
  callId,
  teamId,
  closerId,
  userId,
  currentTime,
  duration,
  closers,
  onClose,
}: {
  callId: Id<"calls">;
  teamId: Id<"teams">;
  closerId: Id<"closers">;
  userId: Id<"users">;
  currentTime: number;
  duration: number;
  closers: Array<{ _id: string; name: string }> | undefined;
  onClose: () => void;
}) {
  const shareCallMoment = useMutation(api.callReviews.shareCallMoment);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startTime, setStartTime] = useState(Math.max(0, Math.floor(currentTime - 5)));
  const [endTime, setEndTime] = useState(Math.min(duration, Math.floor(currentTime + 30)));
  const [shareWithAll, setShareWithAll] = useState(true);
  const [selectedCloserIds, setSelectedCloserIds] = useState<Set<string>>(new Set());
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShare = async () => {
    if (!title.trim()) return;
    if (startTime >= endTime) return;
    if (!shareWithAll && selectedCloserIds.size === 0) {
      setError("Select at least one closer or share with everyone");
      return;
    }
    if (title.trim().length > MAX_SHARE_TITLE_LENGTH) {
      setError(`Title too long (max ${MAX_SHARE_TITLE_LENGTH} chars)`);
      return;
    }
    if (notes.trim().length > MAX_SHARE_NOTES_LENGTH) {
      setError(`Notes too long (max ${MAX_SHARE_NOTES_LENGTH} chars)`);
      return;
    }

    setIsSharing(true);
    setError(null);
    try {
      await shareCallMoment({
        callId,
        teamId,
        closerId,
        title: title.trim(),
        notes: notes.trim() || undefined,
        startSeconds: startTime,
        endSeconds: endTime,
        sharedBy: userId,
        sharedWithAll: shareWithAll,
        sharedWithCloserIds: shareWithAll ? undefined : Array.from(selectedCloserIds),
      });
      onClose();
    } catch (err: any) {
      console.error("Failed to share moment:", err);
      setError("Failed to share moment. Please try again.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-zinc-700 block mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Great objection handle"
          maxLength={MAX_SHARE_TITLE_LENGTH}
          className="w-full px-3 py-2 border rounded-md text-sm"
          autoFocus
        />
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium text-zinc-700 block mb-1">Start (seconds)</label>
          <input
            type="number"
            value={startTime}
            onChange={(e) => setStartTime(Math.max(0, Number(e.target.value)))}
            min={0}
            max={duration}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium text-zinc-700 block mb-1">End (seconds)</label>
          <input
            type="number"
            value={endTime}
            onChange={(e) => setEndTime(Math.min(duration, Number(e.target.value)))}
            min={startTime}
            max={duration}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>
      </div>
      <p className={`text-xs ${startTime >= endTime ? "text-red-500" : "text-zinc-500"}`}>
        {startTime >= endTime
          ? "Start time must be before end time"
          : `Clip duration: ${Math.round(endTime - startTime)}s (${formatTime(startTime)} — ${formatTime(endTime)})`}
      </p>
      <div>
        <label className="text-sm font-medium text-zinc-700 block mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why is this moment worth watching?"
          maxLength={MAX_SHARE_NOTES_LENGTH}
          rows={2}
          className="w-full px-3 py-2 border rounded-md text-sm resize-none"
        />
      </div>
      {/* Share with picker */}
      <div>
        <label className="text-sm font-medium text-zinc-700 block mb-2">Share with</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="shareWith"
              checked={shareWithAll}
              onChange={() => { setShareWithAll(true); setSelectedCloserIds(new Set()); }}
              className="accent-zinc-900"
            />
            <span className="text-sm">Everyone on the team</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="shareWith"
              checked={!shareWithAll}
              onChange={() => setShareWithAll(false)}
              className="accent-zinc-900"
            />
            <span className="text-sm">Specific closers</span>
          </label>
          {!shareWithAll && (
            <div className="ml-6 space-y-1.5 max-h-32 overflow-y-auto">
              {closers && closers.length > 0 ? (
                closers.map((closer) => (
                  <label key={closer._id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCloserIds.has(closer._id)}
                      onChange={(e) => {
                        const next = new Set(selectedCloserIds);
                        if (e.target.checked) {
                          next.add(closer._id);
                        } else {
                          next.delete(closer._id);
                        }
                        setSelectedCloserIds(next);
                      }}
                      className="accent-zinc-900"
                    />
                    <span className="text-sm">{closer.name}</span>
                  </label>
                ))
              ) : (
                <p className="text-xs text-zinc-400">No closers found</p>
              )}
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleShare}
          disabled={!title.trim() || isSharing || startTime >= endTime}
        >
          {isSharing ? "Sharing..." : "Share with Team"}
        </Button>
      </div>
    </div>
  );
}
