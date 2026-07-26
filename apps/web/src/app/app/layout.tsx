import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sequ3nce",
  // Closers open this every day; it should never surface in search.
  robots: { index: false, follow: false },
};

/**
 * The closer app.
 *
 * Sits outside the Clerk-protected prefixes (/dashboard, /team, /billing,
 * /settings, /calls) on purpose — closers authenticate against the `closers`
 * table, not Clerk. Putting these routes under one of those paths would bounce
 * every closer to a manager login.
 */
export default function CloserAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
