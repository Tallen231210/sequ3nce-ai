// One-shot bulk import of job listings from a Google Sheet CSV export
// into the b2cPublicJobs Convex table.
//
// Usage:
//   node apps/web/scripts/import-jobs.mjs <csv-path> --founder-user-id <id> [--dry-run] [--prod]
//
// Examples:
//   curl -sL "https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>" -o /tmp/jobs.csv
//   node apps/web/scripts/import-jobs.mjs /tmp/jobs.csv --founder-user-id ab12cd34efgh --dry-run
//   node apps/web/scripts/import-jobs.mjs /tmp/jobs.csv --founder-user-id ab12cd34efgh --prod
//
// Defaults to the dev deployment so a stray invocation can't pollute prod.
// Pass --prod explicitly when you actually want to import to production.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parse } from "csv-parse/sync";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const DEV_URL = "https://fastidious-dragon-782.convex.cloud";
const PROD_URL = "https://ideal-ram-982.convex.cloud";

// ---------- CLI parsing ----------

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const founderArgIdx = args.indexOf("--founder-user-id");
const founderUserId =
  founderArgIdx >= 0 ? args[founderArgIdx + 1] : undefined;
const dryRun = args.includes("--dry-run");
const useProd = args.includes("--prod");

if (!csvPath) {
  console.error("Usage: node import-jobs.mjs <csv-path> --founder-user-id <id> [--dry-run] [--prod]");
  process.exit(1);
}
if (!founderUserId) {
  console.error("Missing --founder-user-id. Look up Gianni's b2cUsers ID in the Convex dashboard.");
  process.exit(1);
}

const convexUrl = useProd ? PROD_URL : DEV_URL;
const client = new ConvexHttpClient(convexUrl);

console.log(
  `Target: ${useProd ? "PROD" : "DEV"} (${convexUrl})${dryRun ? " — DRY RUN" : ""}`,
);
console.log(`Founder user id: ${founderUserId}\n`);

// ---------- Industry normalization ----------

// Sheet uses some values that don't match the schema enum. This table
// translates sheet → schema. Anything not in this table → "Other".
const INDUSTRY_MAP = {
  saas: "SaaS",
  insurance: "Insurance",
  "real estate": "Real Estate",
  solar: "Solar",
  coaching: "Coaching",
  agency: "Agency",
  "info products": "Info Products",
  "e-commerce": "E-Commerce",
  "e-com": "E-Commerce",
  ecommerce: "E-Commerce",
  health: "Health",
  finance: "Financial Services",
  "financial services": "Financial Services",
  other: "Other",
};

function normalizeIndustry(raw) {
  if (!raw) return "Other";
  const key = String(raw).trim().toLowerCase();
  return INDUSTRY_MAP[key] ?? "Other";
}

// ---------- Field parsers ----------

function normalizeRemote(raw) {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === "yes" || s === "true" || s === "remote") return true;
  if (s === "no" || s === "false") return false;
  return undefined;
}

function normalizeBoolean(raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = String(raw).trim().toLowerCase();
  if (["yes", "true", "1"].includes(value)) return true;
  if (["no", "false", "0"].includes(value)) return false;
  return undefined;
}

function normalizeApplyUrl(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Coerce http:// → https:// (most modern job boards support both,
  // and our schema requires https). Drops anything else.
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return "https://" + trimmed.slice(7);
  return null;
}

function parsePostedDate(raw) {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  // Sheet uses MM/DD/YYYY. Date.parse handles that on most runtimes,
  // but be defensive with explicit parsing.
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, m, d, y] = match;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    const date = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
    return Number.isFinite(date.getTime()) ? date.getTime() : undefined;
  }
  const fallback = Date.parse(trimmed);
  return Number.isFinite(fallback) ? fallback : undefined;
}

function cleanSalary(raw) {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  // Sheet has "$85K --$130k OTE" and similar — collapse weird spacing.
  return trimmed.replace(/\s+/g, " ").replace(/--/g, "–").slice(0, 100);
}

function cleanText(raw, max) {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function normalizeSource(raw) {
  if (!raw) return undefined;
  const s = String(raw).trim();
  // Schema allows free-form, but we normalize to known values when
  // possible so the UI can render consistent badges.
  const lower = s.toLowerCase();
  if (lower === "linkedin") return "LinkedIn";
  if (lower === "indeed") return "Indeed";
  if (lower === "direct") return "Direct";
  if (lower === "other") return "Other";
  return s.slice(0, 50); // pass through unknown values truncated
}

// ---------- Read CSV ----------

console.log(`Reading ${csvPath}...`);
const csvText = readFileSync(csvPath, "utf8");

// Sheet has 2 metadata rows before the header row. Skip them so column
// names line up with the actual data.
const allRecords = parse(csvText, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  from_line: 3, // header is row 3 in the sheet (rows 1-2 = title/instructions)
  relax_quotes: true,
  relax_column_count: true,
});

console.log(`Parsed ${allRecords.length} rows from CSV.\n`);

// ---------- Transform + validate ----------

const droppedReasons = [];
const transformed = [];
const seenUrls = new Set();

