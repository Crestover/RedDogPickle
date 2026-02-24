-- ============================================================
-- M10.0: RDR v1 + v1.5 — Red Dog Rating + Session-Level Rules
--
-- Replaces fire-and-forget Elo with RDR computed atomically
-- inside record_game. Session-level game rules. Clean cold start.
-- Cosmetic tiers (UI-only). Rating-correct LIFO void via
-- game_rdr_deltas.
--
-- Changes:
--   1a. sessions.target_points_default + win_by_default
--   1b. games.target_points (allow 21)
--   1c. games.win_by
--   1d. Cold start — reset player_ratings
--   1e. game_rdr_deltas table
--   1f. set_session_rules RPC (new)
--   1g. record_game (DROP+CREATE with RDR math inline)
--   1h. record_court_game (DROP+CREATE with p_target_points)
--   1i. void_last_game (DROP+CREATE with LIFO delta reversal)
--   1j. get_group_stats (DROP+CREATE with p_sort_by + rdr col)
--   1k. Grants
-- ============================================================


-- ── 1a. Session-level rule defaults ──────────────────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS target_points_default INTEGER NOT NULL DEFAULT 11
    CHECK (target_points_default IN (11, 15, 21)),
  ADD COLUMN IF NOT EXISTS win_by_default INTEGER NOT NULL DEFAULT 2
    CHECK (win_by_default IN (1, 2));


-- ── 1b. games.target_points ─────────────────────────────────

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS target_points INTEGER NOT NULL DEFAULT 11
    CHECK (target_points IN (11, 15, 21));


-- ── 1c. games.win_by ────────────────────────────────────────

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS win_by INTEGER NOT NULL DEFAULT 2
    CHECK (win_by IN (1, 2));

-- Backfill: historical 15-point games used win-by-1
UPDATE public.games
   SET win_by = CASE WHEN target_points = 15 THEN 1 ELSE 2 END
 WHERE win_by = 2 AND target_points = 15;


-- ── 1d. Cold start — reset player_ratings ───────────────────

UPDATE public.player_ratings
   SET rating = 1200,
       games_rated = 0,
       provisional = true,
       updated_at = now();
-- NO DELETE FROM rating_events. Existing rating_events are left as-is.


-- ── 1e. game_rdr_deltas table (v1.5) ────────────────────────

