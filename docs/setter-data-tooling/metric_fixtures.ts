// Fixture tests for the metric shapes.
//
// The whole bet of this rebuild is that a fixed library can be tested properly
// where per-business generated calculations could not. This is that test.
//
// Lives outside the repo and runs via `npx tsx` so it adds no dependency to the
// project. The modules under test were written with no runtime imports beyond
// each other, which is what makes this possible.

import {
  computeCount,
  computeRatio,
  computeDistribution,
  firstTouchPerLead,
  type MetricEvent,
  type MetricLead,
} from "/Users/tylerallen/Desktop/sequ3nce-ai/apps/web/convex/setterMetricCompute";
import {
  legacyFunnel,
  elapsedWorkingMs,
  countsChannel,
  isSetter,
} from "/Users/tylerallen/Desktop/sequ3nce-ai/apps/web/convex/setterFunnelResolve";
import {
  gate,
  METRICS,
  availableMetrics,
  explainBlocked,
} from "/Users/tylerallen/Desktop/sequ3nce-ai/apps/web/convex/setterMetricLibrary";
import { validateBindings } from "/Users/tylerallen/Desktop/sequ3nce-ai/apps/web/convex/setterFunnelTypes";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  pass  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
  }
}

const HOUR = 3_600_000;
const MON_9AM = Date.UTC(2026, 7, 10, 9, 0, 0); // Monday
const FRI_11PM = Date.UTC(2026, 7, 14, 23, 0, 0);

console.log("\n--- count ---");
{
  const events: MetricEvent[] = [
    { leadId: "a", setterId: "s1", occurredAt: 1, channel: "call", kind: "outbound" },
    { leadId: "b", setterId: "s1", occurredAt: 2, channel: "call", kind: "outbound" },
    { leadId: "c", setterId: "s2", occurredAt: 3, channel: "sms", kind: "outbound" },
    { leadId: "d", setterId: null, occurredAt: 4, channel: "call", kind: "outbound" },
  ];
  const r = computeCount(events);
  check("counts per setter", r.bySetter.s1 === 2 && r.bySetter.s2 === 1);
  check("unattributed kept separate, not dropped", r.unattributed === 1);
  check("coverage reported", r.coverage.total === 4 && r.coverage.attributed === 3);
  check("coverage ratio correct", Math.abs(r.coverage.ratio - 0.75) < 1e-9);
}

console.log("\n--- the power-dialer case (pilot org shape) ---");
{
  // 1.3% attributed, mirroring 1,900 human dials against 149,061 automated.
  const events: MetricEvent[] = [];
  for (let i = 0; i < 1000; i++)
    events.push({ leadId: `l${i}`, setterId: null, occurredAt: i, channel: "call", kind: "outbound" });
  for (let i = 0; i < 13; i++)
    events.push({ leadId: `h${i}`, setterId: "human", occurredAt: i, channel: "call", kind: "outbound" });
  const r = computeCount(events);
  check("per-setter total is the human count only", r.bySetter.human === 13);
  check("the 1000 automated dials are visible, not silently dropped", r.unattributed === 1000);
  check("coverage screams quietly", r.coverage.ratio < 0.02, `ratio=${r.coverage.ratio}`);
}

console.log("\n--- ratio ---");
{
  const leads: MetricLead[] = [
    { leadId: "a", arrivedAt: 0, ownerId: "s1" },
    { leadId: "b", arrivedAt: 0, ownerId: "s1" },
    { leadId: "c", arrivedAt: 0, ownerId: "s2" },
    { leadId: "d", arrivedAt: 0, ownerId: null },
  ];
  const r = computeRatio(leads, new Set(["a", "c"]));
  check("overall ratio", r.numerator === 2 && r.denominator === 4 && r.value === 0.5);
  check("per setter", r.bySetter.s1.value === 0.5 && r.bySetter.s2.value === 1);
  check("unowned lead still in the denominator", r.coverage.attributed === 3);

  const empty = computeRatio([], new Set());
  check("empty denominator is null, not 0%", empty.value === null);
}

console.log("\n--- distribution ---");
{
  const f = legacyFunnel(null);
  const pairs = [1, 2, 3, 4, 100].map((mins, i) => ({
    leadId: `l${i}`,
    startMs: MON_9AM,
    endMs: MON_9AM + mins * 60_000,
    setterId: "s1",
  }));
  const r = computeDistribution(pairs, f);
  check("median is a real observed value", r.medianMs === 3 * 60_000, `got ${r.medianMs}`);
  check("p90 catches the tail the mean hides", r.p90Ms === 100 * 60_000, `got ${r.p90Ms}`);
  check("mean differs from median (why we show both)", r.meanMs !== r.medianMs);
  check("worst lead surfaced for follow-up", r.worst[0].valueMs === 100 * 60_000);

  const skew = computeDistribution(
    [{ leadId: "x", startMs: 5000, endMs: 1000, setterId: null }],
    f,
  );
  check("negative interval discarded, not counted as 0", skew.count === 0);
}

