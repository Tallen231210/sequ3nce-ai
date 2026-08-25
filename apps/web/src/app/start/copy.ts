// ============================================================================
// /start funnel copy — round three (co-founder's funnel-v6, 2026-08-25).
// A/B test: variant "a" = JOB angle · Brunson style, variant "b" = JOB angle ·
// Hormozi style. Both share one skeleton; only the strings below differ.
// ============================================================================

import type { ReactNode } from "react";

export type WhyTile = { h: string; p: string };
export type Faq = { q: string; a: string };

export type VariantCopy = {
  headline: ReactNode;
  lede: string;
  videoLabel: string;
  cta: string;
  whyKick: string;
  /** First three tiles differ per variant; SHARED_TILES follow them. */
  whyTiles: WhyTile[];
  /** Second FAQ slot differs per variant. */
  faqSwap: Faq;
};

/** The seven-row value stack — identical on both variants. */
export const STACK_ROWS: Array<[string, string]> = [
  ["Six-Week Closing Program", "$3,000 value"],
  ["Live Commission Role Board", "$1,000 value"],
  ["Warm Intros To Hiring Floors", "$800 value"],
  ["Call Recorder & A.I. Call Scoring", "$600 value"],
  ["Verified Closer Profile Builder", "$300 value"],
  ["Interview & Comp Negotiation Playbook", "$150 value"],
  ["24/7 Closer Community", "$150 value"],
];

export const SHARED_TILES: WhyTile[] = [
  {
    h: "Okay Is Enough To Start",
    p: "You don't need to be great yet. You need to be coachable and willing to get on the phone. Great comes after you're earning.",
  },
  {
    h: "No Experience Bar",
    p: "Most people we place came from doors, solar, insurance or retail. Nobody asks for a degree.",
  },
  {
    h: "One Cost, Up Front",
    p: "A software subscription. About what your phone costs. That's the only money involved.",
  },
];

export const STEPS: Array<{ n: string; h: string; p: string }> = [
  {
    n: "Step 1",
    h: "Get on the board",
    p: "We show you who's hiring, work out which seats will take someone at your level, and make the introduction.",
  },
  {
    n: "Step 2",
    h: "Learn to run the call",
    p: "Six weeks. Framework, objection handling, and reviews on recordings of your own calls.",
  },
  {
    n: "Step 3",
    h: "Get in, then get good",
    p: "Land the seat, start earning, keep taking reviews. Elite is something you become on the job, not before it.",
  },
];

export const GUARANTEE = {
  kick: "The only thing we guarantee",
  lead: "We can't promise you a seat. Anyone who does is lying to you.",
  body: "What we can promise is you get the exact training that's taken over 300 students to six figures and past it. Same program, same call reviews, same board. The reps are the part nobody can do for you.",
};

export const SHARED_FAQ = {
  first: {
    q: "What do I actually get?",
    a: "All seven items above. The six-week program, the board, the intros, the call recorder, the profile builder, the playbook and the community. Free. The one thing you pay for is a software subscription, and your coach sets it up on the call.",
  },
  third: {
    q: "How fast does a coach call me?",
    a: "Minutes, usually. A few hours if it's late where you are. If we miss you there's a button to book a time.",
  },
  fourth: {
    q: "Can you guarantee I'll get a seat?",
    a: "No, and be careful with anyone who says they can. What we guarantee is the training. It's the same program that's taken over 300 students to six figures. You still have to win the interview.",
  },
};

export const SCARCITY_LINE =
  "This will not be free forever. It goes back to $6,000 once the sponsored seats are gone.";

export const SEATS_LINE = { b: "Sponsored seats", rest: " · a few hundred, then it closes" };

export const DISCLAIMER =
  "Income disclaimer: results are not typical and are not a guarantee of earnings. Figures and student results are for illustration only. Building a sales career takes consistent work over time. This is educational and is not financial, legal or tax advice.";

export const MODAL = {
  title: "Claim Your Free Access",
  sub: "Fill this out and a coach calls you in minutes to get you set up.",
  consent:
    "I understand the training and the role board are free, and that I need one software subscription (about the cost of a phone bill) to use them.",
  submit: "Get Free Access",
  fine: "By submitting you agree to receive recurring automated texts from Sequ3nce at the number above about your access and onboarding. Consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to cancel, HELP for help.",
};
