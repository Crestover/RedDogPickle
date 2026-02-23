/**
 * Inline Pairing Feedback — shared pure functions.
 *
 * Used by RecordGameForm (standard session) and CourtsManager (courts mode)
 * to show partner and opponent matchup counts with dot-indicator severity.
 */

import type { GameRecord } from "@/lib/autoSuggest";

// ── Matchup key ──────────────────────────────────────────────

/**
 * Canonical pair key for two player IDs (alphabetical order).
 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Canonical matchup key for a 4-player game (exact team-vs-team).
 *
 * This represents the EXACT partner-pair matchup:
 *   - Same two partners on one side AND same two partners on the other.
 *   - Order-insensitive WITHIN each team (Alice-Bob = Bob-Alice).
 *   - Bidirectional ACROSS teams (TeamA vs TeamB = TeamB vs TeamA).
 *
 * This is NOT "same four players regardless of partner split".
 * A future enhancement could add that metric separately.
 *
 * Format: "lo_pair|hi_pair" where each pair is "id1:id2" (sorted),
 * and the two pair strings are sorted relative to each other.
 */
export function matchupKey(
  teamA: [string, string],
  teamB: [string, string]
): string {
  const pA = pairKey(teamA[0], teamA[1]);
  const pB = pairKey(teamB[0], teamB[1]);
  return pA < pB ? `${pA}|${pB}` : `${pB}|${pA}`;
}

// ── Matchup counting ─────────────────────────────────────────

/**
 * Count how many times this exact team-vs-team matchup has occurred
 * in the provided game records.
 *
 * Caller should pass non-voided games only, but as a defensive measure
 * this function also skips any game whose teamAIds or teamBIds is not
 * exactly length 2 (which would indicate malformed or non-standard data).
 *
 * Only call this when both teams are fully selected (2+2 = 4 players).
 */
export function getMatchupCount(
  teamA: string[],
  teamB: string[],
  games: GameRecord[]
): number {
  if (teamA.length !== 2 || teamB.length !== 2) return 0;

  const targetKey = matchupKey(
    [teamA[0], teamA[1]],
    [teamB[0], teamB[1]]
  );

  let count = 0;
  for (const game of games) {
    if (game.teamAIds.length !== 2 || game.teamBIds.length !== 2) continue;
    const gameKey = matchupKey(
      [game.teamAIds[0], game.teamAIds[1]],
      [game.teamBIds[0], game.teamBIds[1]]
    );
    if (gameKey === targetKey) count++;
  }
  return count;
}

// ── Severity dot ─────────────────────────────────────────────

/**
 * Tailwind background class for the severity dot.
 *
 *   N = 0  → muted green  (fresh pairing)
 *   N = 1  → neutral gray (normal)
 *   N >= 2 → muted amber  (repeat caution)
 *
 * Never red.
 */
export function severityDotClass(count: number): string {
  if (count === 0) return "bg-emerald-500";
  if (count === 1) return "bg-gray-400";
  return "bg-amber-500";
}
