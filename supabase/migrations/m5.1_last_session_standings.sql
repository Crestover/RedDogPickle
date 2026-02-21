-- ============================================================
-- Milestone 5.1 — Last Session Leaderboard + Session Standings
-- ============================================================
-- 1. Extend get_session_stats to return 10 columns (matching
--    get_group_stats shape) for UI consistency.
-- 2. New RPC: get_last_session_id — returns the most recently
--    ended session for a group (by join_code).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Extended get_session_stats (10 columns)
--    Was: player_id, games_played, wins, point_diff
--    Now: + display_name, code, games_won, win_pct,
--           points_for, points_against, avg_point_diff
--    Uses aggregate-then-JOIN pattern for consistency.
-- ────────────────────────────────────────────────────────────
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
    avg_point_diff numeric(5,1)
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
BEGIN
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
        WHERE v.session_id = p_session_id
        GROUP BY v.player_id
        HAVING COUNT(*) FILTER (WHERE v.is_valid) > 0
    ) agg
    INNER JOIN public.players p ON p.id = agg.player_id
    ORDER BY agg.win_pct DESC, agg.games_won DESC, agg.point_diff DESC, p.display_name ASC;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_session_stats(uuid) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. New RPC: get_last_session_id
--    Returns the most recently ended session UUID for a group.
--    Returns NULL if no ended sessions exist.
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_last_session_id(text);

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
    -- Resolve group
    SELECT g.id INTO v_group_id
      FROM public.groups g
     WHERE g.join_code = lower(p_join_code);

    IF v_group_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Find most recently ended session
    SELECT s.id INTO v_session_id
      FROM public.sessions s
     WHERE s.group_id = v_group_id
       AND s.ended_at IS NOT NULL
     ORDER BY s.ended_at DESC
     LIMIT 1;

    RETURN v_session_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_last_session_id(text) TO anon, authenticated;
