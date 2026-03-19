/**
 * GOAT (Greatest Of All Time) badge logic.
 *
 * Pure functions — no DB calls. Takes player data and returns
 * deterministic GOAT designations with full tiebreaker chains.
 *
 * Reigning GOAT: Highest current RDR among eligible players.
 *   Eligibility: games_rated >= 20, Math.round(current_rdr) >= 1400 (Elite).
 *   Tiebreakers: current_rdr → games_rated → win_pct → point_diff
 *                → rating_achieved_at (earlier wins) → player_id
 *
 * All-Time GOAT: Highest peak RDR ever recorded among eligible players.
 *   Eligibility: games_rated >= 50.
 *   Tiebreakers: peak_rdr → games_rated → current_rdr → win_pct
 *                → peak_rating_achieved_at (earlier wins) → player_id
 */

export interface GoatCandidate {
  player_id: string;
  current_rdr: number;
  peak_rdr: number;
  games_rated: number;
  win_pct: number;
  point_diff: number;
  peak_rating_achieved_at: string | null;
  rating_achieved_at: string | null;
}

/** Reigning GOAT eligibility: 20+ games rated AND Elite tier (rounded RDR >= 1400). */
export function isEligibleForReigningGoat(p: GoatCandidate): boolean {
  return p.games_rated >= 20 && Math.round(p.current_rdr) >= 1400;
}

/** All-Time GOAT eligibility: 50+ games rated. */
export function isEligibleForAllTimeGoat(p: GoatCandidate): boolean {
  return p.games_rated >= 50;
}

/**
 * Compare two timestamps where earlier is better.
 * Returns negative if a is earlier (better), positive if b is earlier.
 * null is treated as "infinitely late" (worst).
 */
function compareTimestamps(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Reigning GOAT: highest current RDR among eligible players.
 * Returns player_id or null if no one qualifies.
 */
export function getReigningGoat(players: GoatCandidate[]): string | null {
  const eligible = players.filter(isEligibleForReigningGoat);
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    // 1. Higher current RDR
    if (b.current_rdr !== a.current_rdr) return b.current_rdr - a.current_rdr;
    // 2. More games rated
    if (b.games_rated !== a.games_rated) return b.games_rated - a.games_rated;
    // 3. Higher win %
    if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct;
    // 4. Higher point differential
    if (b.point_diff !== a.point_diff) return b.point_diff - a.point_diff;
    // 5. Earlier timestamp reaching current rating
    const tsCmp = compareTimestamps(a.rating_achieved_at, b.rating_achieved_at);
    if (tsCmp !== 0) return tsCmp;
    // 6. Stable fallback: player_id (lexicographic, lower wins)
    return a.player_id < b.player_id ? -1 : 1;
  });

  return eligible[0].player_id;
}

/**
 * All-Time GOAT: highest peak RDR ever recorded among eligible players.
 * Returns player_id or null if no one qualifies.
 */
export function getAllTimeGoat(players: GoatCandidate[]): string | null {
  const eligible = players.filter(isEligibleForAllTimeGoat);
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    // 1. Higher peak RDR
    if (b.peak_rdr !== a.peak_rdr) return b.peak_rdr - a.peak_rdr;
    // 2. More games rated
    if (b.games_rated !== a.games_rated) return b.games_rated - a.games_rated;
    // 3. Higher current RDR
    if (b.current_rdr !== a.current_rdr) return b.current_rdr - a.current_rdr;
    // 4. Higher win %
    if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct;
    // 5. Earlier peak timestamp
    const tsCmp = compareTimestamps(a.peak_rating_achieved_at, b.peak_rating_achieved_at);
    if (tsCmp !== 0) return tsCmp;
    // 6. Stable fallback: player_id
    return a.player_id < b.player_id ? -1 : 1;
  });

  return eligible[0].player_id;
}

/**
 * Compute both GOAT designations from a single player list.
 * One player can hold both titles simultaneously.
 */
export function getGoatResult(players: GoatCandidate[]): {
  reigningGoatPlayerId: string | null;
  allTimeGoatPlayerId: string | null;
} {
  return {
    reigningGoatPlayerId: getReigningGoat(players),
    allTimeGoatPlayerId: getAllTimeGoat(players),
  };
}