CREATE TABLE IF NOT EXISTS public.game_rdr_deltas (
  game_id      uuid        NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id    uuid        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  group_id     uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  delta        numeric     NOT NULL,
  rdr_before   numeric     NOT NULL,
  rdr_after    numeric     NOT NULL,
  games_before integer     NOT NULL,
  games_after  integer     NOT NULL,
  algo_version text        NOT NULL DEFAULT 'rdr_v1',
  created_at   timestamptz NOT NULL DEFAULT now(),
  voided_at    timestamptz NULL,
  PRIMARY KEY (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_game_rdr_deltas_group_created
  ON public.game_rdr_deltas (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_games_session_voided_created
  ON public.games (session_id, voided_at, created_at DESC);

ALTER TABLE public.game_rdr_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_game_rdr_deltas"
  ON public.game_rdr_deltas FOR SELECT TO anon USING (true);


-- ── 1f. set_session_rules RPC ────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_session_rules(
  p_session_id    uuid,
  p_target_points integer,
  p_win_by        integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
BEGIN
  -- Validate inputs
  IF p_target_points NOT IN (11, 15, 21) THEN
    RAISE EXCEPTION 'Invalid target_points: %. Must be 11, 15, or 21.', p_target_points
      USING ERRCODE = 'P0001';
  END IF;
  IF p_win_by NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Invalid win_by: %. Must be 1 or 2.', p_win_by
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock session + verify existence + verify group is real (INNER JOIN)
  SELECT s.id, s.ended_at, s.group_id
    INTO v_session
    FROM public.sessions s
    INNER JOIN public.groups g ON g.id = s.group_id
   WHERE s.id = p_session_id
     FOR UPDATE OF s;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session not found or has no valid group: %', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Reject ended sessions
  IF v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot change rules on an ended session'
      USING ERRCODE = 'P0001';
  END IF;

  -- Update session defaults
  UPDATE public.sessions
     SET target_points_default = p_target_points,
         win_by_default = p_win_by
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'status', 'updated',
    'target_points', p_target_points,
    'win_by', p_win_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_session_rules(uuid, integer, integer) TO anon, authenticated;


-- ── 1g. DROP + CREATE record_game ────────────────────────────
-- Must drop record_court_game first (it calls record_game).

DROP FUNCTION IF EXISTS public.record_court_game(uuid, text, integer, integer, integer, boolean);
DROP FUNCTION IF EXISTS public.record_game(uuid, uuid[], uuid[], integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.record_game(
  p_session_id    uuid,
  p_team_a_ids    uuid[],
  p_team_b_ids    uuid[],
  p_team_a_score  integer,
  p_team_b_score  integer,
  p_force         boolean DEFAULT false,
  p_target_points integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session          record;
  v_attendee_ids     uuid[];
  v_all_player_ids   uuid[];
  v_pid              uuid;
  v_game_id          uuid;
  v_sequence_num     integer;
  v_team_a_sorted    uuid[];
  v_team_b_sorted    uuid[];
  v_team_a_str       text;
  v_team_b_str       text;
  v_lo               text;
  v_hi               text;
  v_score_part       text;
  v_fingerprint      text;
  v_winner           integer;
  v_loser            integer;
  v_existing_id      uuid;
  v_existing_at      timestamptz;
  -- Resolved rules
  v_target_points    integer;
  v_win_by           integer;
  -- RDR variables
  v_group_id         uuid;
  v_a1 uuid;  v_a2 uuid;  v_b1 uuid;  v_b2 uuid;
  v_ra1 numeric;  v_ra2 numeric;  v_rb1 numeric;  v_rb2 numeric;
  v_ga1 integer;   v_ga2 integer;   v_gb1 integer;   v_gb2 integer;
  v_team_a_avg numeric;  v_team_b_avg numeric;
  v_expected_a numeric;
  v_score_a    numeric;  v_score_b numeric;
  v_d          numeric;  v_d_norm numeric;  v_mov numeric;
  v_partner_gap numeric;  v_gap_mult numeric;
  v_k          numeric;  v_raw_delta numeric;  v_clamped numeric;
  v_delta_a1 numeric;  v_delta_a2 numeric;
  v_delta_b1 numeric;  v_delta_b2 numeric;
  v_deltas_json jsonb;
BEGIN
  -- Lock the session row to serialize concurrent game inserts
  PERFORM id FROM public.sessions WHERE id = p_session_id FOR UPDATE;

  -- 1. Validate session exists + resolve group_id and rules
  SELECT s.id, s.ended_at, s.started_at, s.group_id,
         s.target_points_default, s.win_by_default
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validate session is active
  IF v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Session has already ended'
      USING ERRCODE = 'P0001';
  END IF;

  v_group_id := v_session.group_id;

  -- 3. Resolve rules from session defaults when p_target_points is NULL
  v_target_points := COALESCE(p_target_points, v_session.target_points_default);
  v_win_by := v_session.win_by_default;

  -- 4. Validate player counts
  IF ARRAY_LENGTH(p_team_a_ids, 1) != 2 OR ARRAY_LENGTH(p_team_b_ids, 1) != 2 THEN
    RAISE EXCEPTION 'Each team must have exactly 2 players'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validate no overlap
  FOREACH v_pid IN ARRAY p_team_a_ids LOOP
    IF v_pid = ANY(p_team_b_ids) THEN
      RAISE EXCEPTION 'Player % appears on both teams', v_pid
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- 6. Validate session attendees
  SELECT ARRAY_AGG(player_id)
    INTO v_attendee_ids
    FROM public.session_players
   WHERE session_id = p_session_id;

  v_all_player_ids := p_team_a_ids || p_team_b_ids;

  FOREACH v_pid IN ARRAY v_all_player_ids LOOP
    IF NOT (v_pid = ANY(v_attendee_ids)) THEN
      RAISE EXCEPTION 'Player % is not a session attendee', v_pid
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- 7. Validate scores using resolved rules
  v_winner := GREATEST(p_team_a_score, p_team_b_score);
  v_loser  := LEAST(p_team_a_score, p_team_b_score);

  IF v_winner < v_target_points OR (v_winner - v_loser) < v_win_by THEN
    RAISE EXCEPTION 'Invalid score: Winner must have %+ and lead by %',
      v_target_points, v_win_by
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. Compute Fingerprint (Order-Invariant, includes rules)
  SELECT ARRAY_AGG(u ORDER BY u) INTO v_team_a_sorted FROM UNNEST(p_team_a_ids) AS u;
  SELECT ARRAY_AGG(u ORDER BY u) INTO v_team_b_sorted FROM UNNEST(p_team_b_ids) AS u;

  v_team_a_str := ARRAY_TO_STRING(v_team_a_sorted, ',');
  v_team_b_str := ARRAY_TO_STRING(v_team_b_sorted, ',');

  IF v_team_a_str <= v_team_b_str THEN
    v_lo := v_team_a_str; v_hi := v_team_b_str;
  ELSE
    v_lo := v_team_b_str; v_hi := v_team_a_str;
  END IF;

  v_score_part := v_loser::text || ':' || v_winner::text;

  v_fingerprint := ENCODE(
    DIGEST(
      CONVERT_TO(
        v_lo || '|' || v_hi || '|' || v_score_part
        || '|' || v_target_points::text || '|' || v_win_by::text,
        'UTF8'
      ),
      'sha256'::text
    ),
    'hex'::text
  );

  -- 9. Duplicate check (Skip if forced)
  IF NOT p_force THEN
    SELECT id, created_at
      INTO v_existing_id, v_existing_at
      FROM public.games
     WHERE session_id = p_session_id
       AND dedupe_key = v_fingerprint
       AND created_at >= NOW() - INTERVAL '15 minutes'
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN JSONB_BUILD_OBJECT(
        'status', 'possible_duplicate',
        'existing_game_id', v_existing_id,
        'existing_created_at', v_existing_at
      );
    END IF;
  END IF;

  -- 10. Atomic Sequence & Insertion (with resolved rules)
  SELECT COALESCE(MAX(sequence_num), 0) + 1
    INTO v_sequence_num
    FROM public.games
   WHERE session_id = p_session_id;

  INSERT INTO public.games (
    session_id, sequence_num, team_a_score, team_b_score,
    dedupe_key, target_points, win_by
  )
  VALUES (
    p_session_id, v_sequence_num, p_team_a_score, p_team_b_score,
    v_fingerprint, v_target_points, v_win_by
  )
  RETURNING id INTO v_game_id;

  -- 11. Insert Players
  INSERT INTO public.game_players (game_id, player_id, team)
  SELECT v_game_id, id, 'A' FROM UNNEST(p_team_a_ids) AS id;

  INSERT INTO public.game_players (game_id, player_id, team)
  SELECT v_game_id, id, 'B' FROM UNNEST(p_team_b_ids) AS id;

  -- ══════════════════════════════════════════════════════════
  -- 12. RDR v1 — Atomic Rating Computation
  -- ══════════════════════════════════════════════════════════

  -- 12a. Resolve player IDs (sorted within each team for determinism)
  SELECT player_id INTO v_a1
    FROM public.game_players WHERE game_id = v_game_id AND team = 'A'
    ORDER BY player_id LIMIT 1;
  SELECT player_id INTO v_a2
    FROM public.game_players WHERE game_id = v_game_id AND team = 'A'
    ORDER BY player_id LIMIT 1 OFFSET 1;
  SELECT player_id INTO v_b1
    FROM public.game_players WHERE game_id = v_game_id AND team = 'B'
    ORDER BY player_id LIMIT 1;
  SELECT player_id INTO v_b2
    FROM public.game_players WHERE game_id = v_game_id AND team = 'B'
    ORDER BY player_id LIMIT 1 OFFSET 1;

  -- 12b. Upsert default ratings for any new players
  INSERT INTO public.player_ratings (group_id, player_id)
  VALUES
    (v_group_id, v_a1),
    (v_group_id, v_a2),
    (v_group_id, v_b1),
    (v_group_id, v_b2)
  ON CONFLICT DO NOTHING;

  -- 12c. Read current ratings + games_rated
  SELECT rating, games_rated INTO v_ra1, v_ga1
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_a1;
  SELECT rating, games_rated INTO v_ra2, v_ga2
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_a2;
  SELECT rating, games_rated INTO v_rb1, v_gb1
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_b1;
  SELECT rating, games_rated INTO v_rb2, v_gb2
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_b2;

  -- 12d. Team averages
  v_team_a_avg := (v_ra1 + v_ra2) / 2.0;
  v_team_b_avg := (v_rb1 + v_rb2) / 2.0;

  -- 12e. Expected outcome (logistic)
  v_expected_a := 1.0 / (1.0 + power(10.0, (v_team_b_avg - v_team_a_avg) / 400.0));

  -- 12f. Actual outcome
  IF p_team_a_score > p_team_b_score THEN
    v_score_a := 1;  v_score_b := 0;
  ELSE
    v_score_a := 0;  v_score_b := 1;
  END IF;

  -- 12g. Margin of Victory (MOV)
  v_d := ABS(p_team_a_score - p_team_b_score);
  v_d_norm := LEAST(v_d / v_target_points::numeric, 0.75);
  v_mov := LN(v_d_norm * 10 + 1);

  -- 12h. Compute per-player deltas
  -- Helper: compute delta for each player given their individual K, gap mult, etc.

  -- Team A player 1
  v_partner_gap := ABS(v_ra1 - v_ra2);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;
  v_k := CASE WHEN v_ga1 < 20 THEN 60 ELSE 22 END;
  v_raw_delta := v_k * (v_score_a - v_expected_a) * (1 + v_mov) * v_gap_mult;
  v_clamped := CASE
    WHEN v_ga1 < 20 THEN LEAST(GREATEST(v_raw_delta, -40), 40)
    ELSE LEAST(GREATEST(v_raw_delta, -25), 25)
  END;
  v_delta_a1 := ROUND(v_clamped, 2);

  -- Team A player 2
  v_partner_gap := ABS(v_ra2 - v_ra1);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;
  v_k := CASE WHEN v_ga2 < 20 THEN 60 ELSE 22 END;
  v_raw_delta := v_k * (v_score_a - v_expected_a) * (1 + v_mov) * v_gap_mult;
  v_clamped := CASE
    WHEN v_ga2 < 20 THEN LEAST(GREATEST(v_raw_delta, -40), 40)
    ELSE LEAST(GREATEST(v_raw_delta, -25), 25)
  END;
  v_delta_a2 := ROUND(v_clamped, 2);

  -- Team B player 1
  v_partner_gap := ABS(v_rb1 - v_rb2);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;
  v_k := CASE WHEN v_gb1 < 20 THEN 60 ELSE 22 END;
  v_raw_delta := v_k * (v_score_b - (1.0 - v_expected_a)) * (1 + v_mov) * v_gap_mult;
  v_clamped := CASE
    WHEN v_gb1 < 20 THEN LEAST(GREATEST(v_raw_delta, -40), 40)
    ELSE LEAST(GREATEST(v_raw_delta, -25), 25)
  END;
  v_delta_b1 := ROUND(v_clamped, 2);

  -- Team B player 2
  v_partner_gap := ABS(v_rb2 - v_rb1);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;
  v_k := CASE WHEN v_gb2 < 20 THEN 60 ELSE 22 END;
  v_raw_delta := v_k * (v_score_b - (1.0 - v_expected_a)) * (1 + v_mov) * v_gap_mult;
  v_clamped := CASE
    WHEN v_gb2 < 20 THEN LEAST(GREATEST(v_raw_delta, -40), 40)
    ELSE LEAST(GREATEST(v_raw_delta, -25), 25)
  END;
  v_delta_b2 := ROUND(v_clamped, 2);

  -- 12i. Update player_ratings
  UPDATE public.player_ratings
     SET rating      = rating + v_delta_a1,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_a1;

  UPDATE public.player_ratings
     SET rating      = rating + v_delta_a2,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_a2;

  UPDATE public.player_ratings
     SET rating      = rating + v_delta_b1,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_b1;

  UPDATE public.player_ratings
     SET rating      = rating + v_delta_b2,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_b2;

  -- 12j. Persist to game_rdr_deltas (4 rows)
  INSERT INTO public.game_rdr_deltas
    (game_id, player_id, group_id, delta, rdr_before, rdr_after, games_before, games_after)
  VALUES
    (v_game_id, v_a1, v_group_id, v_delta_a1, v_ra1, v_ra1 + v_delta_a1, v_ga1, v_ga1 + 1),
    (v_game_id, v_a2, v_group_id, v_delta_a2, v_ra2, v_ra2 + v_delta_a2, v_ga2, v_ga2 + 1),
    (v_game_id, v_b1, v_group_id, v_delta_b1, v_rb1, v_rb1 + v_delta_b1, v_gb1, v_gb1 + 1),
    (v_game_id, v_b2, v_group_id, v_delta_b2, v_rb2, v_rb2 + v_delta_b2, v_gb2, v_gb2 + 1);

  -- 12k. Build deltas JSON for return
  v_deltas_json := jsonb_build_array(
    jsonb_build_object('player_id', v_a1, 'delta', v_delta_a1, 'rdr_after', v_ra1 + v_delta_a1),
    jsonb_build_object('player_id', v_a2, 'delta', v_delta_a2, 'rdr_after', v_ra2 + v_delta_a2),
    jsonb_build_object('player_id', v_b1, 'delta', v_delta_b1, 'rdr_after', v_rb1 + v_delta_b1),
    jsonb_build_object('player_id', v_b2, 'delta', v_delta_b2, 'rdr_after', v_rb2 + v_delta_b2)
  );

  -- 13. Final Return (includes resolved rules + deltas)
  RETURN JSONB_BUILD_OBJECT(
    'status', 'inserted',
    'game_id', v_game_id,
    'target_points', v_target_points,
    'win_by', v_win_by,
    'deltas', v_deltas_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_game(uuid, uuid[], uuid[], integer, integer, boolean, integer) TO anon;


-- ── 1h. DROP + CREATE record_court_game ──────────────────────
-- Already dropped above (before record_game). Recreate with p_target_points.

CREATE OR REPLACE FUNCTION public.record_court_game(
  p_session_id     uuid,
  p_join_code      text,
  p_court_number   integer,
  p_team_a_score   integer,
  p_team_b_score   integer,
  p_force          boolean DEFAULT false,
  p_target_points  integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session        record;
  v_court          record;
  v_team_a_ids     uuid[];
  v_team_b_ids     uuid[];
  v_all_player_ids uuid[];
  v_record_result  jsonb;
  v_game_id        uuid;
BEGIN
  -- Lock session row + validate group ownership via join_code
  SELECT s.id, s.ended_at, s.started_at, s.group_id
    INTO v_session
    FROM public.sessions s
    JOIN public.groups g ON g.id = s.group_id
   WHERE s.id = p_session_id
     AND g.join_code = lower(p_join_code)
     FOR UPDATE OF s;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Invalid join code or session access.'));
  END IF;
  IF v_session.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_ENDED', 'message', 'Session has ended'));
  END IF;

  -- Fetch court
  SELECT id, status, team_a_ids, team_b_ids
    INTO v_court
    FROM public.session_courts
   WHERE session_id = p_session_id
     AND court_number = p_court_number;

  IF v_court.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COURT', 'message', 'Court does not exist'));
  END IF;

  IF v_court.status != 'IN_PROGRESS' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'STALE_STATE', 'message', 'Court is not IN_PROGRESS'));
  END IF;

  v_team_a_ids := v_court.team_a_ids;
  v_team_b_ids := v_court.team_b_ids;
  v_all_player_ids := v_team_a_ids || v_team_b_ids;

  -- Call record_game() internally (reuses all validation/dedup/insertion + RDR)
  v_record_result := public.record_game(
    p_session_id,
    v_team_a_ids,
    v_team_b_ids,
    p_team_a_score,
    p_team_b_score,
    p_force,
    p_target_points  -- pass through (NULL = use session defaults)
  );

  -- Handle record_game result
  IF v_record_result->>'status' = 'possible_duplicate' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'POSSIBLE_DUPLICATE', 'message', 'Possible duplicate game detected',
        'existing_game_id', v_record_result->>'existing_game_id',
        'existing_created_at', v_record_result->>'existing_created_at'));
  END IF;

  -- status = 'inserted'
  v_game_id := (v_record_result->>'game_id')::uuid;

  -- Reset court to OPEN
  UPDATE public.session_courts
     SET status = 'OPEN',
         team_a_ids = NULL,
         team_b_ids = NULL,
         assigned_at = NULL,
         last_game_id = v_game_id
   WHERE id = v_court.id;

  -- Process pending inactives: players who were marked "out after this game"
  UPDATE public.session_players
     SET status = 'INACTIVE',
         inactive_effective_after_game = false
   WHERE session_id = p_session_id
     AND player_id = ANY(v_all_player_ids)
     AND inactive_effective_after_game = true;

  -- Return full result including deltas and resolved rules
  RETURN jsonb_build_object('ok', true, 'data', v_record_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_court_game(uuid, text, integer, integer, integer, boolean, integer) TO anon;


-- ── 1i. Replace void_last_game (v1.5 — LIFO delta reversal) ─

DROP FUNCTION IF EXISTS public.void_last_game(uuid, text);

CREATE OR REPLACE FUNCTION public.void_last_game(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id       uuid;
  v_seq           integer;
  v_group_id      uuid;
  v_delta_row     record;
  v_new_games     integer;
  v_delta_count   integer;
BEGIN
  -- Lock the session row for concurrency safety
  PERFORM id FROM public.sessions WHERE id = p_session_id FOR UPDATE;

  -- Resolve group_id
  SELECT s.group_id INTO v_group_id
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Find the most recent non-voided game in this session
  SELECT id, sequence_num
    INTO v_game_id, v_seq
    FROM public.games
   WHERE session_id = p_session_id
     AND voided_at IS NULL
   ORDER BY created_at DESC, sequence_num DESC
   LIMIT 1;

  IF v_game_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_game_found');
  END IF;

  -- Verify we have exactly 4 un-voided delta rows
  SELECT COUNT(*)::integer INTO v_delta_count
    FROM public.game_rdr_deltas
   WHERE game_id = v_game_id
     AND voided_at IS NULL;

  IF v_delta_count != 4 THEN
    RAISE EXCEPTION 'Expected 4 delta rows for game %, found %', v_game_id, v_delta_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Reverse ratings for each player
  FOR v_delta_row IN
    SELECT player_id, delta, games_before
      FROM public.game_rdr_deltas
     WHERE game_id = v_game_id
       AND voided_at IS NULL
  LOOP
    v_new_games := GREATEST(v_delta_row.games_before, 0);

    UPDATE public.player_ratings
       SET rating      = rating - v_delta_row.delta,
           games_rated = v_new_games,
           provisional = (v_new_games < 20),
           updated_at  = now()
     WHERE group_id  = v_group_id
       AND player_id = v_delta_row.player_id;
  END LOOP;

  -- Mark game as voided
  UPDATE public.games
     SET voided_at   = now(),
         void_reason = 'voided by user'
   WHERE id = v_game_id;

  -- Mark delta rows as voided
  UPDATE public.game_rdr_deltas
     SET voided_at = now()
   WHERE game_id = v_game_id;

  RETURN jsonb_build_object(
    'status', 'voided',
    'voided_game_id', v_game_id,
    'sequence_num', v_seq
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_last_game(uuid) TO anon;


-- ── 1j. Update get_group_stats — server-side RDR sort ────────

DROP FUNCTION IF EXISTS public.get_group_stats(text, integer);

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
    CASE WHEN p_sort_by = 'rdr'
      THEN pr.rating
      ELSE NULL
    END DESC NULLS LAST,
    CASE WHEN p_sort_by != 'rdr'
      THEN agg.win_pct
      ELSE NULL
    END DESC NULLS LAST,
    agg.games_won DESC,
    agg.point_diff DESC,
    p.display_name ASC;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_group_stats(text, integer, text) TO anon, authenticated;
