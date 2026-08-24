"use client";

// Email + pod on a roster row. Email is the setter-app login — without it a
// setter can still use their old tokenized link but can't sign in. Saves on
// blur; a subtle state dot says what happened.

import React, { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export function RosterIdentityInputs({
  clerkId,
  rosterId,
  email,
  pod,
}: {
  clerkId: string;
  rosterId: string;
  email: string | null;
  pod: string | null;
}) {
  const update = useMutation(api.setterEod.updateSetter);
  const [emailDraft, setEmailDraft] = useState(email ?? "");
  const [podDraft, setPodDraft] = useState(pod ?? "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => setEmailDraft(email ?? ""), [email]);
  useEffect(() => setPodDraft(pod ?? ""), [pod]);

  async function save(fields: { email?: string | null; pod?: string | null }) {
    try {
      await update({ clerkId, rosterId: rosterId as any, ...fields });
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  }

  return (
    <span className="flex items-center gap-2">
      <input
        type="email"
        value={emailDraft}
        onChange={(e) => setEmailDraft(e.target.value)}
        onBlur={() => {
          if ((email ?? "") !== emailDraft.trim()) {
            void save({ email: emailDraft.trim() || null });
          }
        }}
        placeholder="email for app login"
        className="w-48 rounded-md border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-foreground"
      />
      <input
        value={podDraft}
        onChange={(e) => setPodDraft(e.target.value)}
        onBlur={() => {
          if ((pod ?? "") !== podDraft.trim()) {
            void save({ pod: podDraft.trim() || null });
          }
        }}
        placeholder="pod"
        className="w-14 rounded-md border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-foreground"
      />
      {state === "saved" && <span className="text-[11px] text-emerald-600">✓</span>}
      {state === "error" && <span className="text-[11px] text-rose-600">couldn't save</span>}
    </span>
  );
}
