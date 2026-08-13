"use client";

// ============================================================================
// Outstanding balances — the manager's list.
//
// Money that was closed but never collected. The numbers have always been in
// the data (the post-call form records cash collected and contract value
// separately) and nothing has ever shown the gap to anyone.
//
// This is the page the daily digest links to. It exists so the digest can be a
// short prompt rather than a wall of rows: the message carries the total and
// the worst few, the list carries everything.
// ============================================================================

import { Fragment, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Loader2, Sparkles, Wallet } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { CollectionsSettings } from "./components/CollectionsSettings";
import { ClearedBalances } from "./components/ClearedBalances";
import { CallFactsEditor } from "@/components/calls/CallFactsEditor";

const HEADER = {
  title: "Collections",
  description: "Deals that closed but haven't been paid in full",
};

const TABS = [
  ["outstanding", "Outstanding"],
  ["cleared", "Recently cleared"],
  ["settings", "Settings"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function CollectionsPage() {
  const { user, isLoaded } = useUser();
  const [tab, setTab] = useState<Tab>("outstanding");

  const data = useQuery(
    api.collectionsSettings.getOutstandingBalances,
    isLoaded && user ? { clerkId: user.id } : "skip",
  );

  return (
    <div>
      <Header {...HEADER} />

      <div className="border-b px-6">
        <div className="flex gap-6">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "settings" ? (
        <CollectionsSettings />
      ) : tab === "cleared" ? (
        <ClearedBalances />
      ) : data === undefined ? (
        <LoadingState />
      ) : data === null || data.count === 0 ? (
        <EmptyState />
      ) : (
        <BalancesList data={data} canEdit={data.canEdit} />
      )}
    </div>
  );
}

interface Balance {
  callId: string;
  prospectName: string;
  closerName: string;
  cashCollected: number;
  contractValue: number;
  balance: number;
  outcomeSource?: string | null;
  closedAt: number;
  ageDays: number;
}

function BalancesList({
  data,
  canEdit,
}: {
  data: { balances: Balance[]; total: number; count: number; truncated: boolean };
  canEdit: boolean;
}) {
  const { user } = useUser();
  const resolve = useMutation(api.collectionsSettings.resolveBalance);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (
    callId: string,
    resolution: "settled" | "written_off",
  ) => {
    if (!user) return;
    setBusy(callId);
    setConfirming(null);
    setError(null);
    try {
      // No optimistic removal here. useQuery is a live subscription, so the row
      // disappears on its own the moment the mutation lands — faking it first
      // would only create a window where the two disagree.
      const result = await resolve({
        clerkId: user.id,
        callId: callId as never,
        resolution,
      });
      if (!result.success && result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-5">
        <div className="text-2xl font-semibold tabular-nums">
          {money(data.total)}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          outstanding across{" "}
          {data.count === 1 ? "1 deal" : `${data.count} deals`}
        </p>
      </div>

      {data.truncated && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          More open balances than this page can total — the figure above is
          understated. Clearing some will bring the rest into view.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-900">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Prospect</th>
              <th className="px-4 py-2.5 font-medium">Closer</th>
              <th className="px-4 py-2.5 text-right font-medium">Paid</th>
              <th className="px-4 py-2.5 text-right font-medium">Contract</th>
              <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
              <th className="px-4 py-2.5 text-right font-medium">Age</th>
              {canEdit && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {data.balances.map((b) => (
              <Fragment key={b.callId}>
              <tr className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {b.prospectName}
                    {/* A figure we READ off the recording and one a person
                        confirmed must not look identical, because on a payment
                        plan they carry very different confidence and this list
                        decides who gets chased for money. */}
                    {b.outcomeSource === "ai" && (
                      <span
                        title="Read from the recording, not entered by anyone. Use 'Fix figures' if a payment plan has moved on since the call."
                        className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        AI
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {b.closerName}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {money(b.cashCollected)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {money(b.contractValue)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {money(b.balance)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatAge(b.ageDays)}
                </td>
                {canEdit && (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {confirming === b.callId ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Never paying?
                        </span>
                        <button
                          onClick={() => act(b.callId, "written_off")}
                          className="rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background"
                        >
                          Write off
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-3">
                        <button
                          onClick={() => act(b.callId, "settled")}
                          disabled={busy === b.callId}
                          className="rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background disabled:opacity-50"
                        >
                          Collected
                        </button>
                        <button
                          onClick={() =>
                            setEditing(editing === b.callId ? null : b.callId)
                          }
                          disabled={busy === b.callId}
                          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {editing === b.callId ? "Close" : "Fix figures"}
                        </button>
                        <button
                          onClick={() => setConfirming(b.callId)}
                          disabled={busy === b.callId}
                          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          Write off
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>

              {/* Directly beneath the row being corrected, not at the foot of
                  the table — with twenty-odd balances on screen, an editor that
                  opens somewhere else is an editor you use on the wrong deal.

                  "Collected" settles a balance that was genuinely paid in full;
                  this is for the commoner case since AI started reading calls —
                  a payment plan whose deposit we recorded, where the customer
                  has since paid more and is perfectly current. Editing the
                  figure is the truthful fix; writing it off would say they
                  never paid. */}
              {canEdit && editing === b.callId && (
                <tr className="border-b bg-muted/30">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="mb-2 text-xs text-muted-foreground">
                      Correcting <span className="font-medium">{b.prospectName}</span> —
                      set cash collected to everything paid so far. It clears
                      from this list once it matches the contract.
                    </div>
                    <CallFactsEditor
                      compact
                      callId={b.callId}
                      facts={{
                        outcome: "closed",
                        cashCollected: b.cashCollected,
                        contractValue: b.contractValue,
                        outcomeSource: b.outcomeSource,
                      }}
                      onSaved={() => setEditing(null)}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Amounts come from the post-call form, or from the recording where nobody
        filled one in. Mark anything already paid as collected, or fix the figure
        directly if a payment plan has moved on since the call.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
          <Wallet className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-base font-semibold">Nothing outstanding</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Every deal your team has closed has been collected in full. When a
          closer logs a deal where the cash collected is less than the contract
          value, the balance appears here.
        </p>
      </div>
    </div>
  );
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatAge(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
