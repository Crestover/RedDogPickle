-- ============================================================
-- RedDogPickle — Canonical Schema (source of truth)
-- ============================================================
-- This file represents the complete DB state after all
-- migrations through M5. Run from scratch on an empty DB
-- (after tables, constraints, indexes, and RLS are in place)
-- to recreate all views and functions.
--
-- Tables, constraints, indexes, and RLS policies are managed
-- via the Supabase dashboard / initial setup and are NOT
-- repeated here. This file covers:
--   - Views
--   - Functions / RPCs
--   - Grants
-- ============================================================

-- 0. Drop existing functions to prevent "return type" conflicts
DROP FUNCTION IF EXISTS public.get_group_stats(text, integer);
DROP FUNCTION IF EXISTS public.get_session_stats(uuid);
DROP FUNCTION IF EXISTS public.record_game(uuid, uuid[], uuid[], integer, integer, boolean);
DROP FUNCTION IF EXISTS public.end_session(uuid);

-- ============================================================
-- VIEWS
-- ============================================================

-- vw_player_game_stats — normalise each game into per-player rows
-- Used by get_session_stats and get_group_stats.
-- Codified in migration m5_group_leaderboards.sql (was previously
-- applied directly in Supabase during M4.2).
CREATE OR REPLACE VIEW public.vw_player_game_stats AS
SELECT
  gp.player_id,
  gp.game_id,
  g.session_id,
  gp.team,
  g.played_at,
  CASE
    WHEN gp.team = 'A' AND g.team_a_score > g.team_b_score THEN 1
    WHEN gp.team = 'B' AND g.team_b_score > g.team_a_score THEN 1
    ELSE 0
  END::bigint                                               AS is_win,
  CASE WHEN gp.team = 'A' THEN g.team_a_score
       ELSE g.team_b_score END                              AS points_for,
  CASE WHEN gp.team = 'A' THEN g.team_b_score
       ELSE g.team_a_score END                              AS points_against
FROM public.game_players gp
JOIN public.games g ON g.id = gp.game_id;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- 1. End Session (M2)
CREATE OR REPLACE FUNCTION public.end_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $BODY$
BEGIN
  UPDATE public.sessions SET ended_at = now(), closed_reason = 'manual'
  WHERE id = p_session_id AND ended_at IS NULL;
END;
$BODY$;

-- 2. Record Game (M4 + M4.1)
CREATE OR REPLACE FUNCTION public.record_game(
  p_session_id uuid, p_team_a_ids uuid[], p_team_b_ids uuid[],
  p_team_a_score integer, p_team_b_score integer, p_force boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_game_id uuid;
  v_seq integer;
  v_lo text; v_hi text; v_score text; v_fingerprint text;
  v_dup_id uuid; v_dup_at timestamptz;
BEGIN
  v_lo := (SELECT string_agg(x::text, ',') FROM (SELECT unnest(p_team_a_ids) AS x ORDER BY x) AS s);
  v_hi := (SELECT string_agg(x::text, ',') FROM (SELECT unnest(p_team_b_ids) AS x ORDER BY x) AS s);
  v_score := LEAST(p_team_a_score, p_team_b_score) || ':' || GREATEST(p_team_a_score, p_team_b_score);
  v_fingerprint := ENCODE(DIGEST(CONVERT_TO(v_lo || '|' || v_hi || '|' || v_score, 'UTF8'), 'sha256'::text), 'hex'::text);

  IF NOT p_force THEN
    SELECT id, created_at INTO v_dup_id, v_dup_at FROM public.games
    WHERE session_id = p_session_id AND dedupe_key = v_fingerprint AND created_at >= NOW() - INTERVAL '15 minutes'
    LIMIT 1;
    IF v_dup_id IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'possible_duplicate', 'existing_game_id', v_dup_id, 'existing_created_at', v_dup_at);
    END IF;
  END IF;

  SELECT COALESCE(MAX(sequence_num), 0) + 1 INTO v_seq FROM public.games WHERE session_id = p_session_id;
  INSERT INTO public.games (session_id, sequence_num, team_a_score, team_b_score, dedupe_key)
  VALUES (p_session_id, v_seq, p_team_a_score, p_team_b_score, v_fingerprint)
  RETURNING id INTO v_game_id;

  INSERT INTO public.game_players (game_id, player_id, team) SELECT v_game_id, id, 'A' FROM UNNEST(p_team_a_ids) AS id;
  INSERT INTO public.game_players (game_id, player_id, team) SELECT v_game_id, id, 'B' FROM UNNEST(p_team_b_ids) AS id;

  RETURN jsonb_build_object('status', 'inserted', 'game_id', v_game_id);
