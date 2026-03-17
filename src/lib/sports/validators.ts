/**
 * Shared pure scoring validators — client-safe.
 *
 * These functions contain the actual rule logic. Both SportConfig
 * implementations (server) and UI components (client) import from
 * here, ensuring a single source of truth with no serialization issues.
 *
 * Every function takes explicit parameters — no hidden sport assumptions.
 */

import type { ValidationResult } from "./types";

/**
 * Validate that a game score is legal.
 *
 * Rules enforced:
 * - No negative scores
 * - Scores cannot be equal (no ties)
 * - Winning score must meet or exceed target points
 */
export function validateScores(
  scoreA: number,
  scoreB: number,
  targetPoints: number
): ValidationResult {
  if (scoreA < 0 || scoreB < 0) {
    return { valid: false, error: "Scores cannot be negative.", code: "NEGATIVE_SCORE" };
  }
  if (scoreA === scoreB) {
    return { valid: false, error: "Scores cannot be equal.", code: "SCORES_EQUAL" };
  }
  const winner = Math.max(scoreA, scoreB);
  if (winner < targetPoints) {
    return {
      valid: false,
      error: `Winning score must be at least ${targetPoints} (got ${winner}).`,
      code: "BELOW_TARGET",
    };
  }
  return { valid: true };
}

/**
 * Detect a suspicious overtime score.
 *
 * Returns true when the winning score exceeds the target AND the
 * margin is greater than the expected win-by amount (2).
 * This is a soft warning — it does not block recording.
 */
export function isSuspiciousScore(
  scoreA: number,
  scoreB: number,
  targetPoints: number
): boolean {
  const w = Math.max(scoreA, scoreB);
  const l = Math.min(scoreA, scoreB);
  return w > targetPoints && (w - l) > 2;
}

/**
 * Detect a shutout — one team scored 0 while the other met the target.
 */
export function isShutout(
  scoreA: number,
  scoreB: number,
  targetPoints: number
): boolean {
  return Math.min(scoreA, scoreB) === 0 && Math.max(scoreA, scoreB) >= targetPoints;
}
