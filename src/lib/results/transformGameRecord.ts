import type { GameRecord } from "@/lib/autoSuggest";

/**
 * Raw game row shape from Supabase queries with game_players join.
 * Accepts both typed and loosely-typed rows.
 */
export interface RawGameRow {
  id: string;
  played_at: string;
  voided_at?: string | null;
  game_players?: { player_id: string; team: string }[] | unknown;
}

/**
 * Transform raw game rows (from Supabase) into GameRecord[].
 * Filters out voided games and normalizes game_players to teamAIds/teamBIds.
 */
export function transformGameRecords(rawGames: RawGameRow[]): GameRecord[] {
  return rawGames
    .filter((g) => !g.voided_at)
    .map((g) => {
      const gps = Array.isArray(g.game_players)
        ? (g.game_players as { player_id: string; team: string }[])
        : [];
      return {
        id: g.id,
        teamAIds: gps
          .filter((gp) => gp.team === "A")
          .map((gp) => gp.player_id),
        teamBIds: gps
          .filter((gp) => gp.team === "B")
          .map((gp) => gp.player_id),
        played_at: g.played_at,
      };
    });
}
