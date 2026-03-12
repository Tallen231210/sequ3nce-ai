"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ExternalLink,
  CheckCircle2,
  Search,
  Users,
} from "lucide-react";

const INDUSTRIES = [
  "Solar", "Insurance", "Real Estate", "SaaS", "Coaching",
  "Agency", "Info Products", "E-Commerce", "Financial Services", "Other",
];

const TICKET_RANGES = [
  "Under $1k", "$1k-$3k", "$3k-$10k", "$10k-$25k", "$25k-$50k", "$50k+",
];

const NONE = "__none__";

export function TalentDirectory() {
  const [industry, setIndustry] = useState("");
  const [ticketRange, setTicketRange] = useState("");
  const [searchName, setSearchName] = useState("");

  const talent = useQuery(api.b2cJobBoard.listTalentDirectory, {
    industry: industry || undefined,
    ticketRange: ticketRange || undefined,
    searchName: searchName || undefined,
  });

  return (
    <>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Search by name..."
            className="pl-9"
          />
        </div>
        <Select
          value={industry || NONE}
          onValueChange={(v) => setIndustry(v === NONE ? "" : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All Industries</SelectItem>
            {INDUSTRIES.map((ind) => (
              <SelectItem key={ind} value={ind}>
                {ind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={ticketRange || NONE}
          onValueChange={(v) => setTicketRange(v === NONE ? "" : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Ranges" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All Ranges</SelectItem>
            {TICKET_RANGES.map((range) => (
              <SelectItem key={range} value={range}>
                {range}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {talent === undefined ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : talent.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <Users className="h-12 w-12 text-zinc-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">No closers found</h3>
              <p className="text-zinc-500 text-sm max-w-sm">
                {industry || ticketRange || searchName
                  ? "Try adjusting your filters to see more results."
                  : "No closers have set their profiles to available yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-zinc-500 mb-3">
            {talent.length} available closer{talent.length !== 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {talent.map((closer) => (
              <Card key={closer.userId} className="hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {closer.photoUrl ? (
                      <img
                        src={closer.photoUrl}
                        alt={closer.name}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-500 flex-shrink-0">
                        {closer.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-sm truncate">
                          {closer.name}
                        </h3>
                        {closer.isVerified && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      {closer.headline && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">
                          {closer.headline}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-3">
                    {closer.industries?.slice(0, 3).map((ind) => (
                      <Badge key={ind} variant="outline" className="text-[10px] px-1.5 py-0">
                        {ind}
                      </Badge>
                    ))}
                    {closer.ticketRange && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {closer.ticketRange}
                      </Badge>
                    )}
                  </div>

                  {closer.stats?.cashCollected ? (
                    <p className="text-xs text-zinc-500 mt-2">
                      ${(closer.stats.cashCollected as number).toLocaleString()} cash collected
                    </p>
                  ) : null}

                  {closer.profileSlug && (
                    <a
                      href={`/p/${closer.profileSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-3"
                    >
                      <Button variant="outline" size="sm" className="w-full">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        View Profile
                      </Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
