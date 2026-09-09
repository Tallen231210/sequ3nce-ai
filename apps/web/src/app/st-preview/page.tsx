"use client";
/**
 * DEV-ONLY visual preview for the Setter teams section (Setter Data tab).
 * Real component, fixture data shaped from a dev rehearsal on real rows —
 * setter names are real, prospect names are not. 404 in production.
 */
import { notFound } from "next/navigation";
import { SetterTeamsView } from "../dashboard/setter-data/components/setters/SetterTeamsSection";
import { RosterIdentityInputs } from "../dashboard/setter-eods/RosterIdentityInputs";
import { DataHealthView } from "../dashboard/setter-eods/DataHealthCard";

const HEALTH = {
  weekStartKey: "2026-09-07", weekEndKey: "2026-09-09", timezone: "America/New_York", truncated: [], bookings: 186, followUps: 6,
  accuracy: { bookings: 186, due: 186, sourceKnown: 168, contactKnown: 170, showKnown: 121, allKnown: 104, sourcePct: 90, contactPct: 91, showPct: 65, score: 56 },
  lanes: { dm: 29, outbound: 59, confirmation: 65, selfBookedUncontacted: 5, unattributed: 28 },
  drags: {
    untaggedSelfBooks: { total: 25, byCloser: [{ name: "Ryleigh Harris", count: 6 }, { name: "Brittany Thatcher", count: 5 }, { name: "Joseph Adham", count: 5 }, { name: "Muzaffar Amoako", count: 5 }, { name: "Karl Dargan", count: 4 }] },
    missingInitials: { total: 8, bySetter: [{ name: "Erten", count: 8 }] },
    notRecolored: { total: 31, byCloser: [{ name: "Joseph Adham", count: 12 }, { name: "Karl Dargan", count: 10 }, { name: "Brittany Thatcher", count: 9 }] },
    leadMissing: 13, handMadeUntagged: 19,
    eodMissed: [{ name: "Sophie", days: ["2026-09-08"] }],
  },
} as never;
import { SetterContext, type SetterHome } from "../setter/_components/SetterContext";
import SetterEodPage from "../setter/eod/page";

const CONFIRMATION_HOME: SetterHome = {
  name: "Sophie",
  pod: null,
  role: "confirmation",
  eodFields: [
    { key: "newSelfBooked", label: "New self-booked calls", hint: "people who booked themselves through the funnel that day — prefilled from the calendar", optional: true, measured: true },
    { key: "contacted", label: "Contacted", hint: "of those, how many you called or texted — prefilled from Close", optional: true, measured: true },
    { key: "reached", label: "Reached", hint: "of those, how many you actually spoke to, or who replied", optional: true, measured: true },
    { key: "confirmed", label: "Confirmed", hint: "said yes, they'll be there", optional: true },
    { key: "rescheduled", label: "Rescheduled", hint: "moved to another time — still alive", optional: true },
    { key: "cancelled", label: "Cancelled or disqualified", hint: "gone", optional: true },
    { key: "confirmedOnCalendar", label: "Your calls on that day's calendar", hint: "self-booked calls scheduled that day that you had contacted — prefilled", optional: true, measured: true },
    { key: "confirmedShowed", label: "…of those, showed", hint: "how many of them turned up — prefilled where we know", optional: true, measured: true },
  ],
  teamName: "E2 Influencers",
  today: "2026-09-09",
  filedToday: false,
  todayEntry: null,
  recentDays: [{ dayKey: "2026-09-09", filed: false }, { dayKey: "2026-09-08", filed: true }],
};

