"use client";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SetterRow {
  ghlUserId: string;
  name: string;
  leadCount: number;
  dialCount: number;
  connectedCount: number;
  avgSpeedMs: number | null;
  appointmentCount: number;
  showedCount: number;
  showRate: number | null;
}

interface SetterLeaderboardProps {
  rows: SetterRow[];
  onRowClick?: (ghlUserId: string) => void;
}

export function SetterLeaderboard({
  rows,
  onRowClick,
}: SetterLeaderboardProps) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[6%] text-right tabular-nums">#</TableHead>
            <TableHead className="w-[22%]">Setter</TableHead>
            <TableHead className="w-[10%] text-right tabular-nums">Leads</TableHead>
            <TableHead className="w-[10%] text-right tabular-nums">Dials</TableHead>
            <TableHead className="w-[14%] text-right tabular-nums">
              Connect rate
            </TableHead>
            <TableHead className="w-[12%] text-right tabular-nums">
              Appts
            </TableHead>
            <TableHead className="w-[12%] text-right tabular-nums">
              Show rate
            </TableHead>
            <TableHead className="w-[14%] text-right tabular-nums">
              Avg speed
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            const connectRate =
              row.leadCount > 0 ? row.connectedCount / row.leadCount : null;
            const isClickable = !!onRowClick;
            return (
              <TableRow
                key={row.ghlUserId}
                className={isClickable ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={isClickable ? () => onRowClick!(row.ghlUserId) : undefined}
              >
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {idx + 1}
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.leadCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.dialCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {connectRate !== null ? (
                    <>
                      {Math.round(connectRate * 100)}%
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({row.connectedCount}/{row.leadCount})
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.appointmentCount > 0 ? (
                    <>
                      {row.appointmentCount}
                      {row.showedCount > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({row.showedCount} showed)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.showRate !== null ? (
                    `${Math.round(row.showRate * 100)}%`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.avgSpeedMs !== null ? (
                    formatDuration(row.avgSpeedMs)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
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
