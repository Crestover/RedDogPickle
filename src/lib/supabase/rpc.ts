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
  VOID_LAST_GAME: "void_last_game",
  UNDO_GAME: "undo_game",
  SET_SESSION_RULES: "set_session_rules",

  // Courts Mode V2
  INIT_COURTS: "init_courts",
  ASSIGN_COURTS: "assign_courts",
  START_COURT_GAME: "start_court_game",
  RECORD_COURT_GAME: "record_court_game",
  UPDATE_COURT_ASSIGNMENT: "update_court_assignment",
  CLEAR_COURT_SLOT: "clear_court_slot",
  MARK_PLAYER_OUT: "mark_player_out",
  MAKE_PLAYER_ACTIVE: "make_player_active",
  UPDATE_COURT_COUNT: "update_court_count",

  // View-Only Codes
  ENSURE_VIEW_CODE: "ensure_view_code",
} as const;
