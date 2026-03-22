import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Highlight Clip | Sequ3nce",
  description: "Watch this highlight clip on Sequ3nce — the sales intelligence platform for closers.",
  openGraph: {
    title: "Highlight Clip | Sequ3nce",
    description: "Watch this highlight clip on Sequ3nce.",
    type: "video.other",
  },
  twitter: {
    card: "summary",
    title: "Highlight Clip | Sequ3nce",
    description: "Watch this highlight clip on Sequ3nce.",
  },
};

export default function HighlightShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
