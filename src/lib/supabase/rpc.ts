/**
 * RPC function name constants.
 *
 * Eliminates magic strings for Supabase RPC calls.
 * Names must match the Postgres function names in schema.sql exactly.
 */

export const RPC = {
  CREATE_SESSION: "create_session",
  END_SESSION: "end_session",
  RECORD_GAME: "record_game",
  GET_SESSION_STATS: "get_session_stats",
  GET_GROUP_STATS: "get_group_stats",
  GET_LAST_SESSION_ID: "get_last_session_id",
  GET_SESSION_PAIR_COUNTS: "get_session_pair_counts",
  APPLY_RATINGS_FOR_GAME: "apply_ratings_for_game",
  RECONCILE_MISSING_RATINGS: "reconcile_missing_ratings",
  VOID_LAST_GAME: "void_last_game",
  RECOMPUTE_SESSION_RATINGS: "recompute_session_ratings",
} as const;
