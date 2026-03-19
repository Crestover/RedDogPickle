/**
 * RDR (Red Dog Rating) tier and confidence utilities.
 *
 * Cosmetic tier system based on player rating.
 * Thresholds use Math.round(rating) to avoid "Elite at 1399.6" confusion.
 *
 * Confidence system (v2) based on rating deviation (RD).
 * RD is a hidden uncertainty measure: lower = more confident.
 * Constants: RD_MIN=50, RD_MAX=140.
 */

export type RdrTier = "Walk-On" | "Challenger" | "Contender" | "All-Star" | "Elite";

export type ConfidenceLabel = "Locked In" | "Active" | "Rusty" | "Returning";

/** Map a numeric RDR rating to its cosmetic tier. */
export function getTier(rdr: number): RdrTier {
  const rounded = Math.round(rdr);
  if (rounded < 1100) return "Walk-On";
  if (rounded < 1200) return "Challenger";
  if (rounded < 1300) return "Contender";
  if (rounded < 1400) return "All-Star";
  return "Elite";
}

/** Compute confidence score (0–1) from rating deviation. Higher = more confident. */
export function getConfidence(rd: number): number {
  return Math.max(0, Math.min(1, 1 - (rd - 50) / 90));
}

/** Map confidence score to a human-readable label. */
export function getConfidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.85) return "Locked In";
  if (confidence >= 0.65) return "Active";
  if (confidence >= 0.40) return "Rusty";
  return "Returning";
}

/** Short description for each confidence label (used in tooltips / title attrs). */
export function confidenceHint(label: ConfidenceLabel): string {
  switch (label) {
    case "Locked In": return "Playing regularly. Rating is well-established.";
    case "Active":    return "Playing often enough. Rating is reliable.";
    case "Rusty":     return "Haven\u2019t played recently. Rating may adjust faster on return.";
    case "Returning": return "Been away a while. Rating will adjust faster over the next few games.";
  }
}

/** Tailwind text color classes for each confidence label. */
export function confidenceColor(label: ConfidenceLabel): string {
  switch (label) {
    case "Locked In": return "text-green-600";
    case "Active":    return "text-gray-500";
    case "Rusty":     return "text-yellow-600";
    case "Returning": return "text-orange-500";
  }
}

/** Tailwind classes for each tier's badge. */
export function tierColor(tier: RdrTier): string {
  switch (tier) {
    case "Walk-On":
      return "bg-zinc-100 border border-zinc-200 text-zinc-500 font-medium";
    case "Challenger":
      return "bg-zinc-100 border border-zinc-300 text-zinc-600 font-semibold";
    case "Contender":
      return "bg-zinc-100 border border-zinc-300 text-zinc-700 font-semibold";
    case "All-Star":
      return "bg-zinc-100 border border-zinc-400 text-zinc-900 font-semibold";
    case "Elite":
      return "bg-zinc-100 border border-zinc-500 text-zinc-950 font-bold";
  }
}