END;
$BODY$;

-- 3. Get Session Stats (M4.2, codified M5)
CREATE OR REPLACE FUNCTION public.get_session_stats(p_session_id uuid)
RETURNS TABLE (
    player_id    uuid,
    games_played bigint,
    wins         bigint,
    point_diff   bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
BEGIN
    RETURN QUERY
    SELECT
        v.player_id,
        COUNT(v.game_id),
        SUM(v.is_win),
        SUM(v.points_for - v.points_against)
    FROM public.vw_player_game_stats v
    WHERE v.session_id = p_session_id
    GROUP BY v.player_id
    ORDER BY SUM(v.is_win) DESC, SUM(v.points_for - v.points_against) DESC;
END;
$func$;

-- 4. Get Group Stats (M5)
CREATE OR REPLACE FUNCTION public.get_group_stats(
  p_join_code text,
  p_days      integer DEFAULT NULL
)
RETURNS TABLE (
  player_id      uuid,
  display_name   text,
  code           text,
  games_played   bigint,
  games_won      bigint,
  win_pct        numeric(5,1),
  points_for     bigint,
  points_against bigint,
  point_diff     bigint,
  avg_point_diff numeric(5,1)
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
  v_group_id uuid;
BEGIN
  -- Resolve group
  SELECT g.id INTO v_group_id
    FROM public.groups g
   WHERE g.join_code = lower(p_join_code);

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Group not found for join_code: %', p_join_code;
  END IF;

  RETURN QUERY
  SELECT
    v.player_id,
    p.display_name,
    p.code,
    COUNT(*)::bigint                                          AS games_played,
    SUM(v.is_win)::bigint                                     AS games_won,
    ROUND(SUM(v.is_win) * 100.0 / COUNT(*), 1)               AS win_pct,
    SUM(v.points_for)::bigint                                 AS points_for,
    SUM(v.points_against)::bigint                             AS points_against,
    SUM(v.points_for - v.points_against)::bigint              AS point_diff,
    ROUND(SUM(v.points_for - v.points_against) * 1.0
          / COUNT(*), 1)                                      AS avg_point_diff
  FROM public.vw_player_game_stats v
  JOIN public.sessions s ON s.id = v.session_id
  JOIN public.players  p ON p.id = v.player_id
  WHERE s.group_id = v_group_id
    AND (p_days IS NULL
         OR v.played_at >= now() - make_interval(days => p_days))
  GROUP BY v.player_id, p.display_name, p.code
  ORDER BY win_pct DESC, games_won DESC, point_diff DESC, p.display_name ASC;
END;
$func$;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.end_session(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.record_game(uuid, uuid[], uuid[], integer, integer, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.get_session_stats(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_group_stats(text, integer) TO anon;

-- ============================================================
-- NOTES
-- ============================================================
-- Tables: groups, players, sessions, session_players, games, game_players
-- RLS: anon has SELECT + INSERT only; no UPDATE/DELETE for anon
-- games.dedupe_key: SHA-256 of sorted-teams|min:max-score (no time bucket)
--   Retained for auditability; NOT unique-constrained (M4.1)
--   15-min recency check in record_game RPC is the duplicate gate
-- pgcrypto extension required for DIGEST() in record_game
-- create_session RPC (M2) is SECURITY INVOKER; defined in m2_rpc_sessions.sql
