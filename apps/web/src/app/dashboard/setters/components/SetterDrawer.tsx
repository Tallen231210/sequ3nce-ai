"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BookingsData, CardVM } from "../lib/cards";
import { BookingEvidenceList } from "./BookingEvidenceList";
import { CadenceRows } from "./CadenceRows";
import { EodRows } from "./EodRows";
import { SpeedByDay } from "./SpeedByDay";

type Tab = "bookings" | "speed" | "cadence" | "eod";

/** One person: their bookings with evidence, their speed to lead by day, their EOD days. */
export function SetterDrawer({
  card,
  records,
  timezone,
  clerkId,
  rangeStart,
  rangeEnd,
  onClose,
}: {
  card: CardVM | null;
  records: BookingsData["records"];
  timezone: string;
  clerkId: string;
  rangeStart: number;
  rangeEnd: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("bookings");
  const rows = card
    ? records
        .filter((r) => (card.rosterId ? r.creditIds.includes(card.rosterId) : r.lane === "dm" && (r.dmPerson ?? "no name on the link").toLowerCase() === card.dmLinkName))
        .sort((a, b) => b.startTime - a.startTime)
    : [];
  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: "bookings", label: `Bookings (${rows.length})`, show: true },
    { id: "speed", label: card?.team === "confirmation" ? "Response time" : "Speed to lead", show: !!card?.rosterId },
    { id: "cadence", label: "Cadence", show: card?.team === "outbound" && !!card.linked },
    { id: "eod", label: "EOD days", show: !!card?.rosterId },
  ];
  const active = tabs.find((t) => t.id === tab && t.show)?.id ?? "bookings";
  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) {
          setTab("bookings");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card?.name ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b border-border">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${active === t.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
        </div>
        {card && active === "bookings" && <BookingEvidenceList rows={rows} timezone={timezone} />}
        {card?.rosterId && active === "speed" && <SpeedByDay clerkId={clerkId} rosterId={card.rosterId} rangeStart={rangeStart} rangeEnd={rangeEnd} timezone={timezone} />}
        {card?.rosterId && active === "cadence" && <CadenceRows clerkId={clerkId} rosterId={card.rosterId} rangeStart={rangeStart} rangeEnd={rangeEnd} timezone={timezone} />}
        {card?.rosterId && active === "eod" && <EodRows clerkId={clerkId} rosterId={card.rosterId} rangeStart={rangeStart} rangeEnd={rangeEnd} />}
      </DialogContent>
    </Dialog>
  );
}
