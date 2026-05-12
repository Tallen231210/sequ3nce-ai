"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertCircle } from "lucide-react";

interface ActionQueueItem {
  leadId: string;
  name?: string;
  email?: string;
  phone?: string;
  dateAdded: number;
  assignedToName: string;
}

interface ActionQueueProps {
  actionQueue: ActionQueueItem[];
  onViewAll?: () => void;
}

/**
 * Top-5 stalest untouched leads — the action surface for managers.
 * "Stalest first" because the longer a lead sits, the colder it gets.
 */
export function ActionQueue({ actionQueue, onViewAll }: ActionQueueProps) {
  return (
    <Card>
      <CardContent className="px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Action queue</h3>
            <p className="text-xs text-muted-foreground">
              Leads waiting longest with zero contact attempts.
            </p>
          </div>
          {actionQueue.length > 0 && onViewAll && (
            <Button variant="ghost" size="sm" onClick={onViewAll}>
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>

        {actionQueue.length === 0 ? (
          <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No untouched leads. Nice work.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {actionQueue.map((lead) => (
              <li key={lead.leadId} className="flex items-center gap-3 py-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {lead.name || lead.email || lead.phone || "Unnamed lead"}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {lead.assignedToName} · {formatRelativeTime(lead.dateAdded)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min waiting`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h waiting`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d waiting`;
}
