/**
 * Padel sport configuration.
 *
 * Single-set-per-recording: each RecordGameForm submission represents one
 * set (e.g. 6-2), rated independently — same granularity as one pickleball
 * game. Reuses the `games` table as-is (team_a_score/team_b_score = games
 * won in the set); no schema change needed. Validation delegates to
 * padelValidators.ts, which encodes padel's actual win condition (first to
 * 6 games, straight win-by-2, no tiebreak/cap) instead of pickleball's
 * target/win-by-1 rules.
 *
 * Rating inputs reuse the same margin-factor mechanics as pickleball —
 * ABS(scoreA - scoreB) is meaningful for both "point diff" and "games-won
 * diff" — just tuned differently in the RDR margin-factor tiers, since a
 * padel set's diff is usually small (most sets settle at exactly 2).
 */

import type { SportConfig } from "./types";
import { deriveOutcome } from "./validators";
import {
  validatePadelScores,
  isPadelShutout,
  isPadelSuspiciousScore,
  PADEL_SET_TARGET,
} from "./padelValidators";

export const padelConfig: SportConfig = {
  sport: "padel",
  displayName: "Padel",

  // ── Sport-specific constants ──────────────────────────────────
  // Padel sets are always played to 6 games (win by 2, 7-6 tiebreak) —
  // a single fixed preset, unlike pickleball's 11/15/21 choice.
  targetPresets: [PADEL_SET_TARGET],
  winByOptions: [2],
  defaultTargetPoints: PADEL_SET_TARGET,
  defaultWinBy: 2,
  playersPerTeam: 2,
  playersPerCourt: 4,
  maxCourts: 8,

  // ── Validation ────────────────────────────────────────────────
  // targetPoints is ignored — a padel set's win condition is fixed,
  // not configurable per session like pickleball's target presets.
  validateScores: (scoreA, scoreB) => validatePadelScores(scoreA, scoreB),
  isSuspiciousScore: () => isPadelSuspiciousScore(),
  isShutout: (scoreA, scoreB) => isPadelShutout(scoreA, scoreB),

  // ── Outcome derivation (sport-agnostic — higher score wins) ────
  deriveOutcome,

  // ── Rating inputs ─────────────────────────────────────────────
  computeRatingInputs(params: { scoreA: number; scoreB: number }) {
    return {
      gameDiff: Math.abs(params.scoreA - params.scoreB),
    };
  },
};
