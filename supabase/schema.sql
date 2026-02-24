-- ============================================================
-- RedDogPickle — Canonical Schema (source of truth)
-- ============================================================
-- This file represents the complete DB state after all
-- migrations through M6. Run from scratch on an empty DB
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

-- 0. Drop existing objects to prevent conflicts on re-run
DROP FUNCTION IF EXISTS public.apply_ratings_for_game(uuid);
DROP FUNCTION IF EXISTS public.get_session_pair_counts(uuid);
DROP FUNCTION IF EXISTS public.get_last_session_id(text);
DROP FUNCTION IF EXISTS public.get_group_stats(text, integer);
DROP FUNCTION IF EXISTS public.get_session_stats(uuid);
DROP FUNCTION IF EXISTS public.record_game(uuid, uuid[], uuid[], integer, integer, boolean);
DROP FUNCTION IF EXISTS public.end_session(uuid);
DROP VIEW IF EXISTS public.vw_player_game_stats;

-- ============================================================
-- VIEWS
-- ============================================================

-- vw_player_game_stats — normalise each game into per-player rows
-- Used by get_session_stats and get_group_stats.
-- Codified in migration m5_group_leaderboards.sql (was previously
-- applied directly in Supabase during M4.2).
-- is_valid excludes garbage rows (NULL scores, ties, 0-0).
CREATE VIEW public.vw_player_game_stats AS
SELECT
  gp.player_id,
  gp.game_id,
  g.session_id,
  gp.team,
  g.played_at,
  -- is_valid: true when scores are non-null, unequal, and at least one > 0
  (   g.team_a_score IS NOT NULL
  AND g.team_b_score IS NOT NULL
  AND g.team_a_score <> g.team_b_score
  AND (g.team_a_score > 0 OR g.team_b_score > 0)
  )                                                         AS is_valid,
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
SET search_path = public, extensions
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

-- 3. Get Session Stats (M4.2, codified M5, extended M5.1)
--    Extended to 10 columns matching get_group_stats shape.
--    Aggregate-then-JOIN pattern; FILTER/HAVING/NULLIF/casting.
CREATE OR REPLACE FUNCTION public.get_session_stats(p_session_id uuid)
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
    avg_point_diff numeric(5,1),
    rdr            numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
  v_group_id uuid;
BEGIN
    -- Resolve group_id from session for player_ratings join
    SELECT s.group_id INTO v_group_id
      FROM public.sessions s
     WHERE s.id = p_session_id;

    RETURN QUERY
    SELECT
        agg.player_id,
        p.display_name,
        p.code,
        agg.games_played,
        agg.games_won,
        agg.win_pct,
        agg.points_for,
        agg.points_against,
        agg.point_diff,
        agg.avg_point_diff,
        pr.rating AS rdr
    FROM (
        SELECT
            v.player_id,
            COUNT(*)        FILTER (WHERE v.is_valid)::bigint       AS games_played,
            SUM(v.is_win)   FILTER (WHERE v.is_valid)::bigint       AS games_won,
            ROUND(
                SUM(v.is_win) FILTER (WHERE v.is_valid)::numeric * 100.0
                / NULLIF(COUNT(*) FILTER (WHERE v.is_valid)::numeric, 0),
                1
            )::numeric(5,1)                                         AS win_pct,
            SUM(v.points_for)  FILTER (WHERE v.is_valid)::bigint    AS points_for,
            SUM(v.points_against) FILTER (WHERE v.is_valid)::bigint AS points_against,
            SUM(v.points_for - v.points_against)
                              FILTER (WHERE v.is_valid)::bigint      AS point_diff,
            ROUND(
                SUM(v.points_for - v.points_against) FILTER (WHERE v.is_valid)::numeric
                / NULLIF(COUNT(*) FILTER (WHERE v.is_valid)::numeric, 0),
                1
            )::numeric(5,1)                                         AS avg_point_diff
        FROM public.vw_player_game_stats v
        WHERE v.session_id = p_session_id
        GROUP BY v.player_id
        HAVING COUNT(*) FILTER (WHERE v.is_valid) > 0
    ) agg
    INNER JOIN public.players p ON p.id = agg.player_id
    LEFT JOIN public.player_ratings pr
      ON pr.group_id = v_group_id AND pr.player_id = agg.player_id
    ORDER BY
      agg.win_pct DESC,
      agg.point_diff DESC,
      pr.rating DESC NULLS LAST,
      p.display_name ASC;
