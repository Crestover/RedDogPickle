-- ============================================================
-- Milestone 5 — Group Leaderboards & Stats
-- ============================================================
-- Codifies all M4.2 + M5 database artifacts in version control:
-- 1. CREATE OR REPLACE VIEW vw_player_game_stats
--    (was applied directly in Supabase during M4.2; now in VCS)
--    Added: is_valid flag to exclude garbage/invalid rows
-- 2. CREATE OR REPLACE FUNCTION get_session_stats(p_session_id)
--    (was applied directly in Supabase during M4.2; now in VCS)
--    Updated: FILTER (WHERE is_valid) on all aggregates
-- 3. CREATE FUNCTION get_group_stats(p_join_code, p_days)
--    New M5 RPC — group-wide leaderboard with optional
--    day-anchored time-range filter.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. View: normalise each game into per-player rows
--    is_valid excludes garbage rows (NULL scores, ties, 0-0)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_player_game_stats AS
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

-- ────────────────────────────────────────────────────────────
-- 2. RPC: session leaderboard (codify M4.2 artifact)
--    Updated to use FILTER (WHERE is_valid) on aggregates
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_session_stats(uuid);

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
        COUNT(*)        FILTER (WHERE v.is_valid)::bigint,
        SUM(v.is_win)   FILTER (WHERE v.is_valid)::bigint,
        SUM(v.points_for - v.points_against)
                        FILTER (WHERE v.is_valid)::bigint
    FROM public.vw_player_game_stats v
    WHERE v.session_id = p_session_id
    GROUP BY v.player_id
    HAVING COUNT(*) FILTER (WHERE v.is_valid) > 0
    ORDER BY
        SUM(v.is_win)   FILTER (WHERE v.is_valid) DESC,
        SUM(v.points_for - v.points_against)
                        FILTER (WHERE v.is_valid) DESC;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_session_stats(uuid) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. RPC: group-wide leaderboard (new for M5)
--    Day-anchored cutoff: CURRENT_DATE - p_days (stable within day)
--    FILTER (WHERE is_valid) on all aggregates
--    INNER JOIN players AFTER aggregation
--    HAVING games_played > 0
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_group_stats(text, integer);

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
    agg.player_id,
    p.display_name,
    p.code,
    agg.games_played,
    agg.games_won,
    agg.win_pct,
    agg.points_for,
    agg.points_against,
    agg.point_diff,
    agg.avg_point_diff
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
  ORDER BY agg.win_pct DESC, agg.games_won DESC, agg.point_diff DESC, p.display_name ASC;
END;
$func$;

-- ────────────────────────────────────────────────────────────
-- 4. Grants
-- ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_group_stats(text, integer) TO anon, authenticated;
