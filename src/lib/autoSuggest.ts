/**
 * Auto-suggest algorithm for Courts Mode.
 *
 * Pure functions, no side effects, deterministic given the same inputs.
 *
 * Algorithm:
 *   Step A — Select players: Sort by (games_played ASC, last_played ASC),
 *            pick the first `courtCount * 4` active players.
 *   Step B — Form teams: For each court's 4 players, enumerate the 3
 *            possible 2v2 splits, pick the one that minimizes repeat-partner
 *            penalty (using pair counts from the session).
 *   Step C — Assign courts sequentially.
 */

// ── Types ─────────────────────────────────────────────────────

/** A completed (non-voided) game record from the session. */
export interface GameRecord {
  id: string;
  /** Player IDs on team A */
  teamAIds: string[];
  /** Player IDs on team B */
  teamBIds: string[];
  played_at: string;
}

/** A single court assignment produced by the algorithm. */
export interface CourtAssignment {
  courtIndex: number;
  teamA: string[];
  teamB: string[];
}

/** Pair count data (from get_session_pair_counts RPC or local computation). */
export interface PairCountEntry {
  player_a_id: string;
  player_b_id: string;
  games_together: number;
}

// ── Helpers ───────────────────────────────────────────────────

/** Canonical pair key (alphabetical order). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Build a lookup map from pair count entries. */
function buildPairMap(pairs: PairCountEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of pairs) {
    map.set(pairKey(p.player_a_id, p.player_b_id), p.games_together);
  }
  return map;
}

/** Compute partner penalty for a given 2-player team. Lower is better. */
function teamPenalty(team: string[], pairMap: Map<string, number>): number {
  if (team.length !== 2) return 0;
  return pairMap.get(pairKey(team[0], team[1])) ?? 0;
}

/**
 * Given 4 players, return all 3 possible 2v2 splits.
 * Each split is [teamA[2], teamB[2]].
 */
function enumerate2v2Splits(
  players: string[]
): [string[], string[]][] {
  const [a, b, c, d] = players;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

// ── Player stats for sorting ──────────────────────────────────

interface PlayerSortInfo {
  playerId: string;
  gamesPlayed: number;
  /** Timestamp of the last game this player participated in. 0 if never played. */
  lastPlayedAt: number;
}

function computePlayerSortInfo(
  playerIds: string[],
  games: GameRecord[]
): PlayerSortInfo[] {
  const infoMap = new Map<string, PlayerSortInfo>();

  for (const pid of playerIds) {
    infoMap.set(pid, { playerId: pid, gamesPlayed: 0, lastPlayedAt: 0 });
  }

  for (const game of games) {
    const allPlayers = [...game.teamAIds, ...game.teamBIds];
    const ts = new Date(game.played_at).getTime();

    for (const pid of allPlayers) {
      const info = infoMap.get(pid);
      if (info) {
        info.gamesPlayed++;
        if (ts > info.lastPlayedAt) {
          info.lastPlayedAt = ts;
        }
      }
    }
  }

  return Array.from(infoMap.values());
}

// ── Main algorithm ────────────────────────────────────────────

/**
 * Auto-suggest court assignments.
 *
 * @param games      Non-voided games from this session.
 * @param activePlayerIds  IDs of players available to play (not inactive-toggled).
 * @param courtCount Number of courts.
 * @param pairCounts Session pair counts (from RPC or local).
 * @returns          Array of CourtAssignment, one per court.
 */
export function autoSuggest(
  games: GameRecord[],
  activePlayerIds: string[],
  courtCount: number,
  pairCounts: PairCountEntry[]
): CourtAssignment[] {
  const neededPlayers = courtCount * 4;
  const pairMap = buildPairMap(pairCounts);

  // Step A: Select players — fewest games first, then least recently played
  const sortInfo = computePlayerSortInfo(activePlayerIds, games);
  sortInfo.sort((a, b) => {
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    return a.lastPlayedAt - b.lastPlayedAt;
  });

  const selected = sortInfo.slice(0, neededPlayers).map((s) => s.playerId);

  // Step B + C: Chunk into groups of 4 and form best teams for each court
  const assignments: CourtAssignment[] = [];

  for (let i = 0; i < courtCount; i++) {
    const startIdx = i * 4;
    const courtPlayers = selected.slice(startIdx, startIdx + 4);

    if (courtPlayers.length < 4) {
      // Not enough players for this court — skip
      break;
    }

    // Enumerate all 3 splits, pick the one with the lowest total partner penalty
    const splits = enumerate2v2Splits(courtPlayers);
    let bestSplit = splits[0];
    let bestPenalty = Infinity;

    for (const [teamA, teamB] of splits) {
      const penalty = teamPenalty(teamA, pairMap) + teamPenalty(teamB, pairMap);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestSplit = [teamA, teamB];
      }
    }

    assignments.push({
      courtIndex: i,
      teamA: bestSplit[0],
      teamB: bestSplit[1],
    });
  }

  return assignments;
}

/**
 * Reshuffle teams: keep the same selected players on each court,
 * but recompute the best 2v2 split for each.
 */
export function reshuffleTeams(
  currentAssignments: CourtAssignment[],
  pairCounts: PairCountEntry[]
): CourtAssignment[] {
  const pairMap = buildPairMap(pairCounts);

  return currentAssignments.map((court) => {
    const courtPlayers = [...court.teamA, ...court.teamB];
    if (courtPlayers.length !== 4) return court;

    const splits = enumerate2v2Splits(courtPlayers);
    let bestSplit = splits[0];
    let bestPenalty = Infinity;

    for (const [teamA, teamB] of splits) {
      const penalty = teamPenalty(teamA, pairMap) + teamPenalty(teamB, pairMap);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestSplit = [teamA, teamB];
      }
    }

    return {
      courtIndex: court.courtIndex,
      teamA: bestSplit[0],
      teamB: bestSplit[1],
    };
  });
}

/**
 * Reselect players: re-run the full algorithm from Step A.
 * This is equivalent to calling autoSuggest() again.
 */
export function reselectPlayers(
  games: GameRecord[],
  activePlayerIds: string[],
  courtCount: number,
  pairCounts: PairCountEntry[]
): CourtAssignment[] {
  return autoSuggest(games, activePlayerIds, courtCount, pairCounts);
}

/**
 * Suggest assignments for specific courts (Courts Mode V2).
 *
 * Semantic wrapper around autoSuggest() that maps court numbers
 * to court indices in the returned assignments.
 *
 * @param games            Non-voided games from this session.
 * @param activePlayerIds  IDs of ACTIVE players not on IN_PROGRESS courts.
 * @param courtNumbers     Court numbers to fill (1-indexed).
 * @param pairCounts       Session pair counts.
 * @returns Array of assignments with courtNumber (1-indexed) instead of courtIndex.
 */
export function suggestForCourts(
  games: GameRecord[],
  activePlayerIds: string[],
  courtNumbers: number[],
  pairCounts: PairCountEntry[]
): { courtNumber: number; teamA: string[]; teamB: string[] }[] {
  const assignments = autoSuggest(games, activePlayerIds, courtNumbers.length, pairCounts);

  return assignments.map((a, i) => ({
    courtNumber: courtNumbers[i],
    teamA: a.teamA,
    teamB: a.teamB,
  }));
}
