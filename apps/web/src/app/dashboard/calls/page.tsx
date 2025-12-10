import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mockCompletedCalls, formatDuration, formatCurrency } from "@/lib/mock-data";

function formatDate(date: Date): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  const nowOnly = new Date(now);
  nowOnly.setHours(0, 0, 0, 0);
  const yesterdayOnly = new Date(yesterday);
  yesterdayOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === nowOnly.getTime()) {
    return `Today, ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return `Yesterday, ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}

function getOutcomeBadge(outcome: string) {
  switch (outcome) {
    case "CLOSED":
      return <Badge variant="default">Closed</Badge>;
    case "NOT_CLOSED":
      return <Badge variant="secondary">Not Closed</Badge>;
    case "NO_SHOW":
      return <Badge variant="outline">No-Show</Badge>;
    case "RESCHEDULED":
      return <Badge variant="secondary">Rescheduled</Badge>;
    default:
      return <Badge variant="secondary">{outcome}</Badge>;
  }
}

export default function CompletedCallsPage() {
  return (
    <>
      <Header
        title="Completed Calls"
        description="Review past calls, recordings, and outcomes"
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px]">Date</TableHead>
                  <TableHead>Closer</TableHead>
                  <TableHead>Prospect</TableHead>
                  <TableHead className="w-[100px]">Duration</TableHead>
                  <TableHead className="w-[120px]">Outcome</TableHead>
                  <TableHead className="w-[100px] text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockCompletedCalls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer"
                  >
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(call.date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {call.closerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{call.closerName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {call.prospectName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {call.duration > 0 ? formatDuration(call.duration) : "—"}
                    </TableCell>
                    <TableCell>{getOutcomeBadge(call.outcome)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {call.dealValue ? formatCurrency(call.dealValue) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
