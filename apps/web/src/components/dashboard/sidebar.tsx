"use client";

import Link from "next/link";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BillingStatus } from "./billing-status";
import { Logo } from "@/components/ui/logo";

const baseNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Live Calls", href: "/dashboard/live", icon: Radio },
  { name: "Schedule", href: "/dashboard/schedule", icon: Calendar },
  { name: "Completed", href: "/dashboard/calls", icon: Phone },
  { name: "Call Reviews", href: "/dashboard/call-reviews", icon: MessageSquareText },
  { name: "Analytics", href: "/dashboard/analytics", icon: TrendingUp },
  { name: "Closer Stats", href: "/dashboard/closer-stats", icon: BarChart3 },
  { name: "Playbook", href: "/dashboard/playbook", icon: BookMarked },
  { name: "Resources", href: "/dashboard/resources", icon: FileText },
  { name: "Recruiting", href: "/dashboard/recruiting", icon: Briefcase },
  { name: "Team", href: "/dashboard/team", icon: Users },
  { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { team } = useTeam();

  const flaggedCount = useQuery(
    api.callReviews.getFlaggedCallCount,
    team?._id ? { teamId: team._id } : "skip"
  );

  const unreadReplyCount = useQuery(
    api.callReviews.getUnreadReplyCount,
    team?._id ? { teamId: team._id } : "skip"
  );

  const callReviewsBadge = (flaggedCount?.count ?? 0) + (unreadReplyCount?.count ?? 0);

  // Build navigation dynamically — add integration sync pages before Billing when enabled
  const integrationItems: typeof baseNavigation = [];
  if (team?.hyrosEnabled) {
    integrationItems.push({ name: "Hyros Sync", href: "/dashboard/hyros-sync", icon: Zap });
  }
  if (team?.ghlEnabled) {
    integrationItems.push({ name: "GHL Sync", href: "/dashboard/ghl-sync", icon: Zap });
  }
  const navigation = integrationItems.length > 0
    ? [
        ...baseNavigation.slice(0, 10), // Dashboard through Team
        ...integrationItems,
        ...baseNavigation.slice(10), // Billing, Settings
      ]
    : baseNavigation;

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
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            const badge =
              item.name === "Call Reviews" && callReviewsBadge
                ? callReviewsBadge
                : 0;

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
