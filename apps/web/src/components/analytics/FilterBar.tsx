"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATE_RANGE_OPTIONS, OUTCOME_OPTIONS } from "@/lib/analytics-utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface Closer {
  _id: Id<"closers">;
  name: string;
}

interface FilterBarProps {
  dateRange: string;
  onDateRangeChange: (value: string) => void;
  closerId: string;
  onCloserChange: (value: string) => void;
  outcome: string;
  onOutcomeChange: (value: string) => void;
  closers: Closer[];
  isLoading?: boolean;
}

export function FilterBar({
  dateRange,
  onDateRangeChange,
  closerId,
  onCloserChange,
  outcome,
  onOutcomeChange,
  closers,
  isLoading,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-3 p-4 bg-zinc-50 rounded-lg border border-zinc-200">
      {/* Date Range */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Period:</span>
        <Select value={dateRange} onValueChange={onDateRangeChange} disabled={isLoading}>
          <SelectTrigger className="w-[140px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Closer Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Closer:</span>
        <Select value={closerId} onValueChange={onCloserChange} disabled={isLoading}>
          <SelectTrigger className="w-[160px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Closers</SelectItem>
            {closers.map((closer) => (
              <SelectItem key={closer._id} value={closer._id}>
                {closer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Outcome Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Outcome:</span>
        <Select value={outcome} onValueChange={onOutcomeChange} disabled={isLoading}>
          <SelectTrigger className="w-[140px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
