"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, LogOut, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import {
  getCloserInfo,
  refreshSession,
  signOut,
  type CloserInfo,
} from "@/lib/closer/session";

/**
 * Nav for the closer app. Only what's ported so far — the rest of the desktop
 * app's sections land here as they move across.
 */
const NAV = [{ href: "/app/numbers", label: "My Numbers", icon: BarChart3 }];

/**
 * The closer app's frame.
 *
 * Deliberately not a copy of the desktop sidebar: that assumed a window it
 * controlled the size of. A browser is any width, so the sidebar collapses to
 * a top bar on narrow screens rather than eating half the page.
 */
export function CloserShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [closer, setCloser] = useState<CloserInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const info = getCloserInfo();
    if (!info) {
      router.replace("/app/login");
      return;
    }
    setCloser(info);
    // Extend the session once, here, rather than on every request. If the
    // server says it's dead, the closer signs in again.
    void refreshSession().then((valid) => {
      if (!valid) {
        router.replace("/app/login");
        return;
      }
      setChecked(true);
    });
  }, [router]);

  // Nothing renders until we know the session is real — otherwise a closer
  // sees their name and an empty page for a beat before being bounced.
  if (!closer || !checked) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    router.replace("/app/login");
  };

  const navLinks = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        // Segment-boundary match, so /app/numbers-something can never light up
        // /app/numbers. This exact bug shipped once on the manager sidebar.
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            className={
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background lg:flex">
      {/* Narrow screens: a top bar with a disclosure, not a squeezed sidebar */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
        <Logo height={22} />
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {menuOpen && (
        <div className="border-b border-border px-4 py-3 lg:hidden">
          {navLinks}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}

      {/* Wide screens: a proper sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border px-4 py-5 lg:flex">
        <Logo height={24} />
        <div className="mt-6 min-w-0">
          <div className="truncate text-sm font-semibold">{closer.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {closer.teamName ?? closer.email}
          </div>
        </div>
        <div className="mt-6 flex-1">{navLinks}</div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      {/* min-w-0 so wide tables scroll inside the page instead of stretching it */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
