-- ============================================================
-- M10.1: Fix Leaderboard Sorting (all three views)
--
-- Last Session:  win_pct DESC → point_diff DESC → rdr DESC → name ASC
-- 30-Day / All:  rdr DESC → win_pct DESC → point_diff DESC → name ASC
--
-- Changes:
--   1. get_session_stats: add rdr column, JOIN player_ratings, fix ORDER BY
--   2. get_group_stats: fix ORDER BY for rdr mode (proper secondary sorts)
-- ============================================================


-- ── 1. Replace get_session_stats ────────────────────────────
-- Need DROP because return type is changing (adding rdr column).

DROP FUNCTION IF EXISTS public.get_session_stats(uuid);

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

GRANT EXECUTE ON FUNCTION public.get_session_stats(uuid) TO anon, authenticated;


-- ── 2. Replace get_group_stats (fix ORDER BY for rdr mode) ──
-- Return type unchanged, so CREATE OR REPLACE is fine.

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

GRANT EXECUTE ON FUNCTION public.get_group_stats(text, integer, text) TO anon, authenticated;
