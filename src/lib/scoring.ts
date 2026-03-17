/**
 * Shared scoring validation helpers.
 */

/**
 * Detect a suspicious overtime score — winning score is above the target
 * AND the margin exceeds 2 (normal overtime games are won by exactly 2).
 *
 * This is a soft warning only; it does not block recording.
 */
export function isSuspiciousOvertimeScore(
  scoreA: number,
  scoreB: number,
  targetPoints: number
): boolean {
  const w = Math.max(scoreA, scoreB);
  const l = Math.min(scoreA, scoreB);
  return w > targetPoints && (w - l) > 2;
}
