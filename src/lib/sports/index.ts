/**
 * Sport configuration registry.
 *
 * Resolves a sport identifier to its SportConfig implementation.
 * Phase 1: "padel" temporarily maps to pickleballConfig.
 * Phase 2 will add a dedicated padel.ts with set-based scoring.
 */

import type { Sport } from "@/lib/types";
import type { SportConfig } from "./types";
import { pickleballConfig } from "./pickleball";

const sportRegistry: Record<Sport, SportConfig> = {
  pickleball: pickleballConfig,
  padel: pickleballConfig, // TEMPORARY: padel uses pickleball rules until Phase 2
};

/**
 * Resolve sport configuration by sport identifier.
 * Throws if the sport is unknown (should never happen with DB CHECK constraint).
 */
export function getSportConfig(sport: Sport): SportConfig {
  const config = sportRegistry[sport];
  if (!config) {
    throw new Error(`Unknown sport: ${sport}`);
  }
  return config;
}

/** Re-export types for convenience. */
export type { SportConfig, ValidationResult } from "./types";
