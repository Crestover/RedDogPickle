-- ============================================================
-- Milestone 5.2 — Pairing Balance
-- ============================================================
-- New RPC: get_session_pair_counts
-- Returns every attendee pair with the number of games they
-- have played on the SAME TEAM in this session.
-- Includes 0-count pairs (all combinations from session_players).
-- Sorted fewest games together first, then by name.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_session_pair_counts(uuid);

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

GRANT EXECUTE ON FUNCTION public.get_session_pair_counts(uuid) TO anon, authenticated;