END;
$func$;

-- 4. Get Group Stats (M5 / M10.0 / M10.1)
--    Day-anchored cutoff: CURRENT_DATE - p_days (stable within day)
--    INNER JOIN players AFTER aggregation
--    HAVING games_played > 0
--    p_sort_by: 'rdr' → RDR primary; 'win_pct' → win% primary
CREATE OR REPLACE FUNCTION public.get_group_stats(
  p_join_code text,
  p_days      integer DEFAULT NULL,
  p_sort_by   text    DEFAULT 'win_pct'
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
  avg_point_diff numeric(5,1),
  rdr            numeric
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
    agg.player_id,
    p.display_name,
    p.code,
    agg.games_played,
    agg.games_won,
    agg.win_pct,
    agg.points_for,
    agg.points_against,
    agg.point_diff,
    agg.avg_point_diff,
    pr.rating AS rdr
  FROM (
    SELECT
      v.player_id,
      COUNT(*)        FILTER (WHERE v.is_valid)::bigint       AS games_played,
      SUM(v.is_win)   FILTER (WHERE v.is_valid)::bigint       AS games_won,
      ROUND(
        SUM(v.is_win) FILTER (WHERE v.is_valid)::numeric * 100.0
        / NULLIF(COUNT(*) FILTER (WHERE v.is_valid)::numeric, 0),
        1
      )::numeric(5,1)                                         AS win_pct,
      SUM(v.points_for)  FILTER (WHERE v.is_valid)::bigint    AS points_for,
      SUM(v.points_against) FILTER (WHERE v.is_valid)::bigint AS points_against,
      SUM(v.points_for - v.points_against)
                        FILTER (WHERE v.is_valid)::bigint      AS point_diff,
      ROUND(
        SUM(v.points_for - v.points_against) FILTER (WHERE v.is_valid)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE v.is_valid)::numeric, 0),
        1
      )::numeric(5,1)                                         AS avg_point_diff
    FROM public.vw_player_game_stats v
    JOIN public.sessions s ON s.id = v.session_id
    WHERE s.group_id = v_group_id
      AND (p_days IS NULL
           OR v.played_at >= (CURRENT_DATE - p_days)::timestamptz)
    GROUP BY v.player_id
    HAVING COUNT(*) FILTER (WHERE v.is_valid) > 0
  ) agg
  INNER JOIN public.players p ON p.id = agg.player_id
  LEFT JOIN public.player_ratings pr
    ON pr.group_id = v_group_id AND pr.player_id = agg.player_id
  ORDER BY
    CASE WHEN p_sort_by = 'rdr' THEN pr.rating   ELSE agg.win_pct  END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'rdr' THEN agg.win_pct ELSE agg.point_diff END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'rdr' THEN agg.point_diff ELSE pr.rating END DESC NULLS LAST,
    p.display_name ASC;
END;
$func$;

