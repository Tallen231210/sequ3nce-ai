"use client";

import { useState } from "react";

interface LeaderboardRow {
  closerId: string;
  name: string;
  email: string;
  calls: number;
  closed: number;
  closeRate: number;
  cashCollected: number;
  avgDealSize: number;
}

type SortKey = "closeRate" | "calls" | "closed" | "cashCollected" | "avgDealSize";

export function CloserLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("closeRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...rows].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(next);
      setSortDir("desc");
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No closers with calls in this range.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="py-1 font-medium">Closer</th>
          <Th onClick={() => toggleSort("calls")} active={sortKey === "calls"} dir={sortDir}>
            Calls
          </Th>
          <Th onClick={() => toggleSort("closed")} active={sortKey === "closed"} dir={sortDir}>
            Closed
          </Th>
          <Th onClick={() => toggleSort("closeRate")} active={sortKey === "closeRate"} dir={sortDir}>
            Close rate
          </Th>
          <Th onClick={() => toggleSort("cashCollected")} active={sortKey === "cashCollected"} dir={sortDir}>
            Cash collected
          </Th>
          <Th onClick={() => toggleSort("avgDealSize")} active={sortKey === "avgDealSize"} dir={sortDir}>
            Avg deal
          </Th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.closerId} className="border-t">
            <td className="py-1">
              <div>{row.name}</div>
              <div className="text-xs text-muted-foreground">{row.email}</div>
            </td>
            <td className="py-1">{row.calls}</td>
            <td className="py-1">{row.closed}</td>
            <td className="py-1">{`${(row.closeRate * 100).toFixed(1)}%`}</td>
            <td className="py-1">{`$${row.cashCollected.toLocaleString()}`}</td>
            <td className="py-1">{`$${Math.round(row.avgDealSize).toLocaleString()}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th className="py-1 font-medium">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 ${active ? "text-foreground" : ""}`}
      >
        {children}
        {active && <span>{dir === "desc" ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}
