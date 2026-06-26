"use client";

import { Header } from "@/components/dashboard/header";
import { Briefcase } from "lucide-react";

// Temporarily showing "Coming Soon" until the B2C closer pool has enough
// public profiles to power the Talent Directory. The full implementation
// lives in PostingsList.tsx / TalentDirectory.tsx and can be reinstated by
// reverting this file to its prior version once B2C profiles are live.
export default function RecruitingPage() {
  return (
    <>
      <Header title="Recruiting" description="Post jobs and browse talent" />

      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-5">
          <Briefcase className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Recruiting Coming Soon
        </h2>
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
          We&apos;re building a talent marketplace that connects your team with
          top-performing closers. Check back once our closer directory is
          live.
        </p>
      </div>
    </>
  );
}