for (let i = 0; i < allRecords.length; i++) {
  const row = allRecords[i];
  const sheetRow = i + 4; // human-friendly row number (header is row 3)

  const company = (row["Company Name"] || "").trim();
  const title = (row["Job Title"] || "").trim();

  // Skip blank rows — sheet has interspersed empty lines.
  if (!company && !title) {
    continue;
  }

  if (!company) {
    droppedReasons.push({ row: sheetRow, reason: "missing company name" });
    continue;
  }
  if (!title) {
    droppedReasons.push({ row: sheetRow, reason: `missing job title (${company})` });
    continue;
  }

  const applyUrl = normalizeApplyUrl(row["Apply URL"]);
  if (!applyUrl) {
    droppedReasons.push({ row: sheetRow, reason: `invalid apply URL (${company})` });
    continue;
  }

  if (seenUrls.has(applyUrl)) {
    droppedReasons.push({
      row: sheetRow,
      reason: `duplicate URL within sheet (${company})`,
    });
    continue;
  }
  seenUrls.add(applyUrl);

  const location = (row["Location"] || "").trim() || "Remote";
  const industry = normalizeIndustry(row["Industry"]);

  transformed.push({
    companyName: company.slice(0, 100),
    title: title.slice(0, 200),
    location: location.slice(0, 100),
    salaryRange: cleanSalary(row["Salary / OTE"]),
    industry,
    description: cleanText(row["Description"], 2000),
    applyUrl: applyUrl.slice(0, 500),
    source: normalizeSource(row["Source"]),
    remote: normalizeRemote(row["Remote"]),
    jobType: cleanText(row["Job Type"], 50),
    experienceLevel: cleanText(row["Exp. Level"], 50),
    datePosted: parsePostedDate(row["Date Posted"]),
    highTicket: normalizeBoolean(row["High Ticket"] ?? row.highTicket),
  });
}

// ---------- Summary ----------

console.log("=".repeat(60));
console.log(`Importable rows: ${transformed.length}`);
console.log(`Dropped rows: ${droppedReasons.length}`);
if (droppedReasons.length > 0) {
  console.log("\nDropped row reasons:");
  for (const d of droppedReasons.slice(0, 30)) {
    console.log(`  Row ${d.row}: ${d.reason}`);
  }
  if (droppedReasons.length > 30) {
    console.log(`  ... and ${droppedReasons.length - 30} more`);
  }
}

// Industry distribution
const industryDist = transformed.reduce((acc, j) => {
  acc[j.industry] = (acc[j.industry] || 0) + 1;
  return acc;
}, {});
console.log("\nIndustry distribution:");
for (const [k, v] of Object.entries(industryDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

// Print a sample of 3 fully-transformed rows so the user can sanity check.
console.log("\nSample of 3 transformed rows:");
for (const j of transformed.slice(0, 3)) {
  console.log(JSON.stringify(j, null, 2));
}
console.log("=".repeat(60));

if (dryRun) {
  console.log("\nDRY RUN — no rows imported. Re-run without --dry-run to import.");
  process.exit(0);
}

// ---------- Confirmation prompt ----------

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise((resolve) => {
  rl.question(
    `\nImport ${transformed.length} jobs to ${useProd ? "PROD" : "DEV"}? [y/N] `,
    resolve,
  );
});
rl.close();

if (answer.trim().toLowerCase() !== "y") {
  console.log("Aborted.");
  process.exit(0);
}

// ---------- Send to Convex in batches ----------

const BATCH_SIZE = 100;
let totalInserted = 0;
let totalSkipped = 0;
const allErrors = [];

for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
  const batch = transformed.slice(i, i + BATCH_SIZE);
  console.log(
    `\nBatch ${i / BATCH_SIZE + 1}: sending ${batch.length} rows...`,
  );
  try {
    const result = await client.mutation(api.b2cPublicJobs.addJobsBulk, {
      founderUserId,
      jobs: batch,
    });
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    if (result.errors.length > 0) {
      allErrors.push(
        ...result.errors.map((e) => ({
          ...e,
          batchOffset: i,
        })),
      );
    }
    console.log(
      `  → inserted: ${result.inserted}, skipped: ${result.skipped}, errors: ${result.errors.length}`,
    );
  } catch (err) {
    console.error(`  ✗ Batch failed: ${err.message ?? err}`);
    allErrors.push({
      row: i,
      companyName: "(batch)",
      message: err.message ?? String(err),
    });
  }
}

console.log("\n" + "=".repeat(60));
console.log(`Done. Inserted: ${totalInserted}, Skipped (dedup): ${totalSkipped}`);
if (allErrors.length > 0) {
  console.log(`\nErrors: ${allErrors.length}`);
  for (const e of allErrors.slice(0, 20)) {
    console.log(
      `  Batch row ${e.row}${e.batchOffset ? ` (offset ${e.batchOffset})` : ""}: ${e.companyName} — ${e.message}`,
    );
  }
  if (allErrors.length > 20) {
    console.log(`  ... and ${allErrors.length - 20} more`);
  }
}
