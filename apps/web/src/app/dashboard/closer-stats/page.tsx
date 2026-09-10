"use client";

// Closer Stats moved inside Closer Performance (its "Closer stats" tab).
// Old links still land: this route forwards them, keeping the sub-tab.

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function Forward() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const sub = params.get("tab");
    router.replace(`/dashboard/team-performance?tab=closers${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`);
  }, [router, params]);
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function CloserStatsPage() {
  return (
    <Suspense fallback={null}>
      <Forward />
    </Suspense>
  );
}
