/**
 * RDR (Red Dog Rating) tier utilities.
 *
 * Cosmetic tier system based on player rating.
 * Thresholds use Math.round(rating) to avoid "Alpha at 1399.6" confusion.
 */

export type RdrTier = "Pup" | "Scrapper" | "Tracker" | "Top Dog" | "Alpha";

/** Map a numeric RDR rating to its cosmetic tier. */
export function getTier(rdr: number): RdrTier {
  const rounded = Math.round(rdr);
  if (rounded < 1100) return "Pup";
  if (rounded < 1200) return "Scrapper";
  if (rounded < 1300) return "Tracker";
  if (rounded < 1400) return "Top Dog";
  return "Alpha";
}

/** Tailwind classes for each tier's badge. */
export function tierColor(tier: RdrTier): string {
  switch (tier) {
    case "Pup":
      return "bg-gray-100 text-gray-600";
    case "Scrapper":
      return "bg-blue-100 text-blue-700";
    case "Tracker":
      return "bg-green-100 text-green-700";
    case "Top Dog":
      return "bg-yellow-100 text-yellow-700";
    case "Alpha":
      return "bg-red-100 text-red-700";
  }
}
