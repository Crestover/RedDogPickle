/**
 * Shared TypeScript interfaces used across the app.
 *
 * These map to Supabase table shapes and RPC return types.
 * Centralised here to eliminate duplicate interface definitions.
 *
 * Data source boundaries:
 *   - `player_ratings` table → authoritative current rating state
 *     (rating, RD, confidence, peak, reacclimation)
 *   - `get_group_stats` RPC → aggregated game stats
 *     (wins, losses, point diff, leaderboard ordering)
 *   - `get_session_stats` RPC → same but session-scoped
 *
 * The leaderboard UI gets confidence data from `player_ratings`,
 * not from the stats RPCs. `get_group_stats` returns rating_deviation
 * for future use (confidence-based sorting/filtering) but it is
 * currently unused by the UI.
 */

/**
 * Returned by get_session_stats and get_group_stats RPCs.
 *
 * `rating_deviation` and `last_played_at` are returned by
 * `get_group_stats` only (not `get_session_stats`). Included
 * here for forward compatibility but currently unused by the UI,
 * which reads confidence data from `player_ratings` directly.
 */
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
  rating_deviation?: number | null;
  last_played_at?: string | null;
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

/** Supported sport types. */
export type Sport = "pickleball" | "padel";

/** Core group fields. */
export interface Group {
  id: string;
  name: string;
  join_code: string;
  sport: Sport;
}

/**
 * Full player rating row from player_ratings table.
 *
 * Use this when you need the complete rating state (leaderboard pages,
 * GOAT computation). For session views that only need display fields,
 * use SessionRatingInfo instead to avoid querying unnecessary columns.
 */
export interface PlayerRating {
  group_id: string;
  player_id: string;
  rating: number;
  games_rated: number;
  provisional: boolean;
  peak_rating: number;
  peak_rating_achieved_at: string | null;
  rating_deviation: number;
  last_played_at: string | null;
  reacclimation_games_remaining: number;
  updated_at?: string;
}

/**
 * Subset of player_ratings used by session detail pages.
 *
 * Session views do not need GOAT-related fields (peak_rating,
 * peak_rating_achieved_at, updated_at) or group context (group_id).
 * This narrower type prevents accidental reliance on fields that
 * are not queried in session contexts.
 */
export interface SessionRatingInfo {
  player_id: string;
  rating: number;
  games_rated: number;
  provisional: boolean;
  rating_deviation: number;
  last_played_at: string | null;
  reacclimation_games_remaining: number;
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
