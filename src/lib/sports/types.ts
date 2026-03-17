/**
 * Sport abstraction layer — type definitions.
 *
 * Every sport (pickleball, padel, etc.) implements SportConfig.
 * Core flows (validation, outcome derivation, rating inputs) are
 * routed through these methods instead of being hardcoded.
 */

import type { Sport } from "@/lib/types";

/** Structured validation result from score validation. */
export interface ValidationResult {
  valid: boolean;
  /** Human-readable error message. Present only when valid=false. */
  error?: string;
  /** Machine-readable error code (e.g. "SCORES_EQUAL", "BELOW_TARGET"). */
  code?: string;
}

/** Sport-specific configuration and logic. */
export interface SportConfig {
  /** Sport identifier. */
  sport: Sport;

  /** Human-readable sport name. */
  displayName: string;

  // ── Sport-specific constants ──────────────────────────────────

  /** Allowed target point presets (e.g., [11, 15, 21] for pickleball). */
  targetPresets: readonly number[];

  /** Allowed win-by options (e.g., [1, 2] for pickleball). */
  winByOptions: readonly number[];

  /** Default target points for new sessions. */
  defaultTargetPoints: number;

  /** Default win-by for new sessions. */
  defaultWinBy: number;

  /** Players per team. */
  playersPerTeam: number;

  /** Players per court (playersPerTeam * 2). */
  playersPerCourt: number;

  /** Maximum courts. */
  maxCourts: number;

  // ── Validation ────────────────────────────────────────────────

  /**
   * Validate that a score result is legal.
   * Returns { valid: true } if OK, or { valid: false, error, code } if invalid.
   */
  validateScores(
    scoreA: number,
    scoreB: number,
    targetPoints: number
  ): ValidationResult;

  /**
   * Detect a suspicious overtime score (soft warning, does not block).
   * For pickleball: winning score > target AND margin > 2.
   */
  isSuspiciousScore(
    scoreA: number,
    scoreB: number,
    targetPoints: number
  ): boolean;

  /**
   * Detect a shutout (one team scored 0, other met target).
   */
  isShutout(
    scoreA: number,
    scoreB: number,
    targetPoints: number
  ): boolean;

  // ── Outcome derivation ────────────────────────────────────────

  /**
   * Derive which team won from the scores.
   * Assumes scores have already been validated.
   */
  deriveOutcome(
    scoreA: number,
    scoreB: number
  ): {
    winner: "A" | "B";
    loser: "A" | "B";
  };

  // ── Rating inputs ─────────────────────────────────────────────

  /**
   * Compute sport-specific inputs for the rating system.
   * Minimal stub for Phase 1. Padel (Phase 2) will return set-based inputs.
   */
  computeRatingInputs(params: {
    scoreA: number;
    scoreB: number;
    targetPoints: number;
  }): {
    /** Absolute score margin. */
    gameDiff: number;
  };
}
