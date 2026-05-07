"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

type LeadFilter = "all" | "preConnection" | "connected" | "untouched";

interface LeadFilterBarProps {
  filter: LeadFilter;
  onFilterChange: (filter: LeadFilter) => void;
  assignedTo: string | undefined;
  onAssignedToChange: (id: string | undefined) => void;
  search: string;
  onSearchChange: (search: string) => void;
  reps: Array<{ ghlUserId: string; name: string; email?: string }>;
}

const FILTER_LABELS: Record<LeadFilter, string> = {
  all: "All leads",
  preConnection: "Pre-connection",
  connected: "Connected",
  untouched: "Untouched",
};

const ALL_REPS_VALUE = "__all__";

export function LeadFilterBar({
  filter,
  onFilterChange,
  assignedTo,
  onAssignedToChange,
  search,
  onSearchChange,
  reps,
}: LeadFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Status filter */}
      <Select
        value={filter}
        onValueChange={(v) => onFilterChange(v as LeadFilter)}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(FILTER_LABELS) as LeadFilter[]).map((f) => (
            <SelectItem key={f} value={f}>
              {FILTER_LABELS[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Assigned-to filter (rep dropdown) */}
      <Select
        value={assignedTo ?? ALL_REPS_VALUE}
        onValueChange={(v) =>
          onAssignedToChange(v === ALL_REPS_VALUE ? undefined : v)
        }
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="All setters" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_REPS_VALUE}>All setters</SelectItem>
          {reps.map((rep) => (
            <SelectItem key={rep.ghlUserId} value={rep.ghlUserId}>
              {rep.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Search */}
      <div className="relative ml-auto w-72">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search name, email, or phone…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
