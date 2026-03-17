/** Canonical pair key for two player IDs (alphabetical order). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
