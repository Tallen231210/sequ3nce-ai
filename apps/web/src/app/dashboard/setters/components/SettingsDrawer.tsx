"use client";

// Everything a manager configures for the Setters page, in one place:
// the roster, the team's section names / DM setters / booking-link words,
// the posts and reminders, and the Close connection.

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CloseConnectionCard } from "../../setter-data/components/settings/CloseConnectionCard";
import { NotificationsCard } from "../../setter-eods/NotificationsCard";
import { RosterEditor } from "./RosterEditor";
import { TeamConfigForm } from "./TeamConfigForm";

type Tab = "roster" | "team" | "posts" | "crm";

export function SettingsDrawer({ clerkId, open, onClose }: { clerkId: string; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("roster");
  const [flash, setFlash] = useState<string | null>(null);
  const installation = useQuery(api.setterGhlOauth.getMyInstallationStatus, clerkId ? { clerkId } : "skip");
  // The Close OAuth callback lands on the old route with ?connected=1 or
  // ?ghl_error=…; the bounce forwards the query string here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") setFlash("Close connected.");
    else if (params.get("ghl_error")) setFlash(`Close connection failed: ${params.get("ghl_error")}`);
    if (params.has("connected") || params.has("ghl_error")) {
      setTab("crm");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
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
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {flash && <p className="text-sm text-emerald-700">{flash}</p>}
        {tab === "roster" && <RosterEditor clerkId={clerkId} />}
        {tab === "team" && <TeamConfigForm clerkId={clerkId} />}
        {tab === "posts" && <NotificationsCard />}
        {tab === "crm" && (installation && installation.connected ? <CloseConnectionCard installation={installation} /> : <p className="py-4 text-sm text-muted-foreground">Close isn't connected. Connect it from Setter Data → Settings on an unflagged team, or ask us to connect it.</p>)}
      </DialogContent>
    </Dialog>
  );
}
