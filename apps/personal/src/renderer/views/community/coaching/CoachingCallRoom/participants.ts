// Helpers that walk Daily's participant list and pull out the per-participant
// metadata we care about (session id, user name, parsed userData).
//
// Two functions used to do this independently in different files:
//   - findCoachSessionId      — was in FocusModeTypes.ts
//   - buildSpotlightCandidates — was inline in CoachingCallRoom.tsx
// Both did the same userData JSON parse and the same coach-by-b2cUserId match.
// They now share parseParticipants() as a single iterator.
//
// userData handshake: clients broadcast `{ b2cUserId, photoUrl }` via
// daily.setUserData() after joining. Older clients may not have done so yet,
// in which case b2cUserId/photoUrl come back as null.

import type { DailyCall } from '@daily-co/daily-js';
import type { SpotlightCandidate } from '../SpotlightPickerModal';

export interface ParsedParticipant {
  sessionId: string;
  userName: string;
  photoUrl: string | null;
  b2cUserId: string | null;
  isLocal: boolean;
}

export function parseParticipants(daily: DailyCall | null): ParsedParticipant[] {
  if (!daily) return [];
  const participants = daily.participants();
  const localId = participants.local?.session_id;
  const out: ParsedParticipant[] = [];
  for (const p of Object.values(participants)) {
    if (!p) continue;
    let photoUrl: string | null = null;
    let b2cUserId: string | null = null;
    const raw = p.userData;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object') {
          if ('photoUrl' in parsed && typeof (parsed as { photoUrl: unknown }).photoUrl === 'string') {
            photoUrl = (parsed as { photoUrl: string }).photoUrl;
          }
          if (
            'b2cUserId' in parsed &&
            typeof (parsed as { b2cUserId: unknown }).b2cUserId === 'string'
          ) {
            b2cUserId = (parsed as { b2cUserId: string }).b2cUserId;
          }
        }
      } catch {
        // malformed userData — leave fields as null
      }
    }
    out.push({
      sessionId: p.session_id,
      userName: p.user_name || 'Guest',
      photoUrl,
      b2cUserId,
      isLocal: p.session_id === localId,
    });
  }
  return out;
}

// Returns the coach's session id, matching by userData.b2cUserId. Falls back
// to the first id in `sortedIds` (joined-at order) when no participant has
// broadcast a matching b2cUserId yet — coach-likely since the coach starts
// the call. Returns null only when the participant list is empty.
export function findCoachSessionId(
  parsed: ParsedParticipant[],
  sortedIds: string[],
  coachUserId: string,
): string | null {
  for (const p of parsed) {
    if (p.b2cUserId === coachUserId) return p.sessionId;
  }
  return sortedIds[0] ?? null;
}

// Non-coach, non-local attendee list for the Spotlight / Role Play pickers.
// Excludes: local (coach is usually local when this is called), and anyone
// whose userData.b2cUserId matches the coach's id (safety against edge cases
// where the coach has the "coach" badge but isn't `local`).
export function buildSpotlightCandidates(
  parsed: ParsedParticipant[],
  coachUserId: string,
): SpotlightCandidate[] {
  const out: SpotlightCandidate[] = [];
  for (const p of parsed) {
    if (p.isLocal) continue;
    if (p.b2cUserId === coachUserId) continue;
    out.push({
      sessionId: p.sessionId,
      userName: p.userName,
      photoUrl: p.photoUrl,
    });
  }
  return out;
}
