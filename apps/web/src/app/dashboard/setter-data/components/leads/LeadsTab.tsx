"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { DateRangeSelect } from "../DateRangeSelect";
import { LeadFilterBar } from "./LeadFilterBar";
import { LeadTable } from "./LeadTable";
import { LeadDrillPanel } from "./LeadDrillPanel";
import { Loader2 } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";

type LeadFilter = "all" | "preConnection" | "connected" | "untouched";

interface LeadsTabProps {
  rangeStart: number;
  rangeEnd: number;
  onRangeChange: (start: number, end: number) => void;
  initialFilter?: string | null;
}

function isLeadFilter(value: string | null | undefined): value is LeadFilter {
  return value === "all" || value === "preConnection" || value === "connected" || value === "untouched";
}

export function LeadsTab({
  rangeStart,
  rangeEnd,
  onRangeChange,
  initialFilter,
}: LeadsTabProps) {
  const [filter, setFilter] = useState<LeadFilter>(
    isLeadFilter(initialFilter) ? initialFilter : "all",
  );
  const [assignedTo, setAssignedTo] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [drilldownLeadId, setDrilldownLeadId] = useState<Id<"setterLeads"> | null>(null);

  // Reset to page 1 whenever filters change so we don't end up on an empty
  // 4th page after narrowing the result set.
  useEffect(() => {
    setPage(1);
  }, [filter, assignedTo, search, rangeStart, rangeEnd]);

  const { clerkId } = useTeam();
  const leads = useQuery(
    api.setterData.getLeads,
    clerkId
      ? {
          clerkId,
          rangeStart,
          rangeEnd,
          filter,
          assignedToGhlUserId: assignedTo,
          search: search.trim() || undefined,
          page,
          pageSize: 50,
        }
      : "skip",
  );

  const reps = useQuery(
    api.setterData.getReps,
    clerkId ? { clerkId } : "skip",
  );

  return (
    <div className="space-y-4 pb-12">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Leads</h2>
        <DateRangeSelect
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onChange={onRangeChange}
        />
      </div>

      <LeadFilterBar
        filter={filter}
        onFilterChange={setFilter}
        assignedTo={assignedTo}
        onAssignedToChange={setAssignedTo}
        search={search}
        onSearchChange={setSearch}
        reps={reps ?? []}
      />

      {leads === undefined && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {leads && leads.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <h3 className="text-base font-semibold">No leads match these filters</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Try widening your date range or clearing filters.
          </p>
        </div>
      )}

      {leads && leads.items.length > 0 && (
        <>
          <LeadTable
            items={leads.items}
            onRowClick={(id) => setDrilldownLeadId(id)}
          />

          {/* Pagination */}
          {leads.total > 50 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {(page - 1) * 50 + 1}–
                {Math.min(page * 50, leads.total)} of {leads.total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-border px-3 py-1 hover:bg-muted disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!leads.hasMore}
                  className="rounded-md border border-border px-3 py-1 hover:bg-muted disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <LeadDrillPanel
        leadId={drilldownLeadId}
        onClose={() => setDrilldownLeadId(null)}
      />
    </div>
  );
}
