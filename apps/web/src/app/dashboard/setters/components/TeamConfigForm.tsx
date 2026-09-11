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
  const setSetsRule = useMutation(api.settersPageConfig.setSetsRule);
  const [labels, setLabelsDraft] = useState({ dm: "", outbound: "", confirmation: "", unlabeled: "" });
  const [people, setPeopleDraft] = useState<Array<{ name: string; linkName: string; active: boolean }>>([]);
  const [dm, setDm] = useState("");
  const [funnel, setFunnel] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  // The two rule checkboxes: local state so the click shows at once, reverted if the save fails.
  const [setsNeedInitials, setSetsNeedInitialsDraft] = useState<boolean | null>(null);
  const [creditAfter, setCreditAfterDraft] = useState<boolean | null>(null);
  // Seed the drafts once. The config query re-pushes whenever anything on
  // the team record changes (another form's save, a cron), and reseeding on
  // every push would wipe half-typed edits.
  const seeded = useRef(false);
  useEffect(() => {
    if (!config || seeded.current) return;
    seeded.current = true;
    setLabelsDraft({ dm: config.labels.dm, outbound: config.labels.outbound, confirmation: config.labels.confirmation, unlabeled: config.labels.unlabeled });
    setPeopleDraft(config.people);
    setDm(config.dmPatterns.join(", "));
    setFunnel(config.funnelPatterns.join(", "));
    setSetsNeedInitialsDraft(config.setsNeedInitials);
    setCreditAfterDraft(config.creditTouchAfterBooking);
  }, [config]);
  if (!config) return null;

  const run = async (what: () => Promise<unknown>, fallback: string) => {
    try {
      await what();
      setStatus("Saved");
      setTimeout(() => setStatus(null), 1500);
    } catch (err) {
      setStatus(errText(err, fallback));
      throw err;
    }
  };
  const split = (s: string) => s.split(",").map((w) => w.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">What do you call each team?</h3>
        <p className="text-xs text-muted-foreground">Name the job, never a person — people change teams. Leave a box empty to keep the name shown in it.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {(["dm", "outbound", "confirmation", "unlabeled"] as const).map((k) => (
            <label key={k} className="text-xs text-muted-foreground">
              {config.defaults[k]}
              <input className={`${input} mt-1`} value={labels[k]} onChange={(e) => setLabelsDraft({ ...labels, [k]: e.target.value })} onBlur={() => { if (labels[k] !== config.labels[k]) void run(() => setLabels({ clerkId, labels }), "Couldn't save the names").catch(() => undefined); }} />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Who books calls from DMs?</h3>
        <p className="text-xs text-muted-foreground">
          They don&apos;t work in the CRM and don&apos;t file an end-of-day form, so we recognise them by the name inside their booking link. A link called &quot;Instagram
          (Davud)&quot; means the link name is davud.
        </p>
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
            <button type="button" className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background" onClick={() => void run(() => setPeople({ clerkId, people }), "Couldn't save the DM setters").catch(() => undefined)}>
              Save DM setters
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Which booking links come from DMs, and which from the funnel?</h3>
        <p className="text-xs text-muted-foreground">Type words that appear in the booking link&apos;s name, separated by commas. We look for them inside the name.</p>
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
        <button type="button" className="mt-3 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background" onClick={() => void run(() => setPatterns({ clerkId, dm: split(dm), funnel: split(funnel) }), "Couldn't save the word lists").catch(() => undefined)}>
          Save word lists
        </button>
      </section>
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Does a setter need initials on the booking to get credit?</h3>
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Why this matters</summary>
          <p className="mt-1 max-w-3xl">
            Initials on the booking, a name in the DM link, or a claim always credit the setter. This only decides what happens when a booking has none of those and the only
            sign is that the setter called or texted the lead in the CRM.
          </p>
        </details>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={setsNeedInitials ?? config.setsNeedInitials}
            onChange={(e) => {
              const next = e.target.checked;
              setSetsNeedInitialsDraft(next);
              void run(() => setSetsRule({ clerkId, setsNeedInitials: next }), "Couldn't save the rule").then(() => undefined, () => setSetsNeedInitialsDraft(!next));
            }}
          />
          <span>
            Yes — a call or text in the CRM is never enough on its own.
            <span className="block text-xs text-muted-foreground">
              On: a booking with nobody&apos;s name on it waits under &quot;Who booked these?&quot;, listed beside whoever called the lead, for someone to say whose it is. Off: a
              setter who worked the lead in the CRM gets the credit without initials.
            </span>
          </span>
        </label>
      </section>

      <section className={`rounded-lg border border-border p-4 ${(setsNeedInitials ?? config.setsNeedInitials) ? "opacity-60" : ""}`}>
        <h3 className="text-sm font-semibold">Who gets a lead who booked themselves and was called afterwards?</h3>
        {(setsNeedInitials ?? config.setsNeedInitials) && <p className="text-xs font-medium">Not in use while a set needs initials.</p>}
        <p className="text-xs text-muted-foreground">
          The lead booked themselves through the funnel, an outbound setter called or texted them afterwards, and nobody wrote initials on the booking.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={creditAfter ?? config.creditTouchAfterBooking}
            disabled={setsNeedInitials ?? config.setsNeedInitials}
            onChange={(e) => {
              const next = e.target.checked;
              setCreditAfterDraft(next);
              void run(() => setCreditRule({ clerkId, creditTouchAfterBooking: next }), "Couldn't save the rule").then(() => undefined, () => setCreditAfterDraft(!next));
            }}
          />
          <span>
            The outbound setter who called them after they booked.
            <span className="block text-xs text-muted-foreground">Off: it stays a self-booked call in the confirmation column, and the call they made counts as confirmation work.</span>
          </span>
        </label>
      </section>
      {status && <p className={`text-xs ${status === "Saved" ? "text-emerald-600" : "text-rose-600"}`}>{status}</p>}
    </div>
  );
}
