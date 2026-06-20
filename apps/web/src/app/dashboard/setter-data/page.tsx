"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { useTeam } from "@/hooks/useTeam";
import { ConnectionGate } from "./components/ConnectionGate";
import { BackfillBanner } from "./components/BackfillBanner";
import { ErrorBanner } from "./components/ErrorBanner";
import { HistoricalActivityNote } from "./components/HistoricalActivityNote";
import { OverviewTab } from "./components/overview/OverviewTab";
import { LeadsTab } from "./components/leads/LeadsTab";
import { SettersTab } from "./components/setters/SettersTab";
import { SettingsTab } from "./components/settings/SettingsTab";
import { ScorecardTab } from "./components/scorecard/ScorecardTab";
import { isEarlyAccessTeam } from "@/lib/featureGates";
import { Loader2 } from "lucide-react";

const TABS = ["overview", "leads", "setters", "scorecard", "settings"] as const;
type TabId = (typeof TABS)[number];

const TAB_LABELS: Record<TabId, string> = {
  overview: "Overview",
  leads: "Leads",
  setters: "Setters",
  scorecard: "Scorecard",
  settings: "Settings",
};

function isTabId(value: string | null): value is TabId {
  return TABS.includes(value as TabId);
}

function SetterDataPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clerkId, team } = useTeam();
  const installation = useQuery(
    api.setterGhlOauth.getMyInstallationStatus,
    clerkId ? { clerkId } : "skip",
  );

  // Scorecard tab is in early access for the AICom team only.
  // Other customers don't see it in the nav and can't reach it via URL.
  const showScorecard = isEarlyAccessTeam(team?._id);
  const visibleTabs = TABS.filter((id) => id !== "scorecard" || showScorecard);

  // Tab state — persisted to URL so links + browser-back work naturally.
  const tabParam = searchParams.get("tab");
  const initialTab =
    isTabId(tabParam) && (tabParam !== "scorecard" || showScorecard)
      ? tabParam
      : "overview";
  const [tab, setTab] = useState<TabId>(initialTab);

  // Keep state in sync if the URL changes (e.g. OAuth callback redirects
  // here with ?tab=settings).
  useEffect(() => {
    if (isTabId(tabParam) && tabParam !== tab) {
      setTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  // Date range — lifted to page level so it persists across tab switches.
  // Default = last 7 days (most common manager view).
  const [dateRange, setDateRange] = useState<{ start: number; end: number }>(
    () => {
      const now = Date.now();
      return {
        start: now - 7 * 24 * 60 * 60 * 1000,
        end: now,
      };
    },
  );

  function handleTabChange(next: TabId) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/dashboard/setter-data?${params.toString()}`, { scroll: false });
  }

  // Loading state — installation query is in-flight.
  if (installation === undefined) {
    return (
      <>
        <Header title="Setter Data" />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  // Not authenticated — Convex couldn't resolve the user. Clerk should
  // have redirected to sign-in upstream, so this is mostly a safety
  // fallback for an auth race during navigation.
  if (installation === null) {
    return (
      <>
        <Header title="Setter Data" />
        <div className="px-6 py-12">
          <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">Sign in to continue</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your session couldn&apos;t be verified. Refresh the page or
              sign in again.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Not connected → show install hero, full-bleed (no tabs).
  if (!installation.connected) {
    return (
      <>
        <Header title="Setter Data" />
        <div className="px-6 py-8">
          <ConnectionGate teamId={team?._id} />
          <ConnectionRedirectFlash />
        </div>
      </>
    );
  }

  // Connected — render the full tab UI.
  return (
    <>
      <Header title="Setter Data" />
      <div className="px-6 pt-6">
        {/* Connection error banner (top-level — visible on every tab) */}
        {installation.status === "error" && (
          <ErrorBanner
            message={
              installation.errorMessage ||
              "Connection error — try reconnecting from Settings."
            }
          />
        )}

        {/* Backfill progress banner (only visible while deep backfill is
            in progress AND no error) */}
        {installation.fastBackfillCompletedAt &&
          !installation.deepBackfillCompletedAt &&
          !installation.deepBackfillError &&
          installation.status === "active" && (
            <BackfillBanner
              monthsCompleted={installation.deepBackfillLastCompletedMonth ?? 3}
              monthsTarget={12}
            />
          )}

        {/* Activity-data scope disclosure. Backfill imports historical
            leads but NOT historical conversation activity, so dial/SMS/
            connection metrics are forward-looking from the install date. */}
        {installation.installedAt &&
          installation.status !== "error" &&
          tab !== "settings" && (
            <HistoricalActivityNote installedAt={installation.installedAt} />
          )}

        {/* Tab nav */}
        <nav className="mb-6 flex gap-1 border-b border-border">
          {visibleTabs.map((id) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={
                "relative px-4 py-2 text-sm font-medium transition-colors " +
                (tab === id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {TAB_LABELS[id]}
              {tab === id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </nav>

        {/* Tab body */}
        {tab === "overview" && (
          <OverviewTab
            rangeStart={dateRange.start}
            rangeEnd={dateRange.end}
            onRangeChange={(start, end) => setDateRange({ start, end })}
            onDrillToLeads={(filter) => {
              setTab("leads");
              const params = new URLSearchParams();
              params.set("tab", "leads");
              if (filter) params.set("filter", filter);
              router.replace(`/dashboard/setter-data?${params.toString()}`, {
                scroll: false,
              });
            }}
          />
        )}
        {tab === "leads" && (
          <LeadsTab
            rangeStart={dateRange.start}
            rangeEnd={dateRange.end}
            onRangeChange={(start, end) => setDateRange({ start, end })}
            initialFilter={searchParams.get("filter")}
          />
        )}
        {tab === "setters" && (
          <SettersTab
            rangeStart={dateRange.start}
            rangeEnd={dateRange.end}
            onRangeChange={(start, end) => setDateRange({ start, end })}
          />
        )}
        {tab === "scorecard" && showScorecard && <ScorecardTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </>
  );
}

/**
 * Reads ?connected=1 from the OAuth callback redirect and shows a brief
 * toast-like flash. Self-clears after a few seconds.
 */
function ConnectionRedirectFlash() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected") === "1";
  const error = searchParams.get("ghl_error");

  if (connected) {
    return (
      <div className="mx-auto mt-4 max-w-2xl rounded-md border border-green-500/30 bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-100">
        ✓ Connected to GoHighLevel — your data should start appearing within a
        few minutes.
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto mt-4 max-w-2xl rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Connection failed: {error}
      </div>
    );
  }
  return null;
}

export default function SetterDataPage() {
  return (
    <Suspense
      fallback={
        <>
          <Header title="Setter Data" />
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </>
      }
    >
      <SetterDataPageInner />
    </Suspense>
  );
}
