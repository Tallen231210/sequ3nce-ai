// ============================================================================
// Setter Data — auto-generated panel insights.
//
// For each chart in the Setter Data dashboard, we compute a deterministic
// "so what" insight that names the specific peak/valley/anomaly visible in
// the data and prescribes one action. Same shape across every panel so the
// frontend renders them all with the shared InsightCard.
//
// All helpers in this file are pure functions — no `ctx`, no DB reads.
// They read data that's already been built by the host query and return a
// short `{ observation, recommendation }` pair (or null when below the
// per-panel sample-size gate).
//
// Tone: analyst. Declarative, specific, comparative. Always include the
// number that drives the call. No "consider"/"might"/"seems"/"could".
// ============================================================================

export interface PanelInsight {
  observation: string;
  recommendation: string;
}

// --- shared formatters --------------------------------------------------------

export function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

export function fmtMult(n: number): string {
  // 2.4× style — 1 decimal place, drop trailing .0
  if (!isFinite(n) || n <= 0) return "0×";
  const r = Math.round(n * 10) / 10;
  return r === Math.floor(r) ? `${Math.floor(r)}×` : `${r}×`;
}

export function fmtMins(ms: number): string {
  const mins = ms / 60000;
  if (mins < 1) return `< 1 min`;
  if (mins < 60) return `${Math.round(mins)} min`;
  const hours = mins / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function dayName(dayIdx: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIdx] ?? "?";
}

