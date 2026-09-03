import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

const MAX_TITLE = 200;
const MAX_COMPANY = 100;
const MAX_LOCATION = 100;
const MAX_SALARY = 100;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 500;

const VALID_INDUSTRIES = [
  "Solar", "Insurance", "Real Estate", "SaaS", "Coaching",
  "Agency", "Info Products", "E-Commerce", "Financial Services",
  "Health", // Added May 2026 — VA-scraped job batch surfaced this category
  "Other",
];

function isFounder(user: any): boolean {
  const badges = user?.badges as string[] | undefined;
  return !!badges?.includes("founder") || !!badges?.includes("admin");
}

// ==================== Admin Mutations (Founder Only) ====================

/** Add a public job listing. Founder only. */
export const addJob = mutation({
  args: {
    userId: v.id("b2cUsers"),
    companyName: v.string(),
    title: v.string(),
    location: v.string(),
    salaryRange: v.optional(v.string()),
    industry: v.string(),
    description: v.optional(v.string()),
    applyUrl: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can add jobs");

    const company = args.companyName.trim();
    const title = args.title.trim();
    const location = args.location.trim();
    const applyUrl = args.applyUrl.trim();

    if (!company || company.length > MAX_COMPANY) throw new Error("Company name required (max 100 chars)");
    if (!title || title.length > MAX_TITLE) throw new Error("Job title required (max 200 chars)");
    if (!location || location.length > MAX_LOCATION) throw new Error("Location required (max 100 chars)");
    if (!applyUrl || !applyUrl.startsWith("https://")) throw new Error("Apply URL must start with https://");
    if (applyUrl.length > MAX_URL) throw new Error("URL too long (max 500 chars)");
    if (!VALID_INDUSTRIES.includes(args.industry)) throw new Error("Invalid industry");
    if (args.description && args.description.length > MAX_DESCRIPTION) throw new Error("Description too long (max 2000 chars)");
    if (args.salaryRange && args.salaryRange.length > MAX_SALARY) throw new Error("Salary range too long (max 100 chars)");

    const now = Date.now();
    const id = await ctx.db.insert("b2cPublicJobs", {
      companyName: company,
      title,
      location,
      salaryRange: args.salaryRange?.trim() || undefined,
      industry: args.industry,
      description: args.description?.trim() || undefined,
      applyUrl,
      source: args.source?.trim() || undefined,
      addedBy: args.userId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Bulk-import a batch of pre-validated jobs. Founder-only. Used by the
 * Node import script in apps/web/scripts/import-jobs.mjs after it parses
 * a CSV from the VA's Google Sheet. Per-job validation mirrors addJob —
 * we don't trust the script-side parser to have caught everything.
 *
 * Idempotency: dedupes by applyUrl. If a row's URL already exists in
 * setterPublicJobs, we skip it and increment `skipped`. Re-running the
 * importer on the same CSV is safe.
 *
 * Atomicity: all rows are written in a single Convex mutation, so
 * either the whole batch lands or none of it does. The script chunks
 * batches of 100 to stay under Convex's per-mutation write limits.
 */
export const addJobsBulk = mutation({
  args: {
    founderUserId: v.id("b2cUsers"),
    jobs: v.array(
      v.object({
        companyName: v.string(),
        title: v.string(),
        location: v.string(),
        salaryRange: v.optional(v.string()),
        industry: v.string(),
        description: v.optional(v.string()),
        applyUrl: v.string(),
        source: v.optional(v.string()),
        remote: v.optional(v.boolean()),
        jobType: v.optional(v.string()),
        experienceLevel: v.optional(v.string()),
        datePosted: v.optional(v.number()),
        highTicket: v.optional(v.boolean()),
        vipOnly: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    inserted: number;
    skipped: number;
    errors: Array<{ row: number; companyName: string; message: string }>;
  }> => {
    const user = await ctx.db.get(args.founderUserId);
    if (!user || !isFounder(user)) {
      throw new Error("Only founders can bulk-import jobs");
    }

    // Pre-fetch existing applyUrls so dedup is O(N) per batch instead of
    // O(N) per-row. The active-jobs index already exists, but this dedup
    // path also catches closed rows so an inadvertently-closed-and-then-
    // re-imported job still gets skipped.
    const allExisting = await ctx.db.query("b2cPublicJobs").collect();
    const existingUrls = new Set(allExisting.map((j) => j.applyUrl));

    const errors: Array<{ row: number; companyName: string; message: string }> = [];
    let inserted = 0;
    let skipped = 0;
    const now = Date.now();

    for (let i = 0; i < args.jobs.length; i++) {
      const j = args.jobs[i];
      const company = j.companyName.trim();
      const title = j.title.trim();
      const location = j.location.trim();
      const applyUrl = j.applyUrl.trim();

      try {
        // Same validators as addJob — script may pass invalid data even
        // after its own pre-checks. We're the last line of defense.
        if (!company || company.length > MAX_COMPANY) throw new Error(`Company name required (max ${MAX_COMPANY} chars)`);
        if (!title || title.length > MAX_TITLE) throw new Error(`Job title required (max ${MAX_TITLE} chars)`);
        if (!location || location.length > MAX_LOCATION) throw new Error(`Location required (max ${MAX_LOCATION} chars)`);
        if (!applyUrl || !applyUrl.startsWith("https://")) throw new Error("Apply URL must start with https://");
        if (applyUrl.length > MAX_URL) throw new Error(`URL too long (max ${MAX_URL} chars)`);
        if (!VALID_INDUSTRIES.includes(j.industry)) throw new Error(`Invalid industry: ${j.industry}`);
        if (j.description && j.description.length > MAX_DESCRIPTION) throw new Error(`Description too long (max ${MAX_DESCRIPTION} chars)`);
        if (j.salaryRange && j.salaryRange.length > MAX_SALARY) throw new Error(`Salary range too long (max ${MAX_SALARY} chars)`);

        if (existingUrls.has(applyUrl)) {
          skipped++;
          continue;
        }

        await ctx.db.insert("b2cPublicJobs", {
          companyName: company,
          title,
          location,
          salaryRange: j.salaryRange?.trim() || undefined,
          industry: j.industry,
          description: j.description?.trim() || undefined,
          applyUrl,
          source: j.source?.trim() || undefined,
          addedBy: args.founderUserId,
          status: "active",
          remote: j.remote,
          jobType: j.jobType?.trim() || undefined,
          experienceLevel: j.experienceLevel?.trim() || undefined,
          datePosted: j.datePosted,
          highTicket: j.highTicket,
          createdAt: now,
          updatedAt: now,
        });

        existingUrls.add(applyUrl); // Within-batch dedup — same URL twice = first wins
        inserted++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ row: i, companyName: company || "(unknown)", message });
      }
    }

    return { inserted, skipped, errors };
  },
});

/** Edit a public job listing. Founder only. */
export const editJob = mutation({
  args: {
    userId: v.id("b2cUsers"),
    jobId: v.id("b2cPublicJobs"),
    companyName: v.optional(v.string()),
    title: v.optional(v.string()),
    location: v.optional(v.string()),
    salaryRange: v.optional(v.string()),
    industry: v.optional(v.string()),
    description: v.optional(v.string()),
    applyUrl: v.optional(v.string()),
    source: v.optional(v.string()),
    highTicket: v.optional(v.boolean()),
    vipOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can edit jobs");

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.companyName !== undefined) patch.companyName = args.companyName.trim();
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.location !== undefined) patch.location = args.location.trim();
    if (args.salaryRange !== undefined) patch.salaryRange = args.salaryRange.trim() || undefined;
    if (args.industry !== undefined) {
      if (!VALID_INDUSTRIES.includes(args.industry)) throw new Error("Invalid industry");
      patch.industry = args.industry;
    }
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.applyUrl !== undefined) {
      const url = args.applyUrl.trim();
      if (!url.startsWith("https://")) throw new Error("Apply URL must start with https://");
      patch.applyUrl = url;
    }
    if (args.source !== undefined) patch.source = args.source.trim() || undefined;
    if (args.highTicket !== undefined) patch.highTicket = args.highTicket;
    if (args.vipOnly !== undefined) patch.vipOnly = args.vipOnly;

    await ctx.db.patch(args.jobId, patch);
    return { success: true };
  },
});

/** Close a job listing. Founder only. */
export const closeJob = mutation({
  args: { userId: v.id("b2cUsers"), jobId: v.id("b2cPublicJobs") },
  handler: async (ctx, { userId, jobId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can close jobs");
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    await ctx.db.patch(jobId, { status: "closed", updatedAt: Date.now() });
    return { success: true };
  },
});

/** Delete a job listing permanently. Founder only. */
export const deleteJob = mutation({
  args: { userId: v.id("b2cUsers"), jobId: v.id("b2cPublicJobs") },
  handler: async (ctx, { userId, jobId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !isFounder(user)) throw new Error("Only founders can delete jobs");
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    // Also delete all tracking records for this job
    const tracking = await ctx.db
      .query("b2cPublicJobTracking")
      .filter((q) => q.eq(q.field("jobId"), jobId))
      .collect();
    for (const t of tracking) await ctx.db.delete(t._id);
    await ctx.db.delete(jobId);
    return { success: true };
  },
});

// ==================== User Mutations ====================

/** Update tracking (saved/applied/interviewed) for a job. Upserts. */
export const updateTracking = mutation({
  args: {
    userId: v.id("b2cUsers"),
    jobId: v.id("b2cPublicJobs"),
    saved: v.optional(v.boolean()),
    applied: v.optional(v.boolean()),
    interviewed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("b2cPublicJobTracking")
      .withIndex("by_user_job", (q) => q.eq("userId", args.userId).eq("jobId", args.jobId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (args.saved !== undefined) patch.saved = args.saved;
      if (args.applied !== undefined) patch.applied = args.applied;
      if (args.interviewed !== undefined) patch.interviewed = args.interviewed;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const id = await ctx.db.insert("b2cPublicJobTracking", {
      jobId: args.jobId,
      userId: args.userId,
      saved: args.saved ?? false,
      applied: args.applied ?? false,
      interviewed: args.interviewed ?? false,
      updatedAt: Date.now(),
    });
    return id;
  },
});

const FREEHIRE_BRIDGE_LANES = [
  "sales",
  "closer",
  "account-executive",
  "high-ticket",
  "leadership",
] as const;
const FREEHIRE_BRIDGE_WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const FREEHIRE_BRIDGE_MIN_SALARIES = [75000, 100000, 150000, 200000] as const;
const LEGACY_COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const legacyRegionNames = new Intl.DisplayNames(["en"], { type: "region" });
const LEGACY_COUNTRY_NAMES = LEGACY_COUNTRY_CODES.map((code) => ({
  code,
  name: normalizeLegacyWords(legacyRegionNames.of(code) ?? ""),
})).filter(({ name }) => name.length > 2);
const LEGACY_COUNTRY_ALIASES: Record<string, string[]> = {
  US: ["us", "u s", "usa", "u s a", "united states", "united states of america"],
  GB: ["uk", "u k", "united kingdom", "great britain", "england", "scotland", "wales"],
  AE: ["uae", "u a e", "united arab emirates"],
  KR: ["south korea", "republic of korea"],
  TR: ["turkey", "turkiye"],
  TW: ["taiwan"],
};

function normalizeLegacyWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasLegacyPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}

function inferLegacyCountry(location: string): string | null {
  const normalized = normalizeLegacyWords(location);
  if (!normalized || /^(remote|worldwide|global|anywhere)$/.test(normalized)) return null;
  for (const [code, aliases] of Object.entries(LEGACY_COUNTRY_ALIASES)) {
    if (aliases.some((alias) => hasLegacyPhrase(normalized, alias))) return code;
  }
  const matched = LEGACY_COUNTRY_NAMES.find(({ name }) => hasLegacyPhrase(normalized, name));
  return matched?.code ?? null;
}

function legacySalaryFloor(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(?:\$|usd\s*)?\s*(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!match) return null;
  const amount = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function legacyPostedTimestamp(job: { datePosted?: number }): number | null {
  const timestamp = Number(job.datePosted);
  const earliestReasonable = Date.UTC(2000, 0, 1);
  const latestReasonable = Date.now() + 24 * 60 * 60 * 1000;
  return Number.isFinite(timestamp) && timestamp >= earliestReasonable && timestamp <= latestReasonable
    ? timestamp
    : null;
}

function legacyJobLane(job: { title: string; description?: string; highTicket?: boolean }): typeof FREEHIRE_BRIDGE_LANES[number] {
  const title = normalizeLegacyWords(job.title);
  const searchable = normalizeLegacyWords(`${job.title} ${job.description ?? ""}`);
  if (job.highTicket === true || hasLegacyPhrase(searchable, "high ticket")) return "high-ticket";
  if (hasLegacyPhrase(title, "closer") || hasLegacyPhrase(title, "closing")) return "closer";
  if (hasLegacyPhrase(title, "account executive")) return "account-executive";
  if (hasLegacyPhrase(title, "sales manager")) return "leadership";
  return "sales";
}

/**
 * Customer-facing source label. The scraper's raw values include wrappers
 * like "SerpJob (Monster)" and the odd column slip ("true", "Remote");
 * FreeHire cards show plain names ("Greenhouse"), so match that.
 */
function cleanLegacySource(raw: string | undefined): string {
  let label = (raw ?? "").trim();
  const wrapped = label.match(/^SerpJob\s*\((.+)\)$/i);
  if (wrapped) label = wrapped[1].trim();
  label = label.replace(/\s+(Jobs|Careers)$/i, "").trim();
  const known: Record<string, string> = {
    linkedin: "LinkedIn",
    weworkremotely: "We Work Remotely",
    remoteok: "Remote OK",
    ziprecruiter: "ZipRecruiter",
    simplyhired: "SimplyHired",
    indeed: "Indeed",
  };
  const key = label.toLowerCase();
  if (known[key]) return known[key];
  if (!label || /^(true|false|yes|no|remote)$/i.test(label)) return "Job board";
  return label;
}

function legacyDescriptionBlocks(description: string): Array<{
  type: "paragraph" | "bullet";
  text: string;
}> {
  return description
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bullet = /^[•·▪◦*-]\s*/.test(line);
      return {
        type: bullet ? "bullet" as const : "paragraph" as const,
        text: bullet ? line.replace(/^[•·▪◦*-]\s*/, "") : line,
      };
    });
}

// ==================== Queries ====================

/**
 * Feed-safe view of the curated legacy board. This is intentionally internal:
 * the HTTP bridge below is the only public surface and VIP rows are removed
 * before any mapping or filtering occurs.
 */
export const listFreeHireSourceJobs = internalQuery({
  args: {
    lane: v.string(),
    workMode: v.optional(v.string()),
    country: v.optional(v.string()),
    postedWithinDays: v.optional(v.number()),
    minSalary: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const lane = FREEHIRE_BRIDGE_LANES.includes(args.lane as typeof FREEHIRE_BRIDGE_LANES[number])
      ? args.lane as typeof FREEHIRE_BRIDGE_LANES[number]
      : "sales";
    const workMode = FREEHIRE_BRIDGE_WORK_MODES.includes(args.workMode as typeof FREEHIRE_BRIDGE_WORK_MODES[number])
      ? args.workMode
      : undefined;
    const country = typeof args.country === "string" && /^[A-Z]{2}$/.test(args.country)
      ? args.country
      : undefined;
    const postedWithinDays = args.postedWithinDays === 7 || args.postedWithinDays === 30
      ? args.postedWithinDays
      : undefined;
    const minSalary = FREEHIRE_BRIDGE_MIN_SALARIES.includes(args.minSalary as typeof FREEHIRE_BRIDGE_MIN_SALARIES[number])
      ? args.minSalary
      : undefined;
    const cutoff = postedWithinDays ? Date.now() - postedWithinDays * 24 * 60 * 60 * 1000 : null;

    const active = await ctx.db
      .query("b2cPublicJobs")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const jobs = active
      .filter((job) => job.vipOnly !== true && job.applyUrl.startsWith("https://"))
      .filter((job) => lane === "sales" || legacyJobLane(job) === lane)
      .filter((job) => {
        if (workMode && job.remote === true && workMode !== "remote") return false;
        const inferredCountry = inferLegacyCountry(job.location);
        if (country && inferredCountry && inferredCountry !== country) return false;
        const postedAt = legacyPostedTimestamp(job);
        if (cutoff && postedAt && postedAt < cutoff) return false;
        const salaryFloor = legacySalaryFloor(job.salaryRange);
        if (minSalary && salaryFloor !== null && salaryFloor < minSalary) return false;
        return true;
      })
      .sort((a, b) => (legacyPostedTimestamp(b) ?? b.createdAt) - (legacyPostedTimestamp(a) ?? a.createdAt))
      .map((job) => {
        const postedAt = legacyPostedTimestamp(job);
        const inferredCountry = inferLegacyCountry(job.location);
        const description = job.description?.trim() ?? "";
        return {
          id: `sequ3nce:${job._id}`,
          title: job.title,
          company: job.companyName,
          logoUrl: "",
          location: job.location,
          description,
          descriptionBlocks: legacyDescriptionBlocks(description),
          applyUrl: job.applyUrl,
          source: cleanLegacySource(job.source),
          workMode: job.remote === true ? "remote" as const : "unknown" as const,
          skills: [],
          employmentType: job.jobType?.trim() || "Not listed",
          seniority: job.experienceLevel?.trim() || "Not listed",
          salary: job.salaryRange?.trim() || "Compensation not listed",
          postedAt: postedAt ? new Date(postedAt).toISOString() : null,
          lastSeenAt: null,
          appliedCount: 0,
          domains: [],
          countries: inferredCountry ? [inferredCountry.toLowerCase()] : [],
          reality: null,
        };
      });

    return { jobs, total: jobs.length, fetchedAt: new Date().toISOString() };
  },
});

/** List active public jobs. Enriched with user's tracking status. */
export const listJobs = query({
  args: {
    userId: v.optional(v.id("b2cUsers")),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, { userId, industry }) => {
    let jobs;
    if (industry && VALID_INDUSTRIES.includes(industry)) {
      jobs = await ctx.db
        .query("b2cPublicJobs")
        .withIndex("by_industry", (q) => q.eq("status", "active").eq("industry", industry))
        .order("desc")
        .collect();
    } else {
      jobs = await ctx.db
        .query("b2cPublicJobs")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .order("desc")
        .collect();
    }

    // Partner roles (vipOnly) never appear on the public board — for anyone.
    // The Placement Line is not a browsable list: partners get profiles from
    // us, members wait to be contacted (see b2cPlacementLine.ts). The flag
    // and count survive for the internal tab's own surfaces.
    const viewer = userId ? await ctx.db.get(userId) : null;
    const viewerBadges: string[] = (viewer as any)?.badges ?? [];
    const vipViewer =
      viewerBadges.includes("vip") ||
      viewerBadges.includes("founder") ||
      viewerBadges.includes("admin");
    const partnerRoleCount = jobs.filter((j) => j.vipOnly === true).length;
    jobs = jobs.filter((j) => j.vipOnly !== true);

    if (!userId) {
      return { jobs: jobs.map((j) => ({ ...j, tracking: null })), partnerRoleCount, vipViewer };
    }

    // Get all tracking records for this user in one query
    const allTracking = await ctx.db
      .query("b2cPublicJobTracking")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const trackingByJob = new Map(allTracking.map((t) => [t.jobId, t]));

    return {
      jobs: jobs.map((j) => ({
        ...j,
        tracking: trackingByJob.get(j._id) ?? null,
      })),
      partnerRoleCount,
      vipViewer,
    };
  },
});
