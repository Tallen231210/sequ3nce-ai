// Typed wrappers around the /b2c/stream/* HTTP endpoints. Used by the
// StreamModal UI and (in the future) any other part of the renderer that
// needs to read or mutate Stream state.

const CONVEX_SITE_URL = 'https://ideal-ram-982.convex.site';

export interface StreamSettings {
  _id: string;
  _creationTime: number;
  b2cUserId: string;
  hotkey: string;
  hasCompletedOnboarding?: boolean;
  enabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StreamTranscription {
  _id: string;
  _creationTime: number;
  b2cUserId: string;
  text: string;
  durationSec?: number;
  createdAt: number;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function fetchStreamSettings(b2cUserId: string): Promise<StreamSettings | null> {
  const res = await fetch(`${CONVEX_SITE_URL}/b2c/stream/settings?userId=${encodeURIComponent(b2cUserId)}`);
  const payload = await parseJson<{ settings: StreamSettings | null }>(res);
  return payload.settings;
}

export async function saveStreamSettings(
  b2cUserId: string,
  hotkey: string,
  hasCompletedOnboarding?: boolean,
  enabled?: boolean,
): Promise<void> {
  const res = await fetch(`${CONVEX_SITE_URL}/b2c/stream/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ b2cUserId, hotkey, hasCompletedOnboarding, enabled }),
  });
  await parseJson<{ id: string }>(res);
}

export async function fetchStreamHistory(
  b2cUserId: string,
  limit?: number,
): Promise<StreamTranscription[]> {
  const url = new URL(`${CONVEX_SITE_URL}/b2c/stream/history`);
  url.searchParams.set('userId', b2cUserId);
  if (limit) url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  const payload = await parseJson<{ transcriptions: StreamTranscription[] }>(res);
  return payload.transcriptions;
}

export async function deleteStreamTranscription(
  b2cUserId: string,
  transcriptionId: string,
): Promise<void> {
  const res = await fetch(`${CONVEX_SITE_URL}/b2c/stream/history/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ b2cUserId, transcriptionId }),
  });
  await parseJson<{ deleted: boolean }>(res);
}

export async function deleteAllStreamHistory(b2cUserId: string): Promise<void> {
  const res = await fetch(`${CONVEX_SITE_URL}/b2c/stream/history/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ b2cUserId, all: true }),
  });
  await parseJson<{ deleted: number }>(res);
}
