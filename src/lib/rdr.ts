/**
 * RDR (Red Dog Rating) tier utilities.
 *
 * Cosmetic tier system based on player rating.
 * Thresholds use Math.round(rating) to avoid "Architect at 1399.6" confusion.
 */

export type RdrTier = "Observer" | "Practitioner" | "Strategist" | "Authority" | "Architect";

/** Map a numeric RDR rating to its cosmetic tier. */
export function getTier(rdr: number): RdrTier {
  const rounded = Math.round(rdr);
  if (rounded < 1100) return "Observer";
  if (rounded < 1200) return "Practitioner";
  if (rounded < 1300) return "Strategist";
  if (rounded < 1400) return "Authority";
  return "Architect";
}

/** Tailwind classes for each tier's badge. */
export function tierColor(tier: RdrTier): string {
  switch (tier) {
    case "Observer":
      return "bg-gray-100 text-gray-600";
    case "Practitioner":
      return "bg-blue-100 text-blue-700";
    case "Strategist":
      return "bg-green-100 text-green-700";
    case "Authority":
      return "bg-yellow-100 text-yellow-700";
    case "Architect":
      return "bg-red-100 text-red-700";
  }
}
