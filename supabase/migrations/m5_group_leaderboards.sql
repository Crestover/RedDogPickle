-- ============================================================
-- Milestone 5 — Group Leaderboards & Stats
-- ============================================================
-- Codifies all M4.2 + M5 database artifacts in version control:
-- 1. CREATE OR REPLACE VIEW vw_player_game_stats
--    (was applied directly in Supabase during M4.2; now in VCS)
-- 2. CREATE OR REPLACE FUNCTION get_session_stats(p_session_id)
--    (was applied directly in Supabase during M4.2; now in VCS)
-- 3. CREATE FUNCTION get_group_stats(p_join_code, p_days)
--    New M5 RPC — returns per-player stats for a group, with
--    optional time-range filter (NULL = all-time, 30 = last 30 days).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. View: normalise each game into per-player rows
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 2. RPC: session leaderboard (codify M4.2 artifact)
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
        COUNT(v.game_id),
        SUM(v.is_win),
        SUM(v.points_for - v.points_against)
    FROM public.vw_player_game_stats v
    WHERE v.session_id = p_session_id
    GROUP BY v.player_id
    ORDER BY SUM(v.is_win) DESC, SUM(v.points_for - v.points_against) DESC;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_session_stats(uuid) TO anon;

-- ────────────────────────────────────────────────────────────
-- 3. RPC: group-wide leaderboard (new for M5)
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
SECURITY INVOKER          -- reads only data accessible via anon SELECT RLS
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

-- ────────────────────────────────────────────────────────────
-- 4. Grant anon access
-- ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_group_stats(text, integer) TO anon;
