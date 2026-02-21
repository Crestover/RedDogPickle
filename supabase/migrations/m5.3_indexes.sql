-- M5.3 — Performance indexes on foreign-key columns.
-- Idempotent: safe to run multiple times.
-- See docs/indexes.md for rationale.

CREATE INDEX IF NOT EXISTS idx_games_session_id
  ON public.games(session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_group_id
  ON public.sessions(group_id);

CREATE INDEX IF NOT EXISTS idx_game_players_game_id
  ON public.game_players(game_id);

CREATE INDEX IF NOT EXISTS idx_session_players_session_id
  ON public.session_players(session_id);
