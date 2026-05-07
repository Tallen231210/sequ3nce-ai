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
}

interface SetterLeaderboardProps {
  rows: SetterRow[];
}

export function SetterLeaderboard({ rows }: SetterLeaderboardProps) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[8%] text-right tabular-nums">#</TableHead>
            <TableHead className="w-[28%]">Setter</TableHead>
            <TableHead className="w-[14%] text-right tabular-nums">Leads</TableHead>
            <TableHead className="w-[14%] text-right tabular-nums">Dials</TableHead>
            <TableHead className="w-[18%] text-right tabular-nums">
              Connection rate
            </TableHead>
            <TableHead className="w-[18%] text-right tabular-nums">
              Avg speed to lead
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            const connectRate =
              row.leadCount > 0 ? row.connectedCount / row.leadCount : null;
            return (
              <TableRow key={row.ghlUserId}>
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
                      {row.connectedCount}/{row.leadCount}
                      <span className="ml-2 text-muted-foreground">
                        ({Math.round(connectRate * 100)}%)
                      </span>
                    </>
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
