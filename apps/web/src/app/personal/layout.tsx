import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sequ3nce Personal — Your Sales Career, Verified",
  description:
    "Verified closer profiles, AI call analysis, highlight reels, and a job board for individual high-ticket closers.",
};

export default function PersonalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
