/**
 * Supabase query shape helpers.
 *
 * Supabase FK joins can return a related record as either
 * a single object T or an array T[] depending on the relationship
 * cardinality. This helper normalises both shapes to T | null.
 */

/**
 * Normalise a Supabase FK join result to a single value.
 *
 * - If array, returns first element (or null if empty).
 * - If nullish, returns null.
 * - Otherwise returns the value as-is.
 */
export function one<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  if (Array.isArray(x)) return x[0] ?? null;
  return x;
}
