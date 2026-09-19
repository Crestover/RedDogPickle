/**
 * Shared pure padel set-scoring validators — client-safe.
 *
 * Padel is recorded one set at a time (each recording = one set, rated
 * independently, same granularity as one pickleball game). A set is won
 * by reaching 6 games with a 2-game lead. Straight win-by-2, no tiebreak
 * and no cap — sets can extend indefinitely (6-0 through 6-4 end
 * immediately at 6; from 5-5 on, the set continues until someone is
 * ahead by exactly 2, e.g. 7-5, 8-6, 9-7, 10-8, ...).
 */

import type { ValidationResult } from "./types";

/** Games needed to win a standard padel set (before extension rules kick in). */
export const PADEL_SET_TARGET = 6;

/**
 * Validate that a padel set score is legal.
 *
 * Rules enforced:
 * - No negative scores
 * - Scores cannot be equal (no ties)
 * - Loser <= 4: winner must be exactly 6 (the set ends the moment 6 is
 *   reached, since a 2-game lead is already guaranteed)
 * - Loser >= 5: winner must be exactly loser + 2 (the set only stops at
 *   the first point a 2-game lead is reached — no upper bound)
 */
export function validatePadelScores(
  scoreA: number,
  scoreB: number
): ValidationResult {
  if (scoreA < 0 || scoreB < 0) {
    return { valid: false, error: "Scores cannot be negative.", code: "NEGATIVE_SCORE" };
  }
  if (scoreA === scoreB) {
    return { valid: false, error: "Scores cannot be equal.", code: "SCORES_EQUAL" };
  }

  const winner = Math.max(scoreA, scoreB);
  const loser = Math.min(scoreA, scoreB);

  const validForLoser = loser <= 4 ? winner === 6 : winner === loser + 2;

  if (!validForLoser) {
    return {
      valid: false,
      error: `${winner}–${loser} isn’t a valid padel set score. Sets go to 6, win by 2 (e.g. 7–5, 9–7).`,
      code: "INVALID_SET_SCORE",
    };
  }

  return { valid: true };
}

/**
 * Detect a shutout — a "bagel" set, 6-0.
 */
export function isPadelShutout(scoreA: number, scoreB: number): boolean {
  return Math.min(scoreA, scoreB) === 0 && Math.max(scoreA, scoreB) === PADEL_SET_TARGET;
}

/**
 * Padel has no "suspicious overtime" concept — every score accepted by
 * validatePadelScores is already a legal, unremarkable set result.
 */
export function isPadelSuspiciousScore(): boolean {
  return false;
}