-- 5. Get Last Session ID (M5.1)
--    Returns most recently ended session UUID for a group.
--    Returns NULL if no ended sessions exist.
CREATE OR REPLACE FUNCTION public.get_last_session_id(p_join_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
    v_group_id uuid;
    v_session_id uuid;
BEGIN
    SELECT g.id INTO v_group_id
      FROM public.groups g
     WHERE g.join_code = lower(p_join_code);

    IF v_group_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT s.id INTO v_session_id
      FROM public.sessions s
     WHERE s.group_id = v_group_id
       AND s.ended_at IS NOT NULL
     ORDER BY s.ended_at DESC
     LIMIT 1;

    RETURN v_session_id;
END;
$func$;

-- 6. Get Session Pair Counts (M5.2)
--    Returns every attendee pair with same-team game count.
--    Includes 0-count pairs. Sorted fewest-first, then by name.
CREATE OR REPLACE FUNCTION public.get_session_pair_counts(p_session_id uuid)
RETURNS TABLE (
    player_a_id    uuid,
    player_a_name  text,
    player_b_id    uuid,
    player_b_name  text,
    games_together bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
BEGIN
    RETURN QUERY
    WITH attendees AS (
        SELECT sp.player_id, p.display_name
          FROM public.session_players sp
          JOIN public.players p ON p.id = sp.player_id
         WHERE sp.session_id = p_session_id
    ),
    all_pairs AS (
        SELECT a.player_id  AS a_id,
               a.display_name AS a_name,
               b.player_id  AS b_id,
               b.display_name AS b_name
          FROM attendees a
         CROSS JOIN attendees b
         WHERE a.player_id < b.player_id
    ),
    played_pairs AS (
        SELECT LEAST(gp1.player_id, gp2.player_id)    AS p1,
               GREATEST(gp1.player_id, gp2.player_id) AS p2,
               COUNT(*)::bigint                        AS cnt
          FROM public.game_players gp1
          JOIN public.game_players gp2
            ON gp1.game_id = gp2.game_id
           AND gp1.team    = gp2.team
           AND gp1.player_id < gp2.player_id
          JOIN public.games g
            ON g.id = gp1.game_id
         WHERE g.session_id = p_session_id
         GROUP BY LEAST(gp1.player_id, gp2.player_id),
                  GREATEST(gp1.player_id, gp2.player_id)
    )
    SELECT ap.a_id,
           ap.a_name,
           ap.b_id,
           ap.b_name,
           COALESCE(pp.cnt, 0)::bigint AS games_together
      FROM all_pairs ap
      LEFT JOIN played_pairs pp
        ON pp.p1 = ap.a_id
       AND pp.p2 = ap.b_id
     ORDER BY COALESCE(pp.cnt, 0) ASC,
              ap.a_name ASC,
              ap.b_name ASC;
END;
$func$;

-- 7. Apply Ratings for Game (M6)
--    SECURITY DEFINER — idempotent Elo calculation.
--    K = 40 if provisional (games_rated < 5), else K = 20.
--    Team rating = AVG of 2 players. No margin-of-victory.
--    See m6_elo_v1.sql for full implementation.
--    (Full function body in migration file; abbreviated reference here.)

-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.end_session(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.record_game(uuid, uuid[], uuid[], integer, integer, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.get_session_stats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_stats(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_session_id(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_pair_counts(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ratings_for_game(uuid) TO anon;

-- ============================================================
-- INDEXES (M5.3 + M6)
-- ============================================================
-- Mirrors supabase/migrations/m5.3_indexes.sql for from-scratch builds.
-- Supabase auto-creates PK indexes but NOT FK indexes.
CREATE INDEX IF NOT EXISTS idx_games_session_id
  ON public.games(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group_id
  ON public.sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id
  ON public.game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_session_players_session_id
  ON public.session_players(session_id);

-- M6 Elo indexes (mirrors m6_elo_v1.sql)
CREATE INDEX IF NOT EXISTS idx_rating_events_game_id
  ON public.rating_events(game_id);
CREATE INDEX IF NOT EXISTS idx_rating_events_player_id
  ON public.rating_events(player_id);
CREATE INDEX IF NOT EXISTS idx_player_ratings_group_id
  ON public.player_ratings(group_id);

-- ============================================================
-- NOTES
-- ============================================================
-- Tables: groups, players, sessions, session_players, games, game_players,
--         player_ratings (M6), rating_events (M6)
-- RLS: anon has SELECT + INSERT only; no UPDATE/DELETE for anon
--       player_ratings + rating_events: anon SELECT only (writes via SECURITY DEFINER RPC)
-- games.dedupe_key: SHA-256 of sorted-teams|min:max-score (no time bucket)
--   Retained for auditability; NOT unique-constrained (M4.1)
--   15-min recency check in record_game RPC is the duplicate gate
-- pgcrypto extension required for DIGEST() in record_game
-- create_session RPC (M2) is SECURITY INVOKER; defined in m2_rpc_sessions.sql
-- vw_player_game_stats.is_valid: excludes garbage rows (NULL scores, ties, 0-0)
--   All aggregates use FILTER (WHERE is_valid) to skip invalid data
-- "Last 30 days" uses day-anchored cutoff: CURRENT_DATE - p_days (stable within day)
-- Elo v1 (M6): fire-and-forget after record_game; idempotent via EXISTS + UNIQUE constraint
--   K = 40 if games_rated < 5 (provisional), K = 20 otherwise; team avg rating; no MOV
