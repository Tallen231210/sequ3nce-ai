import React from 'react';
import type { MoneyBellsBroadcastPost } from '../../../convex';

export interface MoneyBellsTickerProps {
  broadcasts: MoneyBellsBroadcastPost[];
}

function formatCashShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) {
    const rounded = Math.round(n / 100) / 10;
    return rounded === Math.floor(rounded) ? `$${rounded}k` : `$${rounded.toFixed(1)}k`;
  }
  return `$${n.toLocaleString()}`;
}

function timeAgoShort(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'NOW';
  if (mins < 60) return `${mins}M`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H`;
  return `${Math.floor(hrs / 24)}D`;
}

export function MoneyBellsTicker({ broadcasts }: MoneyBellsTickerProps) {
  if (broadcasts.length === 0) return null;

  // Repeat the sequence twice for seamless infinite scroll
  const items = [...broadcasts.slice(0, 10), ...broadcasts.slice(0, 10)];

  return (
    <div className="bg-[#171717] text-white rounded-md overflow-hidden mb-4 border border-[#262626]">
      <div className="mb-ticker-inner py-2 font-mono text-[11px] font-semibold uppercase tracking-wider">
        {items.map((post, i) => (
          <span key={`${post._id}-${i}`} className="pr-10">
            <span className="opacity-60">▲</span> {post.authorName.toUpperCase()} CLOSED <b className="font-extrabold text-[#fde047]">+{formatCashShort(post.broadcastData.cashCollected)}</b> <span className="opacity-50">· {timeAgoShort(post.broadcastData.broadcastedAt)} ·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
