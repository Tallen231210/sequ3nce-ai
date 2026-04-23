// Shared types for the Objection Battle Royale game. Lives in its own file
// so both CoachingCallRoom (state owner) and the sub-components (modals,
// overlays, coach panel) import from one source of truth.

export interface BRSubmission {
  /** Random id generated on the submitter's client. Used for dedup + vote keys. */
  id: string;
  /** Daily session id of the submitter. */
  sessionId: string;
  /** Display name (from Daily token). Used for author reveal on br-complete. */
  from: string;
  /** The rebuttal text. */
  text: string;
  /** Submitted-at epoch ms — used for tiebreak (earlier wins on vote-tie). */
  at: number;
}

/** Anonymized entry used during the voting phase — we reveal author names
 *  only on br-complete. */
export interface BRReveal {
  id: string;
  text: string;
  /** Hidden until complete; set to the author's display name only in br-complete payloads. */
  from?: string;
}

export type BattleRoyaleState =
  | { phase: 'idle' }
  | {
      // Attendee view while submit timer is running.
      phase: 'submitting';
      objection: string;
      submitEndTime: number;
      voteSec: number; // vote phase duration, broadcast by coach
      myText: string;
      mySubmissionId: string | null; // null until submitted
    }
  | {
      // Coach view during submit phase — sees live submission count.
      phase: 'submitting-coach';
      objection: string;
      submitEndTime: number;
      voteSec: number;
      received: BRSubmission[];
    }
  | {
      // Coach-only: picking 3 finalists from the received submissions.
      phase: 'reviewing';
      objection: string;
      voteSec: number;
      received: BRSubmission[];
      selected: Set<string>; // submission ids the coach has picked
    }
  | {
      // Everyone votes on 3 anonymized reveals.
      phase: 'voting';
      objection: string;
      reveals: BRReveal[];
      voteEndTime: number;
      /** revealId -> vote count (locally aggregated from br-vote messages). */
      votes: Record<string, number>;
      /** This client's chosen reveal id (can change once). */
      myVote: string | null;
    }
  | {
      // Winner announced with author revealed. Auto-dismisses after 6s.
      phase: 'complete';
      objection: string;
      winner: BRReveal;
    };
