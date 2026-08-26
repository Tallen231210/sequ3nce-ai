"use client";

// ============================================================================
// The Fathom card in Settings.
//
// Two jobs, and the second is easy to underrate:
//
//   1. Connect the account, by pasting an API key.
//   2. Confirm which email is on that Fathom account.
//
// (2) matters because Fathom tells us who recorded a meeting by their Fathom
// address, and that is very often a personal Gmail rather than a work address.
// If it doesn't match, their calls arrive with nobody attached and quietly
// never appear. So we ask, once, and we say why.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getFathomStatus,
  ignoreRecorder,
  connectFathom,
  disconnectFathom,
  setFathomEmail,
  setOutcomeReminders,
  syncFathomNow,
  type FathomStatus,
} from "@/lib/closer/fathom";

export function FathomCard() {
  const [status, setStatus] = useState<FathomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [teamWide, setTeamWide] = useState(false);
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "sync" | "email" | "ignore">(null);
  // Mirrored locally so the switch responds instantly; the server is the
  // authority and a failure snaps it back.
  const [reminders, setReminders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);

  // Re-armed at the top of the effect, not just in cleanup. React's
  // development double-mount runs the cleanup and then re-runs the effect on
  // the same instance, and a ref left false here means every response is
  // dropped and the card sits on "Loading…" forever.
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const next = await getFathomStatus();
    if (!mounted.current) return;
    setStatus(next);
    setEmailDraft(next?.fathomEmail ?? "");
    setReminders(next?.outcomeRemindersEnabled === true);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const handleConnect = async () => {
    setBusy("connect");
    setError(null);
    setNotice(null);
    const result = await connectFathom(apiKey.trim(), teamWide);
    if (!mounted.current) return;
    setBusy(null);
    if (!result?.success) {
      setError(result?.error ?? "Couldn't connect to Fathom.");
      return;
    }
    setApiKey("");
    setNotice(
      result.scope === "personal"
        ? "Connected. We'll receive your own recordings as they finish."
        : "Connected. We'll receive recordings shared with your team as they finish.",
    );
    await refresh();
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    setError(null);
    setNotice(null);
    await disconnectFathom();
    if (!mounted.current) return;
    setBusy(null);
    await refresh();
  };

  const handleIgnore = async (email: string, undo = false) => {
    setBusy("ignore");
    setError(null);
    setNotice(null);
    const result = await ignoreRecorder(email, undo);
    if (!mounted.current) return;
    setBusy(null);
    if (!result?.success) {
      setError("Couldn't save that.");
      return;
    }
    setNotice(
      undo
        ? `${email} will be reported again if it turns up.`
        : `We won't mention ${email} again. Their calls were never counted.`,
    );
    await refresh();
  };

  const handleSync = async () => {
    setBusy("sync");
    setError(null);
    setNotice(null);
    const result = await syncFathomNow();
    if (!mounted.current) return;
    setBusy(null);
    if (!result?.success) {
      setError(result?.error ?? "Couldn't reach Fathom.");
      return;
    }
    const added = result.created;
    setNotice(
      added > 0
        ? `Brought in ${added} new ${added === 1 ? "meeting" : "meetings"}.`
        : "Nothing new to bring in — we re-checked which of your calls were sales calls.",
    );
    await refresh();
  };

  const handleSaveEmail = async () => {
    setBusy("email");
    setError(null);
    const result = await setFathomEmail(emailDraft.trim());
    if (!mounted.current) return;
    setBusy(null);
    if (!result?.success) {
      setError(result?.error ?? "Couldn't save that.");
      return;
    }
    setEditingEmail(false);
    setNotice("Saved.");
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-[13px] text-gray-500">Loading...</span>
      </div>
    );
  }

  // Not on this team's plan and nothing connected: the card simply isn't
  // there. Showing a connect form that's guaranteed to be refused is an
  // invitation to file a bug.
  if (status && !status.availableOnPlan && !status.connected) {
    return null;
  }

  return (
    <div className="space-y-4">
      {status?.connected ? (
        <>
          <div className="flex items-center gap-2 text-[13px] flex-wrap">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-green-700 font-medium">
              {status.connectedBySomeoneElse ? "Connected by your team" : "Connected"}
            </span>
            {status.lastSyncedAt && (
              <span className="text-gray-400 text-[11px]">
                Last checked {new Date(status.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>

          {status.errorMessage && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Fathom stopped responding: {status.errorMessage}. Reconnecting usually fixes it.
            </p>
          )}

          {/* The one failure that looks like nothing at all: recordings
              arriving from a Fathom account we can't place. Say it plainly and
              say what to do, because the alternative symptom is a manager
              wondering where someone's calls went. */}
          {status.unmatchedRecorders?.length > 0 && (
            <div className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1 max-w-md">
              <p className="font-medium">
                We&apos;re getting recordings from{' '}
                {status.unmatchedRecorders.length === 1
                  ? 'an account'
                  : `${status.unmatchedRecorders.length} accounts`}{' '}
                we don&apos;t recognise:
              </p>
              <ul className="space-y-1">
                {status.unmatchedRecorders.map((u) => (
                  <li key={u.email} className="flex items-center gap-2 flex-wrap">
                    <span>
                      {u.email}{' '}
                      <span className="text-amber-700">
                        ({u.count} {u.count === 1 ? 'call' : 'calls'})
                      </span>
                    </span>
                    {/* The third case, and at most companies the commonest: it's
                        support or ops, whose Fathom the closer's key can see and
                        whose calls are nobody's sales calls. Without this the
                        warning returns every time they record, and a warning
                        that never goes away is one people stop reading. */}
                    <button
                      onClick={() => void handleIgnore(u.email)}
                      disabled={busy !== null}
                      className="text-[11.5px] font-medium text-amber-900 underline hover:no-underline disabled:opacity-50"
                    >
                      Not a closer
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-amber-800">
                If one of those is yours, set it as your Fathom email below. If it
                belongs to a teammate, they need adding to the team first. If it&apos;s
                someone outside sales — support, ops — mark it{' '}
                <span className="font-medium">Not a closer</span> and we&apos;ll stop
                mentioning it.
              </p>
            </div>
          )}

          {/* Never hide a suppression rule. Someone else marking an address as
              "not a closer" is otherwise indistinguishable from that person's
              calls quietly failing to arrive, and the two want opposite fixes. */}
          {status.ignoredRecorders?.length > 0 && (
            <div className="text-[11.5px] text-gray-500 max-w-md space-y-1">
              <p>Not counted as closers:</p>
              <ul className="space-y-0.5">
                {status.ignoredRecorders.map((email) => (
                  <li key={email} className="flex items-center gap-2 flex-wrap">
                    <span>{email}</span>
                    <button
                      onClick={() => void handleIgnore(email, true)}
                      disabled={busy !== null}
                      className="font-medium text-gray-600 underline hover:no-underline disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The email match. Worth its own block — this is the single thing
              most likely to make a closer's calls silently not show up. */}
          <div className="space-y-2 max-w-md">
            <div className="text-[12px] font-medium text-gray-700">Your Fathom email</div>
            {editingEmail ? (
              <div className="space-y-2">
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEmail}
                    disabled={busy === "email" || !emailDraft.trim()}
                    className="px-4 py-2 text-[12px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
                  >
                    {busy === "email" ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingEmail(false);
                      setEmailDraft(status.fathomEmail ?? "");
                      setError(null);
                    }}
                    className="px-4 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] text-gray-900">
                  {status.fathomEmail ?? status.email ?? "Not set"}
                </span>
                {!status.fathomEmail && (
                  <span className="text-[11px] text-gray-400">
                    (assuming it matches your Sequ3nce login)
                  </span>
                )}
                <button
                  onClick={() => setEditingEmail(true)}
                  className="text-[12px] font-medium text-gray-600 hover:text-gray-900 underline"
                >
                  Change
                </button>
              </div>
            )}
            <p className="text-[11.5px] text-gray-500 leading-relaxed">
              If you signed up for Fathom with a different address than you use here,
              tell us which one — it&apos;s how we know which calls are yours.
            </p>
          </div>

          {/* Opt-in, and off by default. An unrequested daily email is the
              fastest way to teach a team to filter everything we send. */}
          <label className="flex items-start gap-2.5 max-w-md cursor-pointer">
            <input
              type="checkbox"
              checked={reminders}
              onChange={async (e) => {
                const next = e.target.checked;
                setReminders(next);
                const result = await setOutcomeReminders(next);
                if (!mounted.current) return;
                if (!result?.success) {
                  setReminders(!next);
                  setError("Couldn't save that preference.");
                }
              }}
              className="mt-0.5"
            />
            <span className="text-[12.5px] text-gray-700">
              Email me a daily reminder
              <span className="block text-[11.5px] text-gray-500">
                One message a day, only when you actually have calls waiting on
                an outcome. Nothing otherwise.
              </span>
            </span>
          </label>

          {/* Meetings arrive on their own, so this is not how calls get here.
              Its real use is re-running the sales-call check after the team
              roster changes — which the label needs to say, because "check for
              new meetings" reads as the thing that makes the feature work. */}
          <p className="text-[11.5px] text-gray-500 leading-relaxed max-w-md">
            New calls arrive on their own within a minute of finishing. Use this
            after someone joins or leaves your team — it re-checks which of your
            calls were sales calls using the updated roster.
          </p>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleSync}
              disabled={busy !== null}
              className="px-4 py-2 text-[12px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
            >
              {busy === "sync" ? "Re-checking..." : "Re-check my calls"}
            </button>
            {!status.connectedBySomeoneElse && (
              <button
                onClick={handleDisconnect}
                disabled={busy !== null}
                className="px-4 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-800"
              >
                {busy === "disconnect" ? "Disconnecting..." : "Disconnect"}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3 max-w-md">
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Already record your calls with Fathom? Connect it and they&apos;ll show up
            here automatically — no bot to invite, nothing to remember.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your Fathom API key"
            className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
          />
          <label className="flex items-start gap-2 text-[12px] text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={teamWide}
              onChange={(e) => setTeamWide(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              This is our company Fathom account
              <span className="block text-gray-400 text-[11px]">
                Tick this only if the key belongs to a shared company account, not your own.
              </span>
            </span>
          </label>
          <button
            onClick={handleConnect}
            disabled={busy !== null || apiKey.trim().length < 8}
            className="px-4 py-2 text-[12px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {busy === "connect" ? "Connecting..." : "Connect Fathom"}
          </button>
          <p className="text-[11.5px] text-gray-500 leading-relaxed">
            Find your key in Fathom under Settings → Integrations → API.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] text-red-600">{error}</p>}
      {notice && <p className="text-[12px] text-green-700">{notice}</p>}
    </div>
  );
}
