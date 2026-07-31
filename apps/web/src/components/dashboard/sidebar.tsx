"use client";

import Link from "next/link";
import { tierHas } from "@/lib/tiers";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import {
  LayoutDashboard,
  Radio,
  Calendar,
  Phone,
  Users,
  CreditCard,
  Settings,
  BarChart3,
  BookMarked,
  TrendingUp,
  FileText,
  MessageSquareText,
  Zap,
  Briefcase,
  UserCheck,
  Sparkles,
  Trophy,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BillingStatus } from "./billing-status";
import { Logo } from "@/components/ui/logo";

/** Pages that only mean anything when our bot is in the call. */
const BOT_ONLY_ROUTES = new Set([
  "/dashboard/live",
  "/dashboard/playbook",
  "/dashboard/recordings",
]);

/**
 * Pages that need a recording of some kind — ours or the customer's own.
 *
 * Call Reviews exists to watch a call back and comment on moments in it. On a
 * plan with no recording the list is permanently empty, because the query that
 * feeds it requires either a video file or a Fathom link.
 */
const RECORDING_ONLY_ROUTES = new Set(["/dashboard/call-reviews"]);

const baseNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Live Calls", href: "/dashboard/live", icon: Radio },
  { name: "Schedule", href: "/dashboard/schedule", icon: Calendar },
  { name: "Completed", href: "/dashboard/calls", icon: Phone },
  { name: "Call Reviews", href: "/dashboard/call-reviews", icon: MessageSquareText },
  { name: "Analytics", href: "/dashboard/analytics", icon: TrendingUp },
  // Team-level daily scoreboard (funnel, rates, cash by closer). Sits above
  // Closer Stats deliberately: this is the floor-wide view, Closer Stats is
  // the per-rep drilldown.
  { name: "Team Performance", href: "/dashboard/team-performance", icon: Trophy },
  { name: "Closer Stats", href: "/dashboard/closer-stats", icon: BarChart3 },
  // Deals that closed but weren't paid in full. Next to the performance views
  // because it reads the same post-call numbers — cash collected against
  // contract value — just looking at the gap rather than the total.
  { name: "Collections", href: "/dashboard/collections", icon: Wallet },
  // Setter Data tab — always visible to B2B admins. ConnectionGate inside
  // handles the not-yet-installed state. Hidden only when an admin
  // explicitly sets team.setterDataEnabled = false (kill switch).
  { name: "Setter Data", href: "/dashboard/setter-data", icon: UserCheck },
  { name: "Playbook", href: "/dashboard/playbook", icon: BookMarked },
  { name: "Resources", href: "/dashboard/resources", icon: FileText },
  { name: "Recruiting", href: "/dashboard/recruiting", icon: Briefcase },
  { name: "Team", href: "/dashboard/team", icon: Users },
  { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { team, clerkId } = useTeam();

  const flaggedCount = useQuery(
    api.callReviews.getFlaggedCallCount,
    team?._id ? { teamId: team._id } : "skip"
  );

  const unreadReplyCount = useQuery(
    api.callReviews.getUnreadReplyCount,
    team?._id ? { teamId: team._id } : "skip"
  );

  const callReviewsBadge = (flaggedCount?.count ?? 0) + (unreadReplyCount?.count ?? 0);

  // Onboarding nav item — only visible until all 5 checklist items
  // complete. Badge shows "N/5" progress so manager can see how close
  // they are without opening the page.
  const onboardingState = useQuery(
    api.onboarding.getOnboardingState,
    clerkId ? { clerkId } : "skip",
  );
  const onboardingComplete = onboardingState?.completed === true;
  const onboardingProgress = onboardingState
    ? [
        onboardingState.bookedCall,
        onboardingState.addedCloser,
        onboardingState.installedGhl,
        onboardingState.connectedHyros,
        onboardingState.configuredSlack,
      ].filter(Boolean).length
    : 0;

  // Build navigation dynamically — add integration sync pages before Billing when enabled.
  // GHL Sync is intentionally hidden — its UI was non-functional and is being absorbed
  // into the new Setter Data tab. The underlying disposition-sync code remains in place
  // and will be rebuilt on top of OAuth tokens in Phase 3.
  const integrationItems: typeof baseNavigation = [];
  if (team?.hyrosEnabled) {
    integrationItems.push({ name: "Hyros Sync", href: "/dashboard/hyros-sync", icon: Zap });
  }
  // Filter out Setter Data tab if explicitly disabled (admin kill switch).
  const setterFiltered = team?.setterDataEnabled === false
    ? baseNavigation.filter((item) => item.href !== "/dashboard/setter-data")
    : baseNavigation;

  // Then by what this team's plan actually includes.
  //
  // Live Calls, Playbook and Recordings all exist because our meeting bot is
  // in the call. On the tiers where it isn't, these pages can only ever be
  // empty — showing them advertises something the customer didn't buy and
  // makes the product look broken rather than smaller.
  const withoutBotPages = tierHas(team?.productTier, "meetingBot")
    ? setterFiltered
    : setterFiltered.filter((item) => !BOT_ONLY_ROUTES.has(item.href));
  const filteredBase = tierHas(team?.productTier, "callIntelligence")
    ? withoutBotPages
    : withoutBotPages.filter((item) => !RECORDING_ONLY_ROUTES.has(item.href));
  // Integration sync pages slot in just above Billing. Located by href rather
  // than a fixed index — a hardcoded slice silently misplaces them whenever a
  // nav item is added, or whenever the Setter Data kill switch removes one.
  const billingIdx = filteredBase.findIndex(
    (item) => item.href === "/dashboard/billing",
  );
  const baseWithIntegrations =
    integrationItems.length > 0 && billingIdx >= 0
      ? [
          ...filteredBase.slice(0, billingIdx),
          ...integrationItems,
          ...filteredBase.slice(billingIdx),
        ]
      : filteredBase;
  // Onboarding item slots right after Dashboard, only when not yet
  // complete — once the team finishes the 5-step checklist the item
  // disappears from the nav so it doesn't clutter the sidebar forever.
  // Use findIndex on Dashboard so reordering baseNavigation doesn't
  // silently misplace the Onboarding slot.
  const dashboardIdx = baseWithIntegrations.findIndex(
    (item) => item.href === "/dashboard",
  );
  const navigation =
    onboardingState && !onboardingComplete && dashboardIdx >= 0
      ? [
          ...baseWithIntegrations.slice(0, dashboardIdx + 1),
          { name: "Onboarding", href: "/dashboard/onboarding", icon: Sparkles },
          ...baseWithIntegrations.slice(dashboardIdx + 1),
        ]
      : baseWithIntegrations;

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-background">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-20 items-center justify-center border-b border-border px-4">
          <Logo href="/dashboard" height={33} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            // Match on a path SEGMENT boundary, not a raw prefix. A bare
            // startsWith lights up every link whose href is a string prefix of
            // another: /dashboard/team-performance made "Team" active too,
            // because it starts with /dashboard/team. The old special case for
            // "/dashboard" was the same bug patched one route at a time.
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");

            const badge =
              item.name === "Call Reviews" && callReviewsBadge
                ? callReviewsBadge
                : 0;
            const onboardingBadgeText =
              item.name === "Onboarding"
                ? `${onboardingProgress}/5`
                : null;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" strokeWidth={1.5} />
                {item.name}
                {badge > 0 && (
                  <span
                    className={cn(
                      "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                      isActive
                        ? "bg-white/20 text-primary-foreground"
                        : "bg-orange-100 text-orange-700"
                    )}
                  >
                    {badge}
                  </span>
                )}
                {onboardingBadgeText && (
                  <span
                    className={cn(
                      "ml-auto flex h-5 min-w-7 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                      isActive
                        ? "bg-white/20 text-primary-foreground"
                        : "bg-indigo-100 text-indigo-700"
                    )}
                  >
                    {onboardingBadgeText}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Billing Status Alert */}
        <BillingStatus />

        {/* Footer */}
        <div className="border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            © 2024 Sequ3nce.ai
          </p>
        </div>
      </div>
    </aside>
  );
}
