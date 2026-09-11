"use client";

// Email, tag, pod, role and CRM user on a roster row. Email is the setter-app
// login — without it a setter can still use their old tokenized link but
// can't sign in. Role decides which EOD form they get and which lane their
// bookings land in; the CRM user is the join to their Close/GHL activity.
// Saves on blur / change; a subtle state dot says what happened.

import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../convex/_generated/api";

type Role = "booking" | "confirmation";

export function RosterIdentityInputs({
  clerkId,
  rosterId,
  email,
  pod,
  tag,
  role,
  crmUserId,
}: {
  clerkId: string;
  rosterId: string;
  email: string | null;
  pod: string | null;
  tag: string | null;
  role?: Role;
  crmUserId?: string | null;
}) {
  const update = useMutation(api.setterEod.updateSetter);
  const updateLink = useMutation(api.setterRosterLink.updateRosterLink);
  const crmUsers = useQuery(api.setterRosterLink.listCrmUsers, { clerkId });
  const [emailDraft, setEmailDraft] = useState(email ?? "");
  const [podDraft, setPodDraft] = useState(pod ?? "");
  const [tagDraft, setTagDraft] = useState(tag ?? "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => setEmailDraft(email ?? ""), [email]);
  useEffect(() => setPodDraft(pod ?? ""), [pod]);
  useEffect(() => setTagDraft(tag ?? ""), [tag]);

  function flash(ok: boolean, err?: unknown) {
    setState(ok ? "saved" : "error");
    setWhy(!ok && err instanceof ConvexError && typeof err.data === "string" ? err.data : null);
    if (ok) setTimeout(() => setState("idle"), 1500);
  }

  async function save(fields: { email?: string | null; pod?: string | null; tag?: string | null }) {
    try {
      await update({ clerkId, rosterId: rosterId as any, ...fields });
      flash(true);
    } catch (err) {
      flash(false, err);
    }
  }

  async function saveLink(fields: { role?: Role; crmUserId?: string }) {
    try {
      await updateLink({ clerkId, rosterId: rosterId as any, ...fields });
      flash(true);
    } catch (err) {
      flash(false, err);
    }
  }

  const input = "rounded-md border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-foreground";
  const linkedUnknown = !!crmUserId && !(crmUsers ?? []).some((u) => u.crmUserId === crmUserId);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        value={emailDraft}
        onChange={(e) => setEmailDraft(e.target.value)}
        onBlur={() => {
          if ((email ?? "") !== emailDraft.trim()) void save({ email: emailDraft.trim() || null });
        }}
        placeholder="email for app login"
        className={`w-48 ${input}`}
      />
      <input
        value={tagDraft}
        onChange={(e) => setTagDraft(e.target.value)}
        onBlur={() => {
          if ((tag ?? "") !== tagDraft.trim().toLowerCase()) void save({ tag: tagDraft.trim() || null });
        }}
        placeholder="initials"
        title="The initials closers write on a booking title, for example 'er'. An exact match credits this setter and nobody else."
        className={`w-16 ${input}`}
      />
      <input
        value={podDraft}
        onChange={(e) => setPodDraft(e.target.value)}
        onBlur={() => {
          if ((pod ?? "") !== podDraft.trim()) void save({ pod: podDraft.trim() || null });
        }}
        placeholder="pod"
        title="Optional. A group name, if this team splits setters into pods."
        className={`w-14 ${input}`}
      />
      <select
        value={role ?? "booking"}
        onChange={(e) => void saveLink({ role: e.target.value as Role })}
        title="Booking: dials and sets. Confirmation: calls leads who booked themselves to get them to show — a different EOD form, and their numbers stay out of the booking setters' totals."
        className={input}
      >
        <option value="booking">booking setter</option>
        <option value="confirmation">confirmation setter</option>
      </select>
      <select
        value={crmUserId ?? ""}
        onChange={(e) => void saveLink({ crmUserId: e.target.value })}
        title="Which CRM user this person is — how their calls and texts get counted"
        className={`max-w-[11rem] ${input}`}
      >
        <option value="">CRM user: not linked</option>
        {linkedUnknown && <option value={crmUserId as string}>someone no longer in the CRM</option>}
        {(crmUsers ?? []).map((u) => (
          <option key={u.crmUserId} value={u.crmUserId}>
            {u.name}
            {u.isActive ? "" : " (inactive)"}
          </option>
        ))}
      </select>
      {state === "saved" && <span className="text-[11px] text-emerald-600">✓</span>}
      {state === "error" && <span className="text-[11px] text-rose-600">{why ?? "couldn't save"}</span>}
    </span>
  );
}