console.log("\n--- business hours ---");
{
  const none = elapsedWorkingMs(FRI_11PM, FRI_11PM + 58 * HOUR, null);
  check("no hours configured = plain elapsed (today's behaviour)", none === 58 * HOUR);

  const hours = { timezone: "UTC", days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18 };
  const worked = elapsedWorkingMs(FRI_11PM, FRI_11PM + 58 * HOUR, hours);
  check(
    "Friday 11pm -> Monday morning is not a 58-hour failure",
    worked < 3 * HOUR,
    `got ${(worked / HOUR).toFixed(1)}h`,
  );
  check("weekend contributes nothing", worked >= 0);
}

console.log("\n--- first touch respects the funnel's channels ---");
{
  const leads: MetricLead[] = [{ leadId: "a", arrivedAt: MON_9AM, ownerId: "s1" }];
  const events: MetricEvent[] = [
    // An automated welcome text one minute in, then a real dial an hour later.
    { leadId: "a", setterId: null, occurredAt: MON_9AM + 60_000, channel: "sms", kind: "outbound" },
    { leadId: "a", setterId: "s1", occurredAt: MON_9AM + HOUR, channel: "call", kind: "outbound" },
  ];

  const callOnly = firstTouchPerLead(leads, events, (c) => c === "call");
  check(
    "a dial-speed business is not credited with the automation's text",
    callOnly[0].endMs === MON_9AM + HOUR,
  );

  const anyChannel = firstTouchPerLead(leads, events, () => true);
  check("a text-speed business gets the text", anyChannel[0].endMs === MON_9AM + 60_000);

  const untouched = firstTouchPerLead(
    [{ leadId: "z", arrivedAt: MON_9AM, ownerId: "s1" }],
    [],
    () => true,
  );
  check("never-touched lead excluded from speed (belongs to contact rate)", untouched.length === 0);
}

console.log("\n--- gating: no binding, no metric ---");
{
  const f = legacyFunnel(null);
  const speed = METRICS.find((m) => m.id === "speed_to_lead_working")!;
  check("legacy funnel supports speed to lead", gate(speed, f).ok);

  const dmFunnel = {
    ...f,
    bindings: {
      ...f.bindings,
      setterTouch: { ...f.bindings.setterTouch, params: { channels: ["dm"] } },
    },
  } as typeof f;
  const g = gate(speed, dmFunnel);
  check("DM-only business is blocked, not shown zero", !g.ok);
  check("and the reason names our gap, not theirs", g.unreadable.length === 1 && g.missing.length === 0);

  const setRate = METRICS.find((m) => m.id === "set_rate")!;
  // The legacy funnel DOES declare meetingBooked — the product has computed
  // bookings for every team all along, and omitting it blocked set rate on
  // teams that had booking data the whole time. So the condition to test is a
  // funnel that genuinely lacks it, not the default one.
  check("set rate available when bookings are known", gate(setRate, f).ok);
  const noBookings: any = {
    ...f,
    bindings: { ...f.bindings, meetingBooked: undefined },
  };
  check("set rate blocked when bookings are not known", !gate(setRate, noBookings).ok);
  check(
    "and it says so without inventing a fix",
    explainBlocked(gate(setRate, noBookings), false).includes("needs a decision from you"),
  );

  const selfBook = { ...f, legacyFlowType: "self_book" } as typeof f;
  const avail = availableMetrics(selfBook);
  check(
    "self-book funnel suppresses set rate (preserved from the old code)",
    avail.blocked.some((b) => b.metric.id === "set_rate" && b.suppressed),
  );
}

console.log("\n--- validation rejects rather than repairs ---");
{
  const good = validateBindings(legacyFunnel(null).bindings);
  check("legacy bindings are valid", good.ok, good.errors.join("; "));

  const invented = validateBindings({
    ...legacyFunnel(null).bindings,
    leadArrived: { kind: "whatever_the_model_said", source: "detected", evidenceCount: 5 },
  });
  check("an invented rule is rejected", !invented.ok);

  const fromNothing = validateBindings({
    ...legacyFunnel(null).bindings,
    leadArrived: { kind: "crm_contact_created", source: "detected", evidenceCount: 0 },
  });
  check("detected-from-zero-records is rejected", !fromNothing.ok);

  const dmWarn = validateBindings({
    ...legacyFunnel(null).bindings,
    setterTouch: {
      kind: "outbound_attempt",
      source: "manual",
      evidenceCount: 3,
      params: { channels: ["dm"] },
    },
  });
  check(
    "a DM channel is allowed but warns it will be empty",
    dmWarn.ok && dmWarn.warnings.some((w) => w.includes("dm")),
  );
}

