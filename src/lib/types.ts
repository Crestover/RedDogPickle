/**
 * Shared TypeScript interfaces used across the app.
 *
 * These map to Supabase table shapes and RPC return types.
 * Centralised here to eliminate duplicate interface definitions.
 */

/** Returned by get_session_stats and get_group_stats RPCs. */
export interface PlayerStats {
  player_id: string;
  display_name: string;
  code: string;
  games_played: number;
  games_won: number;
  win_pct: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  avg_point_diff: number;
}

/** Returned by get_session_pair_counts RPC. */
export interface PairCount {
  player_a_id: string;
  player_a_name: string;
  player_b_id: string;
  player_b_name: string;
  games_together: number;
}

/** Core player fields used in attendee lists and team selectors. */
export interface Player {
  id: string;
  display_name: string;
  code: string;
}

/** Core group fields. */
export interface Group {
  id: string;
  name: string;
  join_code: string;
}

/** Player Elo rating from player_ratings table. */
export interface PlayerRating {
  group_id: string;
  player_id: string;
  rating: number;
  games_rated: number;
  provisional: boolean;
}

/** Session row shape from sessions table. */
export interface Session {
  id: string;
  name: string;
  session_date: string;
  started_at: string;
  ended_at: string | null;
  closed_reason: string | null;
}