const FIXTURE = {
 "comparison": [
  {
   "bookings": 29,
   "due": 29,
   "label": "DM setters",
   "lane": "dm",
   "noShow": 10,
   "rescheduled": 0,
   "showRatePct": 57,
   "showed": 13,
   "unknown": 6
  },
  {
   "bookings": 58,
   "due": 58,
   "label": "Outbound setters",
   "lane": "outbound",
   "noShow": 20,
   "rescheduled": 0,
   "showRatePct": 57,
   "showed": 26,
   "unknown": 12
  },
  {
   "bookings": 65,
   "due": 65,
   "label": "Confirmation (self-booked, contacted)",
   "lane": "confirmation",
   "noShow": 23,
   "rescheduled": 0,
   "showRatePct": 56,
   "showed": 29,
   "unknown": 13
  },
  {
   "bookings": 5,
   "due": 5,
   "label": "Self-booked, not contacted",
   "lane": "self_booked_uncontacted",
   "noShow": 2,
   "rescheduled": 0,
   "showRatePct": 50,
   "showed": 2,
   "unknown": 1
  },
  {
   "bookings": 29,
   "due": 29,
   "label": "Needs a look",
   "lane": "unattributed",
   "noShow": 10,
   "rescheduled": 0,
   "showRatePct": 57,
   "showed": 13,
   "unknown": 6
  }
 ],
 "dm": [
  {
   "bookings": 12,
   "crmOnly": 0,
   "due": 12,
   "id": "Davud",
   "name": "Davud",
   "noShow": 4,
   "rescheduled": 0,
   "showRatePct": 56,
   "showed": 5,
   "tagged": 0,
   "unknown": 3
  },
  {
   "bookings": 9,
   "crmOnly": 0,
   "due": 9,
   "id": "Lazar",
   "name": "Lazar",
   "noShow": 3,
   "rescheduled": 0,
   "showRatePct": 57,
   "showed": 4,
   "tagged": 0,
   "unknown": 2
  },
  {
   "bookings": 8,
   "crmOnly": 0,
   "due": 8,
   "id": "no name on the link",
   "name": "no name on the link",
   "noShow": 3,
   "rescheduled": 0,
   "showRatePct": 57,
   "showed": 4,
   "tagged": 0,
   "unknown": 1
  }
 ],
 "outbound": [
  {
   "bookings": 35,
   "crmOnly": 8,
   "due": 35,
   "id": "g17tw33ewqgf8wvn5f11xhmbed8e362d",
   "name": "Erten",
   "noShow": 12,
   "rescheduled": 0,
   "showRatePct": 57,
   "showed": 16,
   "tagged": 27,
   "unknown": 7
  },
  {
   "bookings": 15,
   "crmOnly": 0,
   "due": 15,
   "id": "g17ke3pv2nkwh6gv8gqp61h4z98e24y7",
   "name": "Israel",
   "noShow": 5,
   "rescheduled": 0,
   "showRatePct": 58,
   "showed": 7,
   "tagged": 15,
   "unknown": 3
  },
  {
   "bookings": 6,
   "crmOnly": 0,
   "due": 6,
   "id": "g17xj9fw1s0ah5r6rh4cgdq9px8e2dzc",
   "name": "Mo",
   "noShow": 2,
   "rescheduled": 0,
   "showRatePct": 60,
   "showed": 3,
   "tagged": 6,
   "unknown": 1
  },
  {
   "bookings": 2,
   "crmOnly": 0,
   "due": 2,
   "id": "g17twwcrwkaryfajctm8ebj4jd8e2a19",
   "name": "Marcus",
   "noShow": 1,
   "rescheduled": 0,
   "showRatePct": 50,
   "showed": 1,
   "tagged": 2,
   "unknown": 0
  }
 ],
 "confirmation": [
  {
   "bookings": 64,
   "contacted": 64,
   "coveragePct": 83,
   "crmOnly": 6,
   "due": 64,
   "id": "g17hn9v4psdakw16xyss2a7f7d8e2y88",
   "name": "Sophie",
   "newSelfBooks": 77,
   "noShow": 22,
   "reached": 2,
   "rescheduled": 0,
   "showRatePct": 57,
   "showed": 29,
   "tagged": 58,
   "unknown": 13
  }
 ],
 "selfBookedUncontacted": [
  {
   "bookings": 3,
   "crmOnly": 0,
   "due": 3,
   "id": "v17dm5dadhzagkjzqwwz3n6ffh8e2dr6",
   "name": "Brittany Thatcher",
   "noShow": 1,
   "rescheduled": 0,
   "showRatePct": 50,
   "showed": 1,
   "tagged": 0,
   "unknown": 1
  },
  {
   "bookings": 1,
   "crmOnly": 0,
   "due": 1,
   "id": "v17908xrttns247k84zra82z7n8e367p",
   "name": "Joseph Adham",
   "noShow": 0,
   "rescheduled": 0,
   "showRatePct": null,
   "showed": 0,
   "tagged": 0,
   "unknown": 1
  },
  {
   "bookings": 1,
   "crmOnly": 0,
   "due": 1,
   "id": "v179wmqxj7zgvh6x0p4vs2s23x8e364v",
   "name": "Ryleigh Harris",
   "noShow": 0,
   "rescheduled": 0,
   "showRatePct": null,
   "showed": 0,
   "tagged": 0,
   "unknown": 1
  }
 ],
 "unattributed": [
  {
   "bookings": 20,
   "crmOnly": 0,
   "due": 20,
   "id": "No booking link, no tag, no Close touch",
   "name": "No booking link, no tag, no Close touch",
   "noShow": 7,
   "rescheduled": 0,
   "showRatePct": 56,
   "showed": 9,
   "tagged": 0,
   "unknown": 4
  },
  {
   "bookings": 6,
   "crmOnly": 0,
   "due": 6,
   "id": "Funnel booking, lead not in Close",
   "name": "Funnel booking, lead not in Close",
   "noShow": 2,
   "rescheduled": 0,
   "showRatePct": 60,
   "showed": 3,
   "tagged": 0,
   "unknown": 1
  },
  {
   "bookings": 2,
   "crmOnly": 0,
   "due": 2,
   "id": "Funnel booking touched by someone off the roster",
   "name": "Funnel booking touched by someone off the roster",
   "noShow": 1,
   "rescheduled": 0,
   "showRatePct": 50,
   "showed": 1,
   "tagged": 0,
   "unknown": 0
  },
  {
   "bookings": 1,
   "crmOnly": 0,
   "due": 1,
   "id": "Booking link not in the team's word lists",
   "name": "Booking link not in the team's word lists",
   "noShow": 0,
   "rescheduled": 0,
   "showRatePct": null,
   "showed": 0,
   "tagged": 0,
   "unknown": 1
  }
 ],
 "funnel": {
  "contacted": 64,
  "leadMissing": 6,
  "newSelfBooks": 77,
  "uncontacted": 5
 },
 "followUpsExcluded": 6,
 "records": [
  {
   "key": "k0",
   "startTime": 1788271200000,
   "dayKey": "2026-09-01",
   "closerName": "Karl Dargan",
   "title": "Jordan and Karl",
   "eventName": "Facebook",
   "lane": "outbound",
   "attributedBy": "tag",
   "credit": [
    "Erten"
   ],
   "dmPerson": null,
   "token": "e",
   "touches": [
    {
     "name": "Erten",
     "kind": "dial",
     "at": 1788228000000,
     "reached": true
    }
   ],
   "verdict": {
    "result": "showed",
    "source": "recording",
    "due": true
   },
   "colour": "showed",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k1",
   "startTime": 1788361200000,
   "dayKey": "2026-09-02",
   "closerName": "Brittany Thatcher",
   "title": "Priya and Brittany",
   "eventName": "Facebook",
   "lane": "outbound",
   "attributedBy": "crm_activity",
   "credit": [
    "Erten"
   ],
   "dmPerson": null,
   "token": null,
   "touches": [
    {
     "name": "Erten",
     "kind": "sms",
     "at": 1788296400000,
     "reached": false
    },
    {
     "name": "Erten",
     "kind": "dial",
     "at": 1788339600000,
     "reached": true
    }
   ],
   "verdict": {
    "result": "no_show",
    "source": "calendar_color",
    "due": true
   },
   "colour": "red \u2014 set before the call",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k2",
   "startTime": 1788451200000,
   "dayKey": "2026-09-03",
   "closerName": "Joseph Adham",
   "title": "Marcus and Joseph",
   "eventName": "Main Training",
   "lane": "confirmation",
   "attributedBy": "crm_activity",
   "credit": [
    "Sophie"
   ],
   "dmPerson": null,
   "token": null,
   "touches": [
    {
     "name": "Sophie",
     "kind": "dial",
     "at": 1788429600000,
     "reached": true
    }
   ],
   "verdict": {
    "result": "showed",
    "source": "human",
    "due": true
   },
   "colour": "showed",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k3",
   "startTime": 1788541200000,
   "dayKey": "2026-09-04",
   "closerName": "Ryleigh Harris",
   "title": "Elena and Ryleigh",
   "eventName": "Facebook",
   "lane": "confirmation",
   "attributedBy": "tag",
   "credit": [
    "Sophie"
   ],
   "dmPerson": null,
   "token": "s",
   "touches": [],
   "verdict": {
    "result": "unknown",
    "source": null,
    "due": true
   },
   "colour": "uncolored",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k4",
   "startTime": 1788631200000,
   "dayKey": "2026-09-05",
   "closerName": "Muzaffar Amoako",
   "title": "Sam and Muzaffar",
   "eventName": "Instagram (Lazar)",
   "lane": "dm",
   "attributedBy": "event_name",
   "credit": [],
   "dmPerson": "Lazar",
   "token": null,
   "touches": [],
   "verdict": {
    "result": "no_show",
    "source": "recording",
    "due": true
   },
   "colour": "red \u2014 set before the call",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k5",
   "startTime": 1788721200000,
   "dayKey": "2026-09-06",
   "closerName": "Karl Dargan",
   "title": "Dev and Karl",
   "eventName": "Facebook",
   "lane": "self_booked_uncontacted",
   "attributedBy": "event_name",
   "credit": [],
   "dmPerson": null,
   "token": null,
   "touches": [],
   "verdict": {
    "result": "unknown",
    "source": null,
    "due": true
   },
   "colour": "uncolored",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k6",
   "startTime": 1788789600000,
   "dayKey": "2026-09-07",
   "closerName": "Brittany Thatcher",
   "title": "Nia and Brittany",
   "eventName": null,
   "lane": "unattributed",
   "attributedBy": "none",
   "credit": [],
   "dmPerson": null,
   "token": null,
   "touches": [],
   "verdict": {
    "result": "unknown",
    "source": null,
    "due": true
   },
   "colour": "uncolored",
   "leadInClose": false,
   "isFollowUp": false
  },
  {
   "key": "k7",
   "startTime": 1788274800000,
   "dayKey": "2026-09-01",
   "closerName": "Joseph Adham",
   "title": "Theo and Joseph",
   "eventName": "Facebook",
   "lane": "outbound",
   "attributedBy": "tag",
   "credit": [
    "Erten"
   ],
   "dmPerson": null,
   "token": "e",
   "touches": [
    {
     "name": "Erten",
     "kind": "dial",
     "at": 1788231600000,
     "reached": true
    }
   ],
   "verdict": {
    "result": "showed",
    "source": "recording",
    "due": true
   },
   "colour": "showed",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k8",
   "startTime": 1788364800000,
   "dayKey": "2026-09-02",
   "closerName": "Ryleigh Harris",
   "title": "Ava and Ryleigh",
   "eventName": "Facebook",
   "lane": "outbound",
   "attributedBy": "crm_activity",
   "credit": [
    "Erten"
   ],
   "dmPerson": null,
   "token": null,
   "touches": [
    {
     "name": "Erten",
     "kind": "sms",
     "at": 1788300000000,
     "reached": false
    },
    {
     "name": "Erten",
     "kind": "dial",
     "at": 1788343200000,
     "reached": true
    }
   ],
   "verdict": {
    "result": "no_show",
    "source": "calendar_color",
    "due": true
   },
   "colour": "red \u2014 set before the call",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k9",
   "startTime": 1788454800000,
   "dayKey": "2026-09-03",
   "closerName": "Muzaffar Amoako",
   "title": "Kai and Muzaffar",
   "eventName": "Main Training",
   "lane": "confirmation",
   "attributedBy": "crm_activity",
   "credit": [
    "Sophie"
   ],
   "dmPerson": null,
   "token": null,
   "touches": [
    {
     "name": "Sophie",
     "kind": "dial",
     "at": 1788433200000,
     "reached": true
    }
   ],
   "verdict": {
    "result": "showed",
    "source": "human",
    "due": true
   },
   "colour": "showed",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k10",
   "startTime": 1788544800000,
   "dayKey": "2026-09-04",
   "closerName": "Karl Dargan",
   "title": "Jordan and Karl",
   "eventName": "Facebook",
   "lane": "confirmation",
   "attributedBy": "tag",
   "credit": [
    "Sophie"
   ],
   "dmPerson": null,
   "token": "s",
   "touches": [],
   "verdict": {
    "result": "unknown",
    "source": null,
    "due": true
   },
   "colour": "uncolored",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k11",
   "startTime": 1788634800000,
   "dayKey": "2026-09-05",
   "closerName": "Brittany Thatcher",
   "title": "Priya and Brittany",
   "eventName": "Instagram (Lazar)",
   "lane": "dm",
   "attributedBy": "event_name",
   "credit": [],
   "dmPerson": "Lazar",
   "token": null,
   "touches": [],
   "verdict": {
    "result": "no_show",
    "source": "recording",
    "due": true
   },
   "colour": "red \u2014 set before the call",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k12",
   "startTime": 1788703200000,
   "dayKey": "2026-09-06",
   "closerName": "Joseph Adham",
   "title": "Marcus and Joseph",
   "eventName": "Facebook",
   "lane": "self_booked_uncontacted",
   "attributedBy": "event_name",
   "credit": [],
   "dmPerson": null,
   "token": null,
   "touches": [],
   "verdict": {
    "result": "unknown",
    "source": null,
    "due": true
   },
   "colour": "uncolored",
   "leadInClose": true,
   "isFollowUp": false
  },
  {
   "key": "k13",
   "startTime": 1788793200000,
   "dayKey": "2026-09-07",
   "closerName": "Ryleigh Harris",
   "title": "Elena and Ryleigh",
   "eventName": null,
   "lane": "unattributed",
   "attributedBy": "none",
   "credit": [],
   "dmPerson": null,
   "token": null,
   "touches": [],
   "verdict": {
    "result": "unknown",
    "source": null,
    "due": true
   },
   "colour": "uncolored",
   "leadInClose": false,
   "isFollowUp": false
  }
 ],
 "range": {
  "startMs": 1788235200000,
  "endMs": 1788840000000,
  "timezone": "America/New_York"
 },
 "rangeClampedToDays": null,
 "truncated": [],
 "cancelled": 13,
 "configured": {
  "dmPatterns": [
   "instagram",
   "davud",
   "lazar"
  ],
  "funnelPatterns": [
   "facebook",
   "main training"
  ],
  "rostersWithCrmUser": 8,
  "rosters": 9
 }
} as never;

export default function SetterTeamsPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <SetterTeamsView data={FIXTURE} />
      <DataHealthView data={HEALTH} />
      <div className="rounded-lg border border-border bg-neutral-50 p-4">
        <p className="mb-3 text-sm font-medium">Confirmation setter&apos;s EOD form (setter app)</p>
        <SetterContext.Provider value={{ sessionToken: "preview", home: CONFIRMATION_HOME, refresh: () => {} }}>
          <SetterEodPage />
        </SetterContext.Provider>
      </div>
      <div className="rounded-lg border border-border p-4">
        <p className="mb-2 text-sm font-medium">Roster row editor (Setter EODs tab)</p>
        <div className="flex items-center gap-3">
          <span className="min-w-32 text-sm font-medium">Sophie</span>
          <RosterIdentityInputs clerkId="preview" rosterId="preview" email="sophie@example.invalid" pod={null} tag="s" role="confirmation" crmUserId="user_preview" />
        </div>
      </div>
    </div>
  );
}
