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
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      title="Copy their personal EOD link"
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
  const [error, setError] = useState<string | null>(null);
  const roster = data?.roster ?? [];
  const active = roster.filter((r) => r.active);
  const inactive = roster.filter((r) => !r.active);

  return (
    <section className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Roster</span>
        <span className="text-xs text-muted-foreground">Role decides their form and their team. Tag = the initials closers write on their bookings.</span>
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
      {active.length === 0 && <p className="px-4 py-5 text-sm text-muted-foreground">Add your setters by name. Each gets a personal EOD link.</p>}
      {active.map((r) => (
        <div key={r._id} className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0">
          <span className="min-w-28 text-sm font-medium">{r.name}</span>
          <RosterIdentityInputs clerkId={clerkId} rosterId={r._id} email={r.email} pod={r.pod} tag={r.tag} role={r.role} crmUserId={r.crmUserId ?? null} />
          <span className="ml-auto flex items-center gap-3 text-[12px]">
            <CopyLink token={r.token} />
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`New link for ${r.name}? Their old link stops working.`)) return;
                await rotate({ clerkId, rosterId: r._id });
              }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              new link
            </button>
            <button type="button" onClick={() => setActive({ clerkId, rosterId: r._id, active: false })} className="text-muted-foreground underline hover:text-rose-600">
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
              <button type="button" onClick={() => setActive({ clerkId, rosterId: r._id, active: true })} className="underline">
                restore
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
