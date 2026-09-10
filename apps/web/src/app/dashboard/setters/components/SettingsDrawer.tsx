"use client";

// Everything a manager configures for the Setters page, in one place:
// the roster, the team's section names / DM setters / booking-link words,
// the posts and reminders, and the Close connection.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTeam } from "@/hooks/useTeam";
import { ConnectionGate } from "../../setter-data/components/ConnectionGate";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CloseConnectionCard } from "../../setter-data/components/settings/CloseConnectionCard";
import { NotificationsCard } from "../../setter-eods/NotificationsCard";
import { RosterEditor } from "./RosterEditor";
import { TeamConfigForm } from "./TeamConfigForm";
import { ToleranceForm } from "./ToleranceForm";
import { ConnectLadder } from "./ConnectLadder";
import { ConnectThresholdForm } from "./ConnectThresholdForm";
import type { CrossCheckData } from "../lib/cards";

type Tab = "roster" | "team" | "posts" | "crm";

export function SettingsDrawer({
  clerkId,
  open,
  onClose,
  checks,
  initialTab = "roster",
  flash = null,
}: {
  clerkId: string;
  open: boolean;
  onClose: () => void;
  checks?: CrossCheckData | null;
  /** Which tab to open on — the page sets "crm" when a CRM callback landed. */
  initialTab?: Tab;
  flash?: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { team } = useTeam();
  const installation = useQuery(api.setterGhlOauth.getMyInstallationStatus, clerkId ? { clerkId } : "skip");
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "roster", label: "Roster" },
    { id: "team", label: "Teams & links" },
    { id: "posts", label: "Posts & reminders" },
    { id: "crm", label: "Close" },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {flash && <p className="text-sm text-emerald-700">{flash}</p>}
        {tab === "roster" && <RosterEditor clerkId={clerkId} />}
        {tab === "team" && (
          <div className="space-y-5">
            <TeamConfigForm clerkId={clerkId} />
            <section className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">What counts as a connect</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Close marks a dial "answered" whenever the line picked up, voicemail included, so a connect here is an answered call at or over this many
                seconds. It can't tell a short human hang-up from a machine. Tune it until the connects on the cards agree with the pick ups your setters file.
              </p>
              <ConnectLadder checks={checks} />
              <ConnectThresholdForm clerkId={clerkId} />
            </section>
            <ToleranceForm clerkId={clerkId} />
          </div>
        )}
        {tab === "posts" && <NotificationsCard />}
        {tab === "crm" && installation === undefined && <Loader2 className="my-6 h-4 w-4 animate-spin text-muted-foreground" />}
        {tab === "crm" && installation !== undefined && (installation && installation.connected ? <CloseConnectionCard installation={installation} /> : <ConnectionGate teamId={team ? String((team as { _id: unknown })._id) : undefined} clerkId={clerkId} showClose />)}
      </DialogContent>
    </Dialog>
  );
}
