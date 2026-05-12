"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Id } from "../../../../../../convex/_generated/dataModel";

interface LeadRow {
  leadId: Id<"setterLeads">;
  ghlContactId: string;
  name?: string;
  email?: string;
  phone?: string;
  dateAdded: number;
  dialCount: number;
  firstDialAt?: number;
  smsStatus: "none" | "sent" | "replied";
  isConnected: boolean;
  connectedAt?: number;
  assignedToGhlUserId?: string;
  assignedToName?: string;
  lastActivityAt?: number;
  source?: string;
}

interface LeadTableProps {
  items: LeadRow[];
  onRowClick: (leadId: Id<"setterLeads">) => void;
}

const SMS_LABEL: Record<"none" | "sent" | "replied", string> = {
  none: "—",
  sent: "Sent",
  replied: "Replied",
};

export function LeadTable({ items, onRowClick }: LeadTableProps) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Lead</TableHead>
            <TableHead className="w-[14%]">Assigned</TableHead>
            <TableHead className="w-[12%]">Time in pipeline</TableHead>
            <TableHead className="w-[8%] text-right tabular-nums">Dials</TableHead>
            <TableHead className="w-[10%]">SMS</TableHead>
            <TableHead className="w-[14%]">Speed to lead</TableHead>
            <TableHead className="w-[14%]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((lead) => {
            const isUntouched = lead.dialCount === 0 && SMS_LABEL[lead.smsStatus] === "—";
            return (
              <TableRow
                key={lead.leadId}
                className={
                  "cursor-pointer hover:bg-muted/50 " +
                  (isUntouched ? "bg-amber-50/50 dark:bg-amber-950/10" : "")
                }
                onClick={() => onRowClick(lead.leadId)}
              >
                <TableCell>
                  <div className="font-medium">
                    {lead.name || "Unnamed"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {lead.email || lead.phone || "—"}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {lead.assignedToName ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {formatRelativeDuration(Date.now() - lead.dateAdded)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {lead.dialCount}
                </TableCell>
                <TableCell className="text-sm">
                  {SMS_LABEL[lead.smsStatus]}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {lead.firstDialAt !== undefined
                    ? formatDuration(lead.firstDialAt - lead.dateAdded)
                    : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge lead={lead} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function StatusBadge({ lead }: { lead: LeadRow }) {
  if (lead.isConnected) {
    return (
      <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-400">
        Connected
      </Badge>
    );
  }
  if (lead.dialCount === 0 && lead.smsStatus === "none") {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-500">
        Untouched
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      In progress
    </Badge>
  );
}

function formatRelativeDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const m = minutes % 60;
    return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h === 0 ? `${days}d` : `${days}d ${h}h`;
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const s = sec % 60;
    return s === 0 ? `${min}m` : `${min}m ${s}s`;
  }
  const hours = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
}
