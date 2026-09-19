/**
 * Sport configuration registry.
 *
 * Resolves a sport identifier to its SportConfig implementation.
 */

import type { Sport } from "@/lib/types";
import type { SportConfig } from "./types";
import { pickleballConfig } from "./pickleball";
import { padelConfig } from "./padel";

const sportRegistry: Record<Sport, SportConfig> = {
  pickleball: pickleballConfig,
  padel: padelConfig,
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
