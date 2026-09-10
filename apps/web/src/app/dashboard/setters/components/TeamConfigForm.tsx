"use client";

// Team configuration the page is built from: section labels, DM setters
// (recognised by the name inside the booking link), and the word lists that
// sort booking links into DM or funnel. Saves on blur or on Save.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";

const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function errText(err: unknown, fallback: string): string {
  return err instanceof ConvexError && typeof err.data === "string" ? err.data : fallback;
}

export function TeamConfigForm({ clerkId }: { clerkId: string }) {
  const config = useQuery(api.settersPageConfig.getConfig, { clerkId });
  const setLabels = useMutation(api.settersPageConfig.setTeamLabels);
  const setPeople = useMutation(api.settersPageConfig.setDmPeople);
  const setPatterns = useMutation(api.settersPageConfig.updateLanePatterns);
  const setCreditRule = useMutation(api.settersPageConfig.setCreditRule);
  const [labels, setLabelsDraft] = useState({ dm: "", outbound: "", confirmation: "" });
  const [people, setPeopleDraft] = useState<Array<{ name: string; linkName: string; active: boolean }>>([]);
  const [dm, setDm] = useState("");
  const [funnel, setFunnel] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  // Seed the drafts once. The config query re-pushes whenever anything on
  // the team record changes (another form's save, a cron), and reseeding on
  // every push would wipe half-typed edits.
  const seeded = useRef(false);
  useEffect(() => {
    if (!config || seeded.current) return;
    seeded.current = true;
    setLabelsDraft({ dm: config.labels.dm, outbound: config.labels.outbound, confirmation: config.labels.confirmation });
    setPeopleDraft(config.people);
    setDm(config.dmPatterns.join(", "));
    setFunnel(config.funnelPatterns.join(", "));
  }, [config]);
  if (!config) return null;

  const run = async (what: () => Promise<unknown>, fallback: string) => {
    try {
      await what();
      setStatus("Saved");
      setTimeout(() => setStatus(null), 1500);
    } catch (err) {
      setStatus(errText(err, fallback));
    }
  };
  const split = (s: string) => s.split(",").map((w) => w.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Section names</h3>
        <p className="text-xs text-muted-foreground">A team type, never a person. Blank means the default.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["dm", "outbound", "confirmation"] as const).map((k) => (
            <label key={k} className="text-xs text-muted-foreground">
              {config.defaults[k]}
              <input className={`${input} mt-1`} value={labels[k]} onChange={(e) => setLabelsDraft({ ...labels, [k]: e.target.value })} onBlur={() => { if (labels[k] !== config.labels[k]) void run(() => setLabels({ clerkId, labels }), "Couldn't save the names"); }} />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">DM setters</h3>
        <p className="text-xs text-muted-foreground">Not Close users and no EOD. We recognise them by the word inside the booking link: "Instagram (Davud)" → link name davud.</p>
        <div className="mt-3 space-y-2">
          {people.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className={`${input} max-w-48`} placeholder="Name" value={p.name} onChange={(e) => setPeopleDraft(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className={`${input} max-w-40`} placeholder="link name" value={p.linkName} onChange={(e) => setPeopleDraft(people.map((x, j) => (j === i ? { ...x, linkName: e.target.value } : x)))} />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={p.active} onChange={(e) => setPeopleDraft(people.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /> active
              </label>
              <button type="button" className="text-xs text-muted-foreground underline hover:text-rose-600" onClick={() => setPeopleDraft(people.filter((_, j) => j !== i))}>
                remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className="rounded-md border border-border px-2.5 py-1 text-xs" onClick={() => setPeopleDraft([...people, { name: "", linkName: "", active: true }])}>
              Add DM setter
            </button>
            <button type="button" className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background" onClick={() => void run(() => setPeople({ clerkId, people }), "Couldn't save the DM setters")}>
              Save DM setters
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Booking link words</h3>
        <p className="text-xs text-muted-foreground">Which booking links are DM and which are the funnel, matched inside the Calendly event name. Comma-separated.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            DM links contain
            <input className={`${input} mt-1`} value={dm} onChange={(e) => setDm(e.target.value)} placeholder="instagram, davud, lazar" />
          </label>
          <label className="text-xs text-muted-foreground">
            Funnel links contain
            <input className={`${input} mt-1`} value={funnel} onChange={(e) => setFunnel(e.target.value)} placeholder="facebook, main training" />
          </label>
        </div>
        <button type="button" className="mt-3 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background" onClick={() => void run(() => setPatterns({ clerkId, dm: split(dm), funnel: split(funnel) }), "Couldn't save the word lists")}>
          Save word lists
        </button>
      </section>
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Who counts as the setter on a self-booked lead</h3>
        <p className="text-xs text-muted-foreground">
          A lead books itself through the funnel link, and an outbound setter calls or texts them afterwards, with no initials on the booking. Initials always credit the setter; this decides what a Close touch alone does.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={config.creditTouchAfterBooking}
            onChange={(e) => void run(() => setCreditRule({ clerkId, creditTouchAfterBooking: e.target.checked }), "Couldn't save the rule")}
          />
          <span>
            Credit the outbound setter who contacted them after the booking.
            <span className="block text-xs text-muted-foreground">Off: it stays a self-book in the confirmation column, and the setter&apos;s contact counts as confirmation work.</span>
          </span>
        </label>
      </section>
      {status && <p className={`text-xs ${status === "Saved" ? "text-emerald-600" : "text-rose-600"}`}>{status}</p>}
    </div>
  );
}
