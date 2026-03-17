/**
 * Shared display formatting helpers.
 */

/** Format a numeric diff with explicit +/- sign. */
export function formatDiff(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

/**
 * Shorten a display name to "First L." format.
 *
 * "Joe Smith"        → "Joe S."
 * "Mike"             → "Mike"
 * "Sam Lee"          → "Sam L."
 * "Mary Jane Watson" → "Mary W."
 */
export function shortName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? displayName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
