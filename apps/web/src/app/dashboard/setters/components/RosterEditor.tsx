"use client";

// The EOD roster, editable in place: add a setter, their identity (email,
// tag, pod, role, Close user), their link, remove/restore. Same mutations as
// the Setter EODs page; that page keeps its own copy for unflagged teams.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Plus, RefreshCw } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { RosterIdentityInputs } from "../../setter-eods/RosterIdentityInputs";

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/setter-eod/${token}`;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy their EOD link:", url);
        }
      }}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      title="Copy their own end-of-day link"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "copied" : "copy link"}
    </button>
  );
}

export function RosterEditor({ clerkId }: { clerkId: string }) {
  const data = useQuery(api.setterEod.listRoster, { clerkId });
  const addSetter = useMutation(api.setterEod.addSetter);
  const setActive = useMutation(api.setterEod.setSetterActive);
  const rotate = useMutation(api.setterEod.rotateSetterToken);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Run one roster mutation with the row marked busy and any failure shown, never swallowed. */
  const act = async (rosterId: string, what: () => Promise<unknown>, fallback: string) => {
    setRowBusy(rosterId);
    setError(null);
    try {
      await what();
    } catch (err) {
      const data = (err as { data?: unknown })?.data;
      setError(typeof data === "string" ? data : fallback);
    } finally {
      setRowBusy(null);
    }
  };
  const roster = data?.roster ?? [];
  const active = roster.filter((r) => r.active);
  const inactive = roster.filter((r) => !r.active);

  return (
    <section className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Roster</span>
        <span className="max-w-md text-xs text-muted-foreground">
          Each row: their login email, the initials closers write on a booking, an optional pod, which end-of-day form they get, and which CRM user they are.
        </span>
      </div>
      <form
        className="flex gap-2 border-b border-border/60 px-4 py-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await addSetter({ clerkId, name: newName.trim() });
            setNewName("");
          } catch (err) {
            const data = (err as { data?: unknown })?.data;
            setError(typeof data === "string" ? data : "Couldn't add them");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Setter's name" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button type="submit" disabled={busy || !newName.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />
          Add setter
        </button>
      </form>
      {error && <p className="border-b border-border/60 px-4 py-2 text-[13px] text-rose-600">{error}</p>}
      {active.length === 0 && <p className="px-4 py-5 text-sm text-muted-foreground">Add your setters by name. Each one gets their own end-of-day link.</p>}
      {active.map((r) => (
        <div key={r._id} className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0">
          <span className="min-w-28 text-sm font-medium">{r.name}</span>
          <RosterIdentityInputs clerkId={clerkId} rosterId={r._id} email={r.email} pod={r.pod} tag={r.tag} role={r.role} crmUserId={r.crmUserId ?? null} />
          <span className="ml-auto flex items-center gap-3 text-[12px]">
            <CopyLink token={r.token} />
            <button
              type="button"
              disabled={rowBusy === r._id}
              onClick={() => {
                if (!window.confirm(`New link for ${r.name}? Their old link stops working.`)) return;
                void act(r._id, () => rotate({ clerkId, rosterId: r._id }), "Couldn't make a new link");
              }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              new link
            </button>
            <button type="button" disabled={rowBusy === r._id} onClick={() => void act(r._id, () => setActive({ clerkId, rosterId: r._id, active: false }), "Couldn't remove them")} className="text-muted-foreground underline hover:text-rose-600 disabled:opacity-50">
              remove
            </button>
          </span>
        </div>
      ))}
      {inactive.length > 0 && (
        <div className="border-t border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground">
          Removed:{" "}
          {inactive.map((r, i) => (
            <span key={r._id}>
              {i > 0 && ", "}
              {r.name}{" "}
              <button type="button" disabled={rowBusy === r._id} onClick={() => void act(r._id, () => setActive({ clerkId, rosterId: r._id, active: true }), "Couldn't restore them")} className="underline disabled:opacity-50">
                restore
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
