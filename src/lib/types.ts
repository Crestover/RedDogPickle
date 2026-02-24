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
  rdr?: number | null;
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

/** Player rating from player_ratings table. */
export interface PlayerRating {
  group_id: string;
  player_id: string;
  rating: number;
  games_rated: number;
  provisional: boolean;
}

/** RDR delta returned by record_game / record_court_game. */
export interface RdrDelta {
  player_id: string;
  delta: number;
  rdr_after: number;
}

/** Session-level game rules. */
export interface SessionRules {
  target_points: number;
  win_by: number;
}

/** Session row shape from sessions table. */
export interface Session {
  id: string;
  name: string;
  session_date: string;
  started_at: string;
  ended_at: string | null;
  closed_reason: string | null;
  target_points_default: number;
  win_by_default: number;
}

/** Court row shape from session_courts table. */
export interface CourtData {
  id: string;
  court_number: number;
  status: "OPEN" | "IN_PROGRESS";
  team_a_ids: (string | null)[] | null; // null = uninitialized, array may contain nulls for partial fills
  team_b_ids: (string | null)[] | null;
  assigned_at: string | null;
  last_game_id: string | null;
}

/** Session attendee with active/inactive status (from session_players). */
export interface AttendeeWithStatus {
  id: string;
  display_name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE";
  inactive_effective_after_game: boolean;
}

/** Standardized RPC result shape. All courts RPCs return this. */
export interface RpcResult<T = unknown> {
  ok: boolean;
  error?: { code: string; message: string };
  data?: T;
}
