import type { Metadata } from "next";
import { SetterShell } from "./_components/SetterShell";

export const metadata: Metadata = {
  title: "Sequ3nce — Setter App",
  robots: { index: false },
};

export default function SetterLayout({ children }: { children: React.ReactNode }) {
  return <SetterShell>{children}</SetterShell>;
}
