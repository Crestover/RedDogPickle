/**
 * Pickleball sport configuration.
 *
 * Single source of truth for all pickleball-specific rules:
 * score validation, suspicious overtime detection, shutout detection,
 * outcome derivation, rating inputs, and sport constants.
 *
 * Validation methods delegate to shared pure validators in validators.ts.
 * This keeps the actual rule logic in one place while allowing both
 * server (SportConfig) and client (direct import) to use it.
 */

import type { SportConfig } from "./types";
import {
  validateScores,
  isSuspiciousScore,
  isShutout,
  deriveOutcome,
} from "./validators";

export const pickleballConfig: SportConfig = {
  sport: "pickleball",
  displayName: "Pickleball",

  // ── Sport-specific constants ──────────────────────────────────
  targetPresets: [11, 15, 21],
  winByOptions: [1, 2],
  defaultTargetPoints: 11,
  defaultWinBy: 2,
  playersPerTeam: 2,
  playersPerCourt: 4,
  maxCourts: 8,

  // ── Validation (delegates to shared validators) ─────────────────
  validateScores,
  isSuspiciousScore,
  isShutout,

  // ── Outcome derivation (delegates to shared validator) ─────────
  deriveOutcome,

  // ── Rating inputs ─────────────────────────────────────────────

  computeRatingInputs(params: {
    scoreA: number;
    scoreB: number;
    targetPoints: number;
  }) {
    return {
      gameDiff: Math.abs(params.scoreA - params.scoreB),
    };
  },
};
