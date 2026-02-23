-- ============================================================
-- M7.3: Void Game Support + Session-Scoped Rating Recompute
--
-- Adds:
--   1. voided_at / void_reason / voided_by columns to games
--   2. Updated vw_player_game_stats to exclude voided games
--   3. Updated get_session_pair_counts to exclude voided games
--   4. void_last_game() RPC
--   5. recompute_session_ratings() RPC (session-scoped, R-EL1/R-EL2 safe)
--
-- Also updates vw_games_missing_ratings to exclude voided games.
-- ============================================================

-- ── 1. Add void columns to games ─────────────────────────────
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS voided_at   timestamptz;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS voided_by   text;

-- ── 2. Update vw_player_game_stats to exclude voided games ───
DROP VIEW IF EXISTS public.vw_player_game_stats;

CREATE VIEW public.vw_player_game_stats AS
SELECT
  gp.player_id,
  gp.game_id,
  g.session_id,
  gp.team,
  g.played_at,
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
JOIN public.games g ON g.id = gp.game_id
WHERE g.voided_at IS NULL;  -- *** Exclude voided games ***

-- get_session_stats and get_group_stats query through this view,
-- so they automatically exclude voided games without code changes.

-- ── 3. Update get_session_pair_counts to exclude voided games ─
-- This function queries game_players + games directly (not through
-- the view), so we must add voided_at IS NULL to the played_pairs CTE.

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
           AND g.voided_at IS NULL  -- *** Exclude voided games ***
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

-- ── 4. void_last_game RPC ─────────────────────────────────────
-- Finds the most recent non-voided game in the session and marks
-- it as voided. Returns status + game info, or no_game_found.

CREATE OR REPLACE FUNCTION public.void_last_game(
  p_session_id uuid,
  p_reason     text DEFAULT 'voided by user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_game_id uuid;
  v_seq     integer;
BEGIN
  -- Find the most recent non-voided game in this session
  SELECT id, sequence_num
    INTO v_game_id, v_seq
    FROM public.games
   WHERE session_id = p_session_id
     AND voided_at IS NULL
   ORDER BY sequence_num DESC
   LIMIT 1;

  IF v_game_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_game_found');
  END IF;

  -- Mark as voided (immutable: never delete, only mark)
  UPDATE public.games
     SET voided_at   = now(),
         void_reason = p_reason
   WHERE id = v_game_id;

  RETURN jsonb_build_object(
    'status', 'voided',
    'game_id', v_game_id,
    'sequence_num', v_seq
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.void_last_game(uuid, text) TO anon;

-- ── 5. recompute_session_ratings RPC ──────────────────────────
-- Elo recompute triggered after voiding a game in a session.
--
-- Correctness: Because apply_ratings_for_game reads the CURRENT
-- player_ratings to compute deltas, simply reversing one session's
-- deltas leaves all later games' rating_events stale (they were
-- computed against ratings that included the now-voided game).
--
-- Algorithm (forward-replay from earliest affected game):
--   1. Find t0 = earliest played_at of any rated game in this session
--      that falls within the Elo era (>= group's first rated game).
--   2. Collect ALL rating_events for this group with played_at >= t0.
--   3. Reverse those deltas from player_ratings (undo them all).
--   4. Delete those rating_events.
--   5. Replay ALL non-voided, rated-era games with played_at >= t0
--      chronologically via apply_ratings_for_game.
--
-- This is minimal in normal use (typically only the active session
-- has games at t0 or later), but stays correct when later games exist.
--
-- Respects R-EL1: only games within the rated era are touched.
-- The Elo introduction boundary is the earliest played_at of any
-- game that has a rating_event (not created_at, to avoid clock skew).

CREATE OR REPLACE FUNCTION public.recompute_session_ratings(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_group_id  uuid;
  v_elo_start timestamptz;  -- group's Elo introduction boundary
  v_t0        timestamptz;  -- earliest affected game in this session
  v_event     record;
  v_game_id   uuid;
  v_count     integer := 0;
BEGIN
  -- Resolve group
  SELECT s.group_id INTO v_group_id
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- Find the group's Elo introduction boundary:
  -- earliest played_at of any game that has a rating_event.
  SELECT MIN(g.played_at) INTO v_elo_start
    FROM public.rating_events re
    JOIN public.games g ON g.id = re.game_id
   WHERE re.group_id = v_group_id
     AND re.algo_version = 'elo_v1';

  -- If no ratings ever existed for this group, nothing to recompute
  IF v_elo_start IS NULL THEN
    RETURN 0;
  END IF;

  -- Find t0: earliest played_at of any game in this session that
  -- falls within the rated era.  This is the rewind point.
  SELECT MIN(g.played_at) INTO v_t0
    FROM public.games g
   WHERE g.session_id = p_session_id
     AND g.played_at >= v_elo_start;

  -- No rated-era games in this session → nothing to do
  IF v_t0 IS NULL THEN
    RETURN 0;
  END IF;

  -- Step 1: Reverse ALL rating_events for this group from t0 onward.
  -- We join through games to filter by played_at >= v_t0.
  FOR v_event IN
    SELECT re.player_id, re.delta
      FROM public.rating_events re
      JOIN public.games g ON g.id = re.game_id
     WHERE re.group_id = v_group_id
       AND re.algo_version = 'elo_v1'
       AND g.played_at >= v_t0
  LOOP
    UPDATE public.player_ratings
       SET rating      = rating - v_event.delta,
           games_rated = GREATEST(games_rated - 1, 0),
           provisional = (GREATEST(games_rated - 1, 0)) < 5,
           updated_at  = now()
     WHERE group_id  = v_group_id
       AND player_id = v_event.player_id;
  END LOOP;

  -- Step 2: Delete those rating_events
  DELETE FROM public.rating_events re
   USING public.games g
   WHERE g.id = re.game_id
     AND re.group_id = v_group_id
     AND re.algo_version = 'elo_v1'
     AND g.played_at >= v_t0;

  -- Step 3: Replay ALL non-voided, rated-era games from t0 onward
  -- across ALL sessions in this group (not just the affected one).
  FOR v_game_id IN
    SELECT g.id
      FROM public.games g
      JOIN public.sessions s ON s.id = g.session_id
     WHERE s.group_id = v_group_id
       AND g.voided_at IS NULL
       AND g.played_at >= v_t0
     ORDER BY g.played_at ASC, g.sequence_num ASC
  LOOP
    PERFORM public.apply_ratings_for_game(v_game_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.recompute_session_ratings(uuid) TO anon;

-- ── 6. Update vw_games_missing_ratings to exclude voided games ─
-- The view was created in m7.1 before voided_at existed.
-- Now we can add the voided_at filter properly.

DROP VIEW IF EXISTS public.vw_games_missing_ratings;

CREATE OR REPLACE VIEW public.vw_games_missing_ratings AS
SELECT g.id AS game_id,
       g.session_id,
       s.group_id,
       g.played_at,
       g.sequence_num
  FROM public.games g
  JOIN public.sessions s ON s.id = g.session_id
 WHERE g.voided_at IS NULL
   AND NOT EXISTS (
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