console.log("\n--- the setter roster ---");
{
  const base = legacyFunnel(null).bindings;

  const wideOpen = validateBindings(base);
  check(
    "no roster set warns that everyone counts as a setter",
    wideOpen.ok && wideOpen.warnings.some((w) => w.includes("Every CRM user")),
  );

  const emptyList = validateBindings({
    ...base,
    setterRoster: { kind: "explicit_list", source: "manual", evidenceCount: 1, params: { userIds: [] } },
  });
  check("an empty explicit list is rejected", !emptyList.ok);

  const named = validateBindings({
    ...base,
    setterRoster: {
      kind: "explicit_list",
      source: "confirmed",
      evidenceCount: 2,
      params: { userIds: ["jayden", "brayden"] },
    },
  });
  check("naming the setters is valid and stops warning", named.ok && named.warnings.length === 0);

  // The real shape: a manager and a support account touching leads alongside
  // two setters. Only the setters should count as setter activity.
  const f = legacyFunnel(null);
  const rostered = {
    ...f,
    bindings: {
      ...f.bindings,
      setterRoster: {
        kind: "explicit_list",
        source: "confirmed",
        evidenceCount: 2,
        params: { userIds: ["jayden", "brayden"] },
      },
    },
  } as any;

  check("a named setter counts", isSetter(rostered, "jayden"));
  check("the manager does not", !isSetter(rostered, "gianni"));
  check("automation is never a setter", !isSetter(rostered, null));
  check("with no roster, everyone counts (today's behaviour)", isSetter(f, "gianni"));
}

console.log("\n--- the two speed metrics measure the same touches, different clocks ---");
{
  const f = legacyFunnel(null);
  const hours = { timezone: "UTC", days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 };
  // A lead arriving Friday evening, dialled Monday morning.
  const pairs = [{ leadId: "a", startMs: FRI_11PM, endMs: FRI_11PM + 58 * HOUR, setterId: "s1" }];

  const elapsed = computeDistribution(pairs, { ...f, businessHours: null });
  const working = computeDistribution(pairs, { ...f, businessHours: hours });

  check("both count the same lead", elapsed.count === 1 && working.count === 1);
  check("around the clock reports the full wait", elapsed.medianMs === 58 * HOUR);
  check(
    "working hours reports far less",
    working.medianMs !== null && working.medianMs < elapsed.medianMs / 10,
    `working=${working.medianMs} elapsed=${elapsed.medianMs}`,
  );
  // Zero is the CORRECT answer here and worth pinning down: the lead sat
  // overnight and was dialled the moment the working day opened, so no working
  // time elapsed. Not penalising a team for being asleep is the entire reason
  // this metric exists. The first version of this test asserted > 0 and was
  // wrong about the semantics, not about the code.
  check("dialled the instant work started = no working-hours wait", working.medianMs === 0);

  const intoTheDay = computeDistribution(
    [{ leadId: "b", startMs: FRI_11PM, endMs: FRI_11PM + 60 * HOUR, setterId: "s1" }],
    { ...f, businessHours: hours },
  );
  check(
    "two hours into Monday counts as two hours, not the whole weekend",
    intoTheDay.medianMs === 2 * HOUR,
    `got ${(intoTheDay.medianMs ?? 0) / HOUR}h`,
  );

  const bothIds = ["speed_to_lead_working", "speed_to_lead_elapsed"];
  check(
    "both are in the catalogue and both gate the same way",
    bothIds.every((id) => {
      const m = METRICS.find((x) => x.id === id);
      return m && gate(m, f).ok;
    }),
  );
}

console.log("\n--- determinism ---");
{
  const f = legacyFunnel(null);
  const pairs = Array.from({ length: 50 }, (_, i) => ({
    leadId: `l${i}`,
    startMs: MON_9AM,
    endMs: MON_9AM + (i % 7) * 60_000,
    setterId: i % 3 === 0 ? null : `s${i % 3}`,
  }));
  const a = JSON.stringify(computeDistribution(pairs, f));
  const b = JSON.stringify(computeDistribution(pairs, f));
  check("same rows twice = identical result", a === b);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
