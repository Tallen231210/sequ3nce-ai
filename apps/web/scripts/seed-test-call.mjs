// Script to seed a test call
// Run with: node scripts/seed-test-call.mjs

import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient(process.env.CONVEX_URL || "https://fastidious-dragon-782.convex.cloud");

async function main() {
  // First, get the teams and closers
  console.log("Fetching teams...");

  // Query all teams (we need to use a Convex function for this)
  // For now, let's use the dashboard to get the IDs

  console.log("\nTo seed a test call, run the following in your browser console while on the dashboard:");
  console.log("\n--- Copy and paste this into your browser console ---\n");

  console.log(`
// First, check the Convex dashboard for your team ID and closer ID
// Go to: https://dashboard.convex.dev
// Navigate to your deployment > Data > teams (copy an _id)
// Then navigate to > Data > closers (copy an _id)

// Then run this in your browser console on the Sequ3nce dashboard:

const teamId = "YOUR_TEAM_ID_HERE"; // Replace with actual team ID from Convex dashboard
const closerId = "YOUR_CLOSER_ID_HERE"; // Replace with actual closer ID from Convex dashboard

// The mutation will be called automatically through the Convex client
fetch("https://fastidious-dragon-782.convex.cloud/api/mutation", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    path: "calls:seedTestCall",
    args: { teamId, closerId }
  })
}).then(r => r.json()).then(console.log);
  `);

  console.log("\n--- End of script ---\n");
  console.log("Or, use the Convex dashboard Functions tab to run calls:seedTestCall directly with your team and closer IDs.");
}

main().catch(console.error);
