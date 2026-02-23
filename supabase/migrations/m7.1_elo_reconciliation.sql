-- ============================================================
-- M7.1: Elo Reconciliation — detect and repair missing ratings
--
-- Fixes C-3: Fire-and-forget Elo can silently fail with no
-- retry or detection mechanism. Over time, ratings drift.
--
-- Solution:
--   1. View to detect games missing elo_v1 rating_events
--   2. RPC to backfill missing ratings (idempotent)
--
-- Respects R-EL1: Only processes games played after the group's
-- first-ever rating event (no retroactive rating of old games).
-- ============================================================

-- ── 1. View: games missing elo_v1 rating events ──────────────
-- Only includes games played AFTER the group's Elo introduction
-- (defined as the earliest rating_event.created_at for that group).
-- Games before Elo was introduced are never rated.
--
-- NOTE: voided_at column is added in m7.3. Until then, the
-- column check is safely skipped (all games have NULL voided_at).

CREATE OR REPLACE VIEW public.vw_games_missing_ratings AS
SELECT g.id AS game_id,
       g.session_id,
       s.group_id,
       g.played_at,
       g.sequence_num
  FROM public.games g
  JOIN public.sessions s ON s.id = g.session_id
 WHERE NOT EXISTS (
         SELECT 1 FROM public.rating_events re
          WHERE re.game_id = g.id AND re.algo_version = 'elo_v1'
       )
   AND g.played_at >= (
         SELECT MIN(re2.created_at)
           FROM public.rating_events re2
          WHERE re2.group_id = s.group_id
            AND re2.algo_version = 'elo_v1'
       )
 ORDER BY g.played_at ASC, g.sequence_num ASC;

-- ── 2. RPC: reconcile_missing_ratings ─────────────────────────
-- Iterates over all games with no elo_v1 events (post-introduction)
-- and applies ratings. Safe to run multiple times since
-- apply_ratings_for_game is idempotent.

CREATE OR REPLACE FUNCTION public.reconcile_missing_ratings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_game_id uuid;
  v_count   integer := 0;
BEGIN
  FOR v_game_id IN
    SELECT game_id FROM public.vw_games_missing_ratings
  LOOP
    PERFORM public.apply_ratings_for_game(v_game_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.reconcile_missing_ratings() TO anon;
