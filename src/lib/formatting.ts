/**
 * Shared display formatting helpers.
 */

/** Format a numeric diff with explicit +/- sign. */
export function formatDiff(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
}