export function hourLabel(hour: number): string {
  // 12-hour format with am/pm, no zero-padding
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

export function hourRange(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
}

// ============================================================================
// 1. Best Time to Call Heatmap
// ============================================================================
//
// Input: a 7×24 grid of { dials, connects } cells. We name the highest-
// connect-rate cell with ≥ 5 dials, express vs team average, and append the
// worst qualifying cell if its connect rate is < 25% of average OR zero.

export interface HeatmapCellLike {
  day: number;       // 0=Sun..6=Sat
  hour: number;      // 0..23
  dials: number;
  connects: number;
}

const MIN_HEATMAP_TOTAL_DIALS = 50;
const MIN_HEATMAP_CELL_DIALS = 5;

export function computeHeatmapInsight(
  grid: HeatmapCellLike[],
  totalDials: number,
  totalConnects: number,
): PanelInsight | null {
  if (totalDials < MIN_HEATMAP_TOTAL_DIALS) return null;
  const qualified = grid.filter((c) => c.dials >= MIN_HEATMAP_CELL_DIALS);
  if (qualified.length < 2) return null;

  const teamAvg = totalConnects / totalDials; // fraction 0..1
  if (teamAvg <= 0) return null;

  const withRate = qualified.map((c) => ({
    ...c,
    rate: c.connects / c.dials,
  }));
  const peak = withRate.reduce((a, b) => (b.rate > a.rate ? b : a));
  const trough = withRate.reduce((a, b) => (b.rate < a.rate ? b : a));
  if (peak === trough) return null;

  const peakRatePct = peak.rate * 100;
  const peakMult = peak.rate / teamAvg;
  const peakLabel = `${dayName(peak.day)} ${hourRange(peak.hour)}`;
  const troughLabel = `${dayName(trough.day)} ${hourRange(trough.hour)}`;

  const troughWorthMentioning =
    trough.connects === 0 || trough.rate < teamAvg * 0.25;

  const obsParts = [
    `${peakLabel} is your strongest hour at ${fmtPct(peakRatePct)} connect rate — ${fmtMult(peakMult)} your team average.`,
  ];
  if (troughWorthMentioning) {
    obsParts.push(
      `${troughLabel} logged ${trough.dials} dials and ${trough.connects} connect${trough.connects === 1 ? "" : "s"} this range.`,
    );
  }
  const observation = obsParts.join(" ");

  const recommendation = troughWorthMentioning
    ? `Shift ${troughLabel} capacity into ${peakLabel}.`
    : `Schedule more outbound blocks in ${peakLabel}.`;

  return { observation, recommendation };
}

// ============================================================================
// 2. Dial Cadence (per setter)
// ============================================================================

export interface CadenceRowLike {
  name: string;
  leadsWithDials: number;
  avgDialsPerLead: number;
  pctLeadsThreeOrMoreAttempts: number | null; // 0..1 fraction
}

const MIN_CADENCE_LEADS = 10;

export function computeCadenceInsight(
  rows: CadenceRowLike[],
): PanelInsight | null {
  const qualified = rows.filter((r) => r.leadsWithDials >= MIN_CADENCE_LEADS);
  if (qualified.length < 2) return null;

  const top = qualified.reduce((a, b) =>
    b.avgDialsPerLead > a.avgDialsPerLead ? b : a,
  );
  const bottom = qualified.reduce((a, b) =>
    b.avgDialsPerLead < a.avgDialsPerLead ? b : a,
  );
  if (top.name === bottom.name) return null;
  if (top.avgDialsPerLead <= bottom.avgDialsPerLead) return null;

  const mult = top.avgDialsPerLead / Math.max(bottom.avgDialsPerLead, 0.1);
  const obsParts = [
    `${top.name} is your most persistent setter at ${top.avgDialsPerLead.toFixed(1)} dials/lead. ${bottom.name} averages ${bottom.avgDialsPerLead.toFixed(1)} (${fmtMult(mult)} lower).`,
  ];

  if (
    top.pctLeadsThreeOrMoreAttempts != null &&
    bottom.pctLeadsThreeOrMoreAttempts != null
  ) {
    const topPct = top.pctLeadsThreeOrMoreAttempts * 100;
    const bottomPct = bottom.pctLeadsThreeOrMoreAttempts * 100;
    const gapPp = topPct - bottomPct;
    if (gapPp > 30) {
      obsParts.push(
        `${top.name} pursues past attempt 2 on ${fmtPct(topPct)} of leads vs ${fmtPct(bottomPct)} for ${bottom.name}.`,
      );
    }
  }

  return {
    observation: obsParts.join(" "),
    recommendation: `Coach ${bottom.name} on dial persistence — pursuing leads past attempt 2 is where ${top.name}'s edge lives.`,
  };
}

// ============================================================================
// 3. Coverage Gap (single day)
// ============================================================================

export interface CoverageWindowLike {
  // human label like "Mon 7am–8am" or "7am–8am"; computed upstream
  label: string;
  medianFirstDialMs: number;
  leadsArrived: number;
}

const MIN_GAP_LEADS = 3;
const GAP_MULTIPLIER = 2;

export function computeCoverageGapInsight(
  windows: CoverageWindowLike[],
  baselineMedianMs: number,
): PanelInsight | null {
  if (baselineMedianMs <= 0) return null;
  const eligible = windows.filter(
    (w) =>
      w.leadsArrived >= MIN_GAP_LEADS &&
      w.medianFirstDialMs > baselineMedianMs * GAP_MULTIPLIER,
  );
  if (eligible.length === 0) return null;

  const worst = eligible.reduce((a, b) =>
    b.medianFirstDialMs > a.medianFirstDialMs ? b : a,
  );
  const mult = worst.medianFirstDialMs / baselineMedianMs;

  return {
    observation: `${worst.label} took ${fmtMins(worst.medianFirstDialMs)} median to first dial vs your ${fmtMins(baselineMedianMs)} baseline (${fmtMult(mult)} slower) — ${worst.leadsArrived} leads sat unattended.`,
    recommendation: `Cover ${worst.label} tomorrow.`,
  };
}

// ============================================================================
// 4. Lead Age Decay Curve
// ============================================================================

export interface DecayBucketLike {
  label: string;       // "<1m", "1-5m", "5-15m", ...
  leadCount: number;
  connectedCount: number;
  rate: number;        // 0..1
}

const MIN_DECAY_TOTAL = 50;
const MIN_DECAY_BUCKET = 10;
// Bucket labels whose combined sample we treat as the "instant" cohort.
// Derived from the DECAY_BUCKETS constant in setterData.ts.
const DECAY_INSTANT_LABELS = new Set(["<1m", "1-5m"]);

export function computeDecayInsight(
  buckets: DecayBucketLike[],
  totalLeads: number,
): PanelInsight | null {
  if (totalLeads < MIN_DECAY_TOTAL) return null;

  // Aggregate <1m and 1-5m into one "<5 min" cohort for the observation.
  const instantBuckets = buckets.filter((b) =>
    DECAY_INSTANT_LABELS.has(b.label),
  );
  const instantLeads = instantBuckets.reduce((s, b) => s + b.leadCount, 0);
  const instantConn = instantBuckets.reduce((s, b) => s + b.connectedCount, 0);
  if (instantLeads < MIN_DECAY_BUCKET) return null;
  const instantRate = instantConn / instantLeads;

  // Find the slowest qualifying non-instant bucket.
  const longerBuckets = buckets.filter(
    (b) => !DECAY_INSTANT_LABELS.has(b.label) && b.leadCount >= MIN_DECAY_BUCKET,
  );
  if (longerBuckets.length === 0) return null;
  const slow = longerBuckets.reduce((a, b) => (b.rate < a.rate ? b : a));

  const dropPp = Math.round((instantRate - slow.rate) * 100);
  if (dropPp < 10) return null;

  return {
    observation: `Leads dialed within 5 min connect at ${fmtPct(instantRate * 100)}. Leads dialed ${slow.label} after they came in drop to ${fmtPct(slow.rate * 100)} — a ${dropPp}pp drop across ${totalLeads} leads.`,
    recommendation: `Get the first dial in under 5 minutes — that's where your connect rate lives.`,
  };
}

// ============================================================================
// 5. Bookings
// ============================================================================

export interface BookingsInsightInput {
  total: number;
  byDayOfWeek: Array<{ day: number; count: number }>; // day = 0..6
  connectionsToBookingsRate: number | null; // 0..1 fraction
  perSetter: Array<{ name: string; bookings: number }>;
  // When the team's booking flow is self-book (Calendly etc), the
  // connections→bookings rate is meaningless — most prospects book
  // before any setter ever dials them. Suppress that line in that case.
  flowType?: string;
}

const MIN_BOOKINGS_TOTAL = 5;
const MIN_BOOKINGS_DAY = 3;

export function computeBookingsInsight(
  data: BookingsInsightInput,
): PanelInsight | null {
  if (data.total < MIN_BOOKINGS_TOTAL) return null;
  const qualifiedDays = data.byDayOfWeek.filter((d) => d.count >= MIN_BOOKINGS_DAY);
  if (qualifiedDays.length === 0) return null;

  const bestDay = qualifiedDays.reduce((a, b) => (b.count > a.count ? b : a));
  const sharePct = (bestDay.count / data.total) * 100;

  const obsParts = [
    `${dayName(bestDay.day)} is your strongest booking day with ${bestDay.count} booking${bestDay.count === 1 ? "" : "s"} (${fmtPct(sharePct)} of the range's bookings).`,
  ];
  if (
    data.connectionsToBookingsRate != null &&
    data.connectionsToBookingsRate > 0 &&
    data.flowType !== "self_book"
  ) {
    obsParts.push(
      `You convert ${fmtPct(data.connectionsToBookingsRate * 100)} of connections into bookings.`,
    );
  }

  // Per-setter outlier check
  let recommendation = `Lean inbound coverage into ${dayName(bestDay.day)}.`;
  if (data.perSetter.length >= 2) {
    const sortedSetters = [...data.perSetter].sort(
      (a, b) => b.bookings - a.bookings,
    );
    const median =
      sortedSetters[Math.floor(sortedSetters.length / 2)].bookings;
    const top = sortedSetters[0];
    if (median > 0 && top.bookings > median * 2 && top.bookings >= 3) {
      recommendation = `Have ${top.name} run more inbound coverage on ${dayName(bestDay.day)}.`;
    }
  }

  return { observation: obsParts.join(" "), recommendation };
}

// ============================================================================
// 6. Funnel Chart (lead → connect → appointment → show)
// ============================================================================

export interface FunnelInsightInput {
  totalLeads: number;
  connectedLeads: number;
  totalAppointments: number;
  totalShowed: number;
  // FunnelChart swaps the third stage to "Bookings" when the bookings
  // computation has data (calendarEvents- or setterAppointments-based).
  // We mirror that swap so the insight matches what the chart shows.
  bookingsThirdStage?: { count: number } | null;
  // True iff the team actually tracks show outcomes (via setterAppointments
  // status field — bookings sourced from calendarEvents have no show data).
  // When false, the bookings → shows "100% drop" is an untracked-data
  // artifact, not a real leak. We skip surfacing it.
  showsTracked?: boolean;
}

const MIN_FUNNEL_LEADS = 20;

export function computeFunnelInsight(
  data: FunnelInsightInput,
): PanelInsight | null {
  if (data.totalLeads < MIN_FUNNEL_LEADS) return null;

  const useBookings =
    data.bookingsThirdStage != null && data.bookingsThirdStage.count > 0;
  const thirdStageLabel = useBookings ? "Bookings" : "Appointments";
  const thirdStageCount = useBookings
    ? data.bookingsThirdStage!.count
    : data.totalAppointments;

  const stages = [
    {
      from: "Leads",
      to: "connects",
      lostCount: data.totalLeads - data.connectedLeads,
      droppedPct:
        data.totalLeads > 0
          ? ((data.totalLeads - data.connectedLeads) / data.totalLeads) * 100
          : 0,
      key: "lead-connect" as const,
    },
    {
      from: "Connects",
      to: useBookings ? "bookings" : "appointments",
      lostCount: Math.max(0, data.connectedLeads - thirdStageCount),
      droppedPct:
        data.connectedLeads > 0 && data.connectedLeads >= thirdStageCount
          ? ((data.connectedLeads - thirdStageCount) / data.connectedLeads) *
            100
          : 0,
      key: "connect-thirdStage" as const,
    },
    {
      from: thirdStageLabel,
      to: "shows",
      // Skip this stage entirely when the team doesn't track shows —
      // a "100% drop" is untracked data, not a real leak.
      lostCount:
        data.showsTracked === false
          ? 0
          : Math.max(0, thirdStageCount - data.totalShowed),
      droppedPct:
        data.showsTracked === false
          ? 0
          : thirdStageCount > 0 && thirdStageCount >= data.totalShowed
            ? ((thirdStageCount - data.totalShowed) / thirdStageCount) * 100
            : 0,
      key: "thirdStage-show" as const,
    },
  ].filter((s) => s.lostCount > 0);

  if (stages.length === 0) return null;
  const worst = stages.reduce((a, b) => (b.droppedPct > a.droppedPct ? b : a));
  if (worst.droppedPct < 20) return null;
  // Suppress leaks where the "lost" count actually reflects no tracking,
  // not a real drop — e.g. for self-book teams who don't book appointments
  // through GHL, totalAppointments = 0 isn't a funnel leak, it's an
  // unconfigured field. We've already handled this by swapping to bookings,
  // but as belt-and-suspenders: when the third-stage count is 0 entirely,
  // skip the "connect → thirdStage" leak rec because the data isn't there.
  if (
    worst.key === "connect-thirdStage" &&
    thirdStageCount === 0
  ) {
    return null;
  }

  const recMap: Record<typeof worst.key, string> = {
    "lead-connect":
      "Most leads never get a connect — push speed-to-lead and dial persistence.",
    "connect-thirdStage": useBookings
      ? "The lead is on the phone but not booking — review your discovery framework."
      : "The lead is on the phone but not booking — review your discovery framework.",
    "thirdStage-show":
      "Most prospects book but don't show — tighten your reminder cadence.",
  };

  return {
    observation: `Your biggest funnel leak is ${worst.from} → ${worst.to}: ${fmtPct(worst.droppedPct)} drop (${worst.lostCount} leads lost).`,
    recommendation: recMap[worst.key],
  };
}

// ============================================================================
// 7. Hyros Ad Sources (per-ad close rate spread)
// ============================================================================

export interface AdRowInsightLike {
  name: string;
  count: number;
  matchedCount?: number;
  closedCount?: number;
  topObjection?: { name: string; count: number };
}

const MIN_HYROS_ATTRIBUTED = 10;
const MIN_HYROS_AD_MATCHED = 5;

export function computeHyrosAdSourcesInsight(
  attributedCount: number,
  allAds: AdRowInsightLike[],
): PanelInsight | null {
  if (attributedCount < MIN_HYROS_ATTRIBUTED) return null;
  const qualified = allAds.filter(
    (a) =>
      a.matchedCount != null &&
      a.matchedCount >= MIN_HYROS_AD_MATCHED &&
      a.closedCount != null,
  );
  if (qualified.length < 2) return null;

  const withRate = qualified.map((a) => ({
    ...a,
    rate: (a.closedCount! / a.matchedCount!) * 100,
  }));
  const best = withRate.reduce((a, b) => (b.rate > a.rate ? b : a));
  const worst = withRate.reduce((a, b) => (b.rate < a.rate ? b : a));
  if (best.name === worst.name) return null;

  const spreadPp = Math.round(best.rate - worst.rate);
  if (spreadPp < 10) return null;

  const obsParts = [
    `${best.name} closes at ${fmtPct(best.rate)} (${best.closedCount}/${best.matchedCount} called). ${worst.name} closes at ${fmtPct(worst.rate)} (${worst.closedCount}/${worst.matchedCount}). Spread: ${spreadPp}pp.`,
  ];
  if (worst.topObjection) {
    obsParts.push(
      `Top lost-reason on ${worst.name}: ${worst.topObjection.name}.`,
    );
  }

  return {
    observation: obsParts.join(" "),
    recommendation: `Scale ${best.name}. ${worst.name} either has bad lead quality or the wrong creative — pause it while you rework the offer.`,
  };
}

// ============================================================================
// 8. Routing Performance (closer × ad routing matrix)
// ============================================================================

export interface RoutingRowInsightLike {
  adName: string;
  matchedTotal: number;
  bestCloser?: { name: string; closeRate?: number };
  worstCloser?: { name: string; closeRate?: number };
  closerSpreadPp?: number;
  bestSetter?: { name: string; showRate?: number };
  worstSetter?: { name: string; showRate?: number };
  setterSpreadPp?: number;
}

const MIN_ROUTING_SPREAD_PP = 20;

export function computeRoutingInsight(
  rows: RoutingRowInsightLike[],
): PanelInsight | null {
  const eligible = rows.filter(
    (r) =>
      (r.closerSpreadPp != null && r.closerSpreadPp >= MIN_ROUTING_SPREAD_PP) ||
      (r.setterSpreadPp != null && r.setterSpreadPp >= MIN_ROUTING_SPREAD_PP),
  );
  if (eligible.length === 0) return null;

  // Pick the row with the largest spread (prefer closer-side as the more
  // direct routing lever).
  const sorted = [...eligible].sort((a, b) => {
    const aSpread = Math.max(a.closerSpreadPp ?? 0, a.setterSpreadPp ?? 0);
    const bSpread = Math.max(b.closerSpreadPp ?? 0, b.setterSpreadPp ?? 0);
    return bSpread - aSpread;
  });
  const row = sorted[0];

  const obsParts: string[] = [];
  let recommendation = "";

  if (
    row.closerSpreadPp != null &&
    row.closerSpreadPp >= MIN_ROUTING_SPREAD_PP &&
    row.bestCloser &&
    row.worstCloser
  ) {
    obsParts.push(
      `On ${row.adName}, ${row.bestCloser.name} closes at ${fmtPct(row.bestCloser.closeRate ?? 0)} while ${row.worstCloser.name} closes at ${fmtPct(row.worstCloser.closeRate ?? 0)} — a ${row.closerSpreadPp}pp spread on ${row.matchedTotal} matched calls.`,
    );
    recommendation = `Route ${row.adName} leads to ${row.bestCloser.name}. Coach ${row.worstCloser.name} on this lead type or take them off the rotation.`;
  }

  if (
    row.setterSpreadPp != null &&
    row.setterSpreadPp >= MIN_ROUTING_SPREAD_PP &&
    row.bestSetter &&
    row.worstSetter
  ) {
    obsParts.push(
      `On the setter side, ${row.bestSetter.name} books shows at ${fmtPct(row.bestSetter.showRate ?? 0)} vs ${row.worstSetter.name}'s ${fmtPct(row.worstSetter.showRate ?? 0)} on the same ad.`,
    );
    if (!recommendation) {
      recommendation = `Route ${row.adName} qualifying through ${row.bestSetter.name}.`;
    }
  }

  if (obsParts.length === 0) return null;
  return { observation: obsParts.join(" "), recommendation };
}
