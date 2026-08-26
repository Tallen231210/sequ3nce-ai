"use client";

// The setter app's chrome: auth gate, top bar, tab nav. Every page renders
// inside this; pages read identity through SetterContext, never props.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { clearSetterToken, getSetterToken } from "@/lib/setter/session";
import { Logo } from "@/components/ui/logo";
import { LoginCard } from "./LoginCard";
import { SetterContext, type SetterHome } from "./SetterContext";

const TABS = [
  { href: "/setter/eod", label: "EOD" },
  { href: "/setter/calls", label: "Calls You've Set" },
  { href: "/setter/scorecard", label: "Scorecard" },
  { href: "/setter/projections", label: "Projections" },
];

export function SetterShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useMutation(api.setterAuth.logoutSetter);
  // Token lives in localStorage, so the first render on the server knows
  // nothing — resolve it after mount to avoid hydration mismatch.
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setToken(getSetterToken());
    setReady(true);
  }, [refreshKey]);

  const home = useQuery(
    api.setterApp.getSetterHome,
    token ? { sessionToken: token } : "skip",
  ) as SetterHome | null | undefined;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    // A dead session (expired, or the setter was deactivated) resolves to
    // null — clear it so the login card shows instead of a blank screen.
    if (token && home === null) {
      clearSetterToken();
      setToken(null);
    }
  }, [token, home]);

  if (!ready) return null;

  if (!token) {
    return <LoginCard onSignedIn={refresh} />;
  }
  if (home === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-400">
        Loading…
      </div>
    );
  }
  if (home === null) return <LoginCard onSignedIn={refresh} />;

  return (
    <SetterContext.Provider value={{ sessionToken: token, home, refresh }}>
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Logo height={22} />
              <span className="hidden text-[12px] text-neutral-400 sm:inline">
                {home.teamName}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                {home.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
              <span className="hidden text-[13px] font-medium sm:inline">{home.name}</span>
              <button
                onClick={async () => {
                  const t = getSetterToken();
                  clearSetterToken();
                  setToken(null);
                  if (t) await logout({ sessionToken: t });
                }}
                className="rounded-md border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-900"
              >
                Sign out
              </button>
            </div>
          </div>
          <nav className="mx-auto max-w-5xl px-3 pb-2">
            <div className="flex w-fit gap-1 rounded-lg bg-neutral-100 p-1">
              {TABS.map((t) => {
                const active = pathname?.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={
                      "whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition-colors " +
                      (active
                        ? "bg-white font-medium text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-900")
                    }
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </SetterContext.Provider>
  );
}
