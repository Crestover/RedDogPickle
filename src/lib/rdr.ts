/**
 * RDR (Red Dog Rating) tier utilities.
 *
 * Cosmetic tier system based on player rating.
 * Thresholds use Math.round(rating) to avoid "Elite at 1399.6" confusion.
 */

export type RdrTier = "Walk-On" | "Challenger" | "Contender" | "All-Star" | "Elite";

/** Map a numeric RDR rating to its cosmetic tier. */
export function getTier(rdr: number): RdrTier {
  const rounded = Math.round(rdr);
  if (rounded < 1100) return "Walk-On";
  if (rounded < 1200) return "Challenger";
  if (rounded < 1300) return "Contender";
  if (rounded < 1400) return "All-Star";
  return "Elite";
}

/** Tailwind classes for each tier's badge. */
export function tierColor(tier: RdrTier): string {
  switch (tier) {
    case "Walk-On":
      return "bg-gray-100 text-gray-600";
    case "Challenger":
      return "bg-blue-100 text-blue-700";
    case "Contender":
      return "bg-green-100 text-green-700";
    case "All-Star":
      return "bg-yellow-100 text-yellow-700";
    case "Elite":
      return "bg-red-100 text-red-700";
  }
}
