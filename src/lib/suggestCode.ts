/**
 * suggestCode
 *
 * Pure utility: derive a suggested player code from a display name.
 * Takes the first letter of each word, uppercased, up to 3 chars.
 * Single-word names use the first 3 characters instead.
 *
 * Examples:
 *   "John Doe"         → "JD"   (2 words → 2 initials)
 *   "John Doe Roe"     → "JDR"  (3 words → 3 initials)
 *   "Bob van der Berg" → "BVD"  (first 3 words → 3 initials)
 *   "Alice"            → "ALI"  (single word → first 3 chars)
 *
 * Non-alphanumeric characters are stripped from the result.
 */
export function suggestCode(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  let code = "";
  if (words.length === 1) {
    // Single word: take first 3 letters
    code = words[0].substring(0, 3).toUpperCase();
  } else {
    // Multi-word: first letter of each word, up to 3
    code = words
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return code.replace(/[^A-Z0-9]/g, "");
}
