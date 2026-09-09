export type FreeHireBoardDecision = boolean | null;

/**
 * `null` means the remote decision is pending or unavailable. The new board is
 * deliberately optimistic because it has its own curated-catalogue fallback;
 * only an explicit `false` from the flag service may select the legacy board.
 */
export function shouldRenderFreeHireBoard(
  decision: FreeHireBoardDecision,
): boolean {
  return decision !== false;
}

/** Keep the current decision when the response is missing or malformed. */
export function applyFreeHireBoardFlag(
  current: FreeHireBoardDecision,
  flags: Record<string, boolean> | null,
): FreeHireBoardDecision {
  const remoteDecision = flags?.freehire_job_board;
  return typeof remoteDecision === 'boolean' ? remoteDecision : current;
}

export function initialFreeHireBoardDecision(
  alwaysOn: boolean,
  hasLastKnownGood: boolean,
): FreeHireBoardDecision {
  return alwaysOn || hasLastKnownGood ? true : null;
}
