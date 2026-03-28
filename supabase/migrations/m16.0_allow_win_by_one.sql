-- ════════════════════════════════════════════════════════════════
-- M16.0 — Allow win-by-1 for all game types
--
-- Product decision: win-by-2 is no longer enforced at the DB level.
-- Any score where winner > loser and winner >= target_points is valid.
-- A client-side soft warning is shown for win-by-1 games instead.
--
-- Changes:
--   1. record_game: v_win_by hardcoded to 1; validation simplified
--      to winner >= target_points AND winner > loser
--
-- No schema changes. No column drops.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Replace record_game ──────────────────────────────────────

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
  -- Undo window
  v_undo_exp         timestamptz;
  -- Group
  v_group_id         uuid;
  -- Player IDs
  v_a1 uuid;  v_a2 uuid;  v_b1 uuid;  v_b2 uuid;
  -- Current ratings
  v_ra1 numeric;  v_ra2 numeric;  v_rb1 numeric;  v_rb2 numeric;
  -- Games rated
  v_ga1 integer;   v_ga2 integer;   v_gb1 integer;   v_gb2 integer;
  -- Rating deviation (stored)
  v_rd_a1 numeric;  v_rd_a2 numeric;  v_rd_b1 numeric;  v_rd_b2 numeric;
  -- Last played
  v_lp_a1 timestamptz;  v_lp_a2 timestamptz;  v_lp_b1 timestamptz;  v_lp_b2 timestamptz;
  -- Reacclimation
  v_reaccl_a1 integer;  v_reaccl_a2 integer;  v_reaccl_b1 integer;  v_reaccl_b2 integer;
  -- Effective RD (after inactivity inflation) — computed for all 4 first
  v_eff_rd_a1 numeric;  v_eff_rd_a2 numeric;  v_eff_rd_b1 numeric;  v_eff_rd_b2 numeric;
  -- Working vars for per-player computation
  v_days_inactive    numeric;
  v_days_inactive_eff numeric;
  v_rd_bump          numeric;
  v_raw_vol          numeric;
  v_reaccl_factor    numeric;
  v_effective_vol    numeric;
  v_new_reaccl       integer;
  -- Team / expectation
  v_team_a_avg numeric;  v_team_b_avg numeric;
  v_expected_a numeric;
  v_score_a    numeric;  v_score_b numeric;
  -- Margin
  v_point_diff integer;
  v_margin_factor numeric;
  -- Partner gap
  v_partner_gap numeric;  v_gap_mult numeric;
  -- Delta computation
  v_raw_delta numeric;  v_clamped numeric;
  v_delta_a1 numeric;  v_delta_a2 numeric;
  v_delta_b1 numeric;  v_delta_b2 numeric;
  -- Volatility used (for logging)
  v_vol_a1 numeric;  v_vol_a2 numeric;  v_vol_b1 numeric;  v_vol_b2 numeric;
  -- RD recovery
  v_opp_avg_rd       numeric;
  v_opp_conf_factor  numeric;
  v_closeness_factor numeric;
  v_rd_recovery      numeric;
  -- New RD values
  v_new_rd_a1 numeric;  v_new_rd_a2 numeric;  v_new_rd_b1 numeric;  v_new_rd_b2 numeric;
  -- New reacclimation values
  v_new_reaccl_a1 integer;  v_new_reaccl_a2 integer;  v_new_reaccl_b1 integer;  v_new_reaccl_b2 integer;
  -- Return
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

  -- 3. Resolve rules: target_points from param or session default; win_by always 1
  v_target_points := COALESCE(p_target_points, v_session.target_points_default);
  v_win_by := 1;

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

  -- 7. Validate scores: winner >= target_points AND winner > loser
  v_winner := GREATEST(p_team_a_score, p_team_b_score);
  v_loser  := LEAST(p_team_a_score, p_team_b_score);

  IF v_winner < v_target_points THEN
    RAISE EXCEPTION 'Invalid score: Winning score must be at least %', v_target_points
      USING ERRCODE = 'P0001';
  END IF;

  IF v_winner <= v_loser THEN
    RAISE EXCEPTION 'Invalid score: Winner must have more points than loser'
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

  -- 10. Atomic Sequence & Insertion (with resolved rules + undo window)
  SELECT COALESCE(MAX(sequence_num), 0) + 1
    INTO v_sequence_num
    FROM public.games
   WHERE session_id = p_session_id;

  v_undo_exp := now() + interval '8 seconds';

  INSERT INTO public.games (
    session_id, sequence_num, team_a_score, team_b_score,
    dedupe_key, target_points, win_by, undo_expires_at
  )
  VALUES (
    p_session_id, v_sequence_num, p_team_a_score, p_team_b_score,
    v_fingerprint, v_target_points, v_win_by, v_undo_exp
  )
  RETURNING id INTO v_game_id;

  -- 11. Insert Players
  INSERT INTO public.game_players (game_id, player_id, team)
  SELECT v_game_id, id, 'A' FROM UNNEST(p_team_a_ids) AS id;

  INSERT INTO public.game_players (game_id, player_id, team)
  SELECT v_game_id, id, 'B' FROM UNNEST(p_team_b_ids) AS id;

  -- ══════════════════════════════════════════════════════════
  -- 12. RDR v2 — Atomic Rating Computation
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

  -- 12c. Read current state for all 4 players
  SELECT rating, games_rated, rating_deviation, last_played_at, reacclimation_games_remaining
    INTO v_ra1, v_ga1, v_rd_a1, v_lp_a1, v_reaccl_a1
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_a1;
  SELECT rating, games_rated, rating_deviation, last_played_at, reacclimation_games_remaining
    INTO v_ra2, v_ga2, v_rd_a2, v_lp_a2, v_reaccl_a2
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_a2;
  SELECT rating, games_rated, rating_deviation, last_played_at, reacclimation_games_remaining
    INTO v_rb1, v_gb1, v_rd_b1, v_lp_b1, v_reaccl_b1
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_b1;
  SELECT rating, games_rated, rating_deviation, last_played_at, reacclimation_games_remaining
    INTO v_rb2, v_gb2, v_rd_b2, v_lp_b2, v_reaccl_b2
    FROM public.player_ratings WHERE group_id = v_group_id AND player_id = v_b2;

  -- ── 12d. Compute effective RD for ALL 4 players (before any deltas) ──
  -- This ensures opponent RD values are consistent across all calculations.

  -- Player A1
  v_days_inactive := CASE WHEN v_lp_a1 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_a1)) / 86400.0) END;
  v_days_inactive_eff := GREATEST(0, v_days_inactive - 14);
  v_rd_bump := LEAST(50, 18 * LN(1 + v_days_inactive_eff / 10));
  v_eff_rd_a1 := LEAST(140, v_rd_a1 + v_rd_bump);

  -- Player A2
  v_days_inactive := CASE WHEN v_lp_a2 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_a2)) / 86400.0) END;
  v_days_inactive_eff := GREATEST(0, v_days_inactive - 14);
  v_rd_bump := LEAST(50, 18 * LN(1 + v_days_inactive_eff / 10));
  v_eff_rd_a2 := LEAST(140, v_rd_a2 + v_rd_bump);

  -- Player B1
  v_days_inactive := CASE WHEN v_lp_b1 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_b1)) / 86400.0) END;
  v_days_inactive_eff := GREATEST(0, v_days_inactive - 14);
  v_rd_bump := LEAST(50, 18 * LN(1 + v_days_inactive_eff / 10));
  v_eff_rd_b1 := LEAST(140, v_rd_b1 + v_rd_bump);

  -- Player B2
  v_days_inactive := CASE WHEN v_lp_b2 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_b2)) / 86400.0) END;
  v_days_inactive_eff := GREATEST(0, v_days_inactive - 14);
  v_rd_bump := LEAST(50, 18 * LN(1 + v_days_inactive_eff / 10));
  v_eff_rd_b2 := LEAST(140, v_rd_b2 + v_rd_bump);

  -- ── 12e. Team averages & expected outcome ──

  v_team_a_avg := (v_ra1 + v_ra2) / 2.0;
  v_team_b_avg := (v_rb1 + v_rb2) / 2.0;
  v_expected_a := 1.0 / (1.0 + power(10.0, (v_team_b_avg - v_team_a_avg) / 400.0));

  -- 12f. Actual outcome
  IF p_team_a_score > p_team_b_score THEN
    v_score_a := 1;  v_score_b := 0;
  ELSE
    v_score_a := 0;  v_score_b := 1;
  END IF;

  -- ── 12g. Margin factor (replaces v1 MOV) ──
  v_point_diff := ABS(p_team_a_score - p_team_b_score);
  v_margin_factor := CASE
    WHEN v_point_diff <= 2 THEN 0.95
    WHEN v_point_diff <= 5 THEN 1.00
    WHEN v_point_diff <= 8 THEN 1.08
    ELSE 1.10
  END;

  -- ── 12h. Closeness factor for RD recovery (aligned with margin tiers) ──
  v_closeness_factor := CASE
    WHEN v_point_diff <= 2 THEN 1.10
    WHEN v_point_diff <= 5 THEN 1.00
    ELSE 0.90
  END;

  -- ══════════════════════════════════════════════════════════
  -- 12i. Per-player delta computation
  -- ══════════════════════════════════════════════════════════
  -- Each player: volatility → reacclimation → delta → RD recovery

  -- ── PLAYER A1 ──

  -- Reacclimation trigger: 60+ days inactive, no existing reacclimation, 5+ games
  v_days_inactive := CASE WHEN v_lp_a1 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_a1)) / 86400.0) END;
  v_new_reaccl_a1 := v_reaccl_a1;
  IF v_days_inactive >= 60 AND v_reaccl_a1 = 0 AND v_ga1 >= 5 THEN
    v_new_reaccl_a1 := 3;
  END IF;

  -- Volatility
  v_raw_vol := LEAST(GREATEST(v_eff_rd_a1 / 80.0, 0.85), 1.60);
  v_reaccl_factor := CASE
    WHEN v_new_reaccl_a1 >= 3 THEN 0.70
    WHEN v_new_reaccl_a1 = 2 THEN 0.85
    ELSE 1.00
  END;
  v_effective_vol := 1 + ((v_raw_vol - 1) * v_reaccl_factor);
  v_vol_a1 := v_effective_vol;

  -- Partner gap dampener (unchanged from v1)
  v_partner_gap := ABS(v_ra1 - v_ra2);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;

  -- Delta: BASE_K=20
  v_raw_delta := 20 * v_effective_vol * (v_score_a - v_expected_a) * v_margin_factor * v_gap_mult;
  v_clamped := LEAST(GREATEST(v_raw_delta, -32), 32);
  v_delta_a1 := ROUND(v_clamped, 2);

  -- RD recovery (opponents = team B)
  v_opp_avg_rd := (v_eff_rd_b1 + v_eff_rd_b2) / 2.0;
  v_opp_conf_factor := LEAST(GREATEST(80.0 / v_opp_avg_rd, 0.75), 1.25);
  v_rd_recovery := LEAST(GREATEST(6 * v_opp_conf_factor * v_closeness_factor, 4), 10);
  -- Guard: don't overshoot RD_MIN
  v_rd_recovery := LEAST(v_rd_recovery, v_eff_rd_a1 - 50);
  v_rd_recovery := GREATEST(v_rd_recovery, 0);
  v_new_rd_a1 := GREATEST(50, v_eff_rd_a1 - v_rd_recovery);

  -- Decrement reacclimation counter
  IF v_new_reaccl_a1 > 0 THEN
    v_new_reaccl_a1 := v_new_reaccl_a1 - 1;
  END IF;

  -- ── PLAYER A2 ──

  v_days_inactive := CASE WHEN v_lp_a2 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_a2)) / 86400.0) END;
  v_new_reaccl_a2 := v_reaccl_a2;
  IF v_days_inactive >= 60 AND v_reaccl_a2 = 0 AND v_ga2 >= 5 THEN
    v_new_reaccl_a2 := 3;
  END IF;

  v_raw_vol := LEAST(GREATEST(v_eff_rd_a2 / 80.0, 0.85), 1.60);
  v_reaccl_factor := CASE
    WHEN v_new_reaccl_a2 >= 3 THEN 0.70
    WHEN v_new_reaccl_a2 = 2 THEN 0.85
    ELSE 1.00
  END;
  v_effective_vol := 1 + ((v_raw_vol - 1) * v_reaccl_factor);
  v_vol_a2 := v_effective_vol;

  v_partner_gap := ABS(v_ra2 - v_ra1);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;

  v_raw_delta := 20 * v_effective_vol * (v_score_a - v_expected_a) * v_margin_factor * v_gap_mult;
  v_clamped := LEAST(GREATEST(v_raw_delta, -32), 32);
  v_delta_a2 := ROUND(v_clamped, 2);

  v_opp_avg_rd := (v_eff_rd_b1 + v_eff_rd_b2) / 2.0;
  v_opp_conf_factor := LEAST(GREATEST(80.0 / v_opp_avg_rd, 0.75), 1.25);
  v_rd_recovery := LEAST(GREATEST(6 * v_opp_conf_factor * v_closeness_factor, 4), 10);
  v_rd_recovery := LEAST(v_rd_recovery, v_eff_rd_a2 - 50);
  v_rd_recovery := GREATEST(v_rd_recovery, 0);
  v_new_rd_a2 := GREATEST(50, v_eff_rd_a2 - v_rd_recovery);

  IF v_new_reaccl_a2 > 0 THEN
    v_new_reaccl_a2 := v_new_reaccl_a2 - 1;
  END IF;

  -- ── PLAYER B1 ──

  v_days_inactive := CASE WHEN v_lp_b1 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_b1)) / 86400.0) END;
  v_new_reaccl_b1 := v_reaccl_b1;
  IF v_days_inactive >= 60 AND v_reaccl_b1 = 0 AND v_gb1 >= 5 THEN
    v_new_reaccl_b1 := 3;
  END IF;

  v_raw_vol := LEAST(GREATEST(v_eff_rd_b1 / 80.0, 0.85), 1.60);
  v_reaccl_factor := CASE
    WHEN v_new_reaccl_b1 >= 3 THEN 0.70
    WHEN v_new_reaccl_b1 = 2 THEN 0.85
    ELSE 1.00
  END;
  v_effective_vol := 1 + ((v_raw_vol - 1) * v_reaccl_factor);
  v_vol_b1 := v_effective_vol;

  v_partner_gap := ABS(v_rb1 - v_rb2);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;

  v_raw_delta := 20 * v_effective_vol * (v_score_b - (1.0 - v_expected_a)) * v_margin_factor * v_gap_mult;
  v_clamped := LEAST(GREATEST(v_raw_delta, -32), 32);
  v_delta_b1 := ROUND(v_clamped, 2);

  -- RD recovery (opponents = team A)
  v_opp_avg_rd := (v_eff_rd_a1 + v_eff_rd_a2) / 2.0;
  v_opp_conf_factor := LEAST(GREATEST(80.0 / v_opp_avg_rd, 0.75), 1.25);
  v_rd_recovery := LEAST(GREATEST(6 * v_opp_conf_factor * v_closeness_factor, 4), 10);
  v_rd_recovery := LEAST(v_rd_recovery, v_eff_rd_b1 - 50);
  v_rd_recovery := GREATEST(v_rd_recovery, 0);
  v_new_rd_b1 := GREATEST(50, v_eff_rd_b1 - v_rd_recovery);

  IF v_new_reaccl_b1 > 0 THEN
    v_new_reaccl_b1 := v_new_reaccl_b1 - 1;
  END IF;

  -- ── PLAYER B2 ──

  v_days_inactive := CASE WHEN v_lp_b2 IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - v_lp_b2)) / 86400.0) END;
  v_new_reaccl_b2 := v_reaccl_b2;
  IF v_days_inactive >= 60 AND v_reaccl_b2 = 0 AND v_gb2 >= 5 THEN
    v_new_reaccl_b2 := 3;
  END IF;

  v_raw_vol := LEAST(GREATEST(v_eff_rd_b2 / 80.0, 0.85), 1.60);
  v_reaccl_factor := CASE
    WHEN v_new_reaccl_b2 >= 3 THEN 0.70
    WHEN v_new_reaccl_b2 = 2 THEN 0.85
    ELSE 1.00
  END;
  v_effective_vol := 1 + ((v_raw_vol - 1) * v_reaccl_factor);
  v_vol_b2 := v_effective_vol;

  v_partner_gap := ABS(v_rb2 - v_rb1);
  v_gap_mult := CASE
    WHEN v_partner_gap < 50  THEN 1.00
    WHEN v_partner_gap < 100 THEN 0.85
    WHEN v_partner_gap < 200 THEN 0.70
    ELSE 0.55
  END;

  v_raw_delta := 20 * v_effective_vol * (v_score_b - (1.0 - v_expected_a)) * v_margin_factor * v_gap_mult;
  v_clamped := LEAST(GREATEST(v_raw_delta, -32), 32);
  v_delta_b2 := ROUND(v_clamped, 2);

  v_opp_avg_rd := (v_eff_rd_a1 + v_eff_rd_a2) / 2.0;
  v_opp_conf_factor := LEAST(GREATEST(80.0 / v_opp_avg_rd, 0.75), 1.25);
  v_rd_recovery := LEAST(GREATEST(6 * v_opp_conf_factor * v_closeness_factor, 4), 10);
  v_rd_recovery := LEAST(v_rd_recovery, v_eff_rd_b2 - 50);
  v_rd_recovery := GREATEST(v_rd_recovery, 0);
  v_new_rd_b2 := GREATEST(50, v_eff_rd_b2 - v_rd_recovery);

  IF v_new_reaccl_b2 > 0 THEN
    v_new_reaccl_b2 := v_new_reaccl_b2 - 1;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- 12j. Update player_ratings (with peak tracking + v2 fields)
  -- ══════════════════════════════════════════════════════════

  UPDATE public.player_ratings
     SET rating      = rating + v_delta_a1,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         rating_deviation = v_new_rd_a1,
         last_played_at = now(),
         reacclimation_games_remaining = v_new_reaccl_a1,
         peak_rating = GREATEST(peak_rating, rating + v_delta_a1),
         peak_rating_achieved_at = CASE
           WHEN rating + v_delta_a1 > peak_rating THEN now()
           ELSE peak_rating_achieved_at
         END,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_a1;

  UPDATE public.player_ratings
     SET rating      = rating + v_delta_a2,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         rating_deviation = v_new_rd_a2,
         last_played_at = now(),
         reacclimation_games_remaining = v_new_reaccl_a2,
         peak_rating = GREATEST(peak_rating, rating + v_delta_a2),
         peak_rating_achieved_at = CASE
           WHEN rating + v_delta_a2 > peak_rating THEN now()
           ELSE peak_rating_achieved_at
         END,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_a2;

  UPDATE public.player_ratings
     SET rating      = rating + v_delta_b1,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         rating_deviation = v_new_rd_b1,
         last_played_at = now(),
         reacclimation_games_remaining = v_new_reaccl_b1,
         peak_rating = GREATEST(peak_rating, rating + v_delta_b1),
         peak_rating_achieved_at = CASE
           WHEN rating + v_delta_b1 > peak_rating THEN now()
           ELSE peak_rating_achieved_at
         END,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_b1;

  UPDATE public.player_ratings
     SET rating      = rating + v_delta_b2,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 20,
         rating_deviation = v_new_rd_b2,
         last_played_at = now(),
         reacclimation_games_remaining = v_new_reaccl_b2,
         peak_rating = GREATEST(peak_rating, rating + v_delta_b2),
         peak_rating_achieved_at = CASE
           WHEN rating + v_delta_b2 > peak_rating THEN now()
           ELSE peak_rating_achieved_at
         END,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_b2;

  -- ══════════════════════════════════════════════════════════
  -- 12k. Persist to game_rdr_deltas (4 rows, v2 schema)
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.game_rdr_deltas
    (game_id, player_id, group_id, delta, rdr_before, rdr_after,
     games_before, games_after, algo_version,
     rd_before, rd_after, effective_rd_before, vol_multiplier,
     reacclimation_before, reacclimation_after,
     last_played_before, last_played_after)
  VALUES
    (v_game_id, v_a1, v_group_id, v_delta_a1, v_ra1, v_ra1 + v_delta_a1,
     v_ga1, v_ga1 + 1, 'rdr_v2',
     v_rd_a1, v_new_rd_a1, v_eff_rd_a1, v_vol_a1,
     v_reaccl_a1, v_new_reaccl_a1,
     v_lp_a1, now()),
    (v_game_id, v_a2, v_group_id, v_delta_a2, v_ra2, v_ra2 + v_delta_a2,
     v_ga2, v_ga2 + 1, 'rdr_v2',
     v_rd_a2, v_new_rd_a2, v_eff_rd_a2, v_vol_a2,
     v_reaccl_a2, v_new_reaccl_a2,
     v_lp_a2, now()),
    (v_game_id, v_b1, v_group_id, v_delta_b1, v_rb1, v_rb1 + v_delta_b1,
     v_gb1, v_gb1 + 1, 'rdr_v2',
     v_rd_b1, v_new_rd_b1, v_eff_rd_b1, v_vol_b1,
     v_reaccl_b1, v_new_reaccl_b1,
     v_lp_b1, now()),
    (v_game_id, v_b2, v_group_id, v_delta_b2, v_rb2, v_rb2 + v_delta_b2,
     v_gb2, v_gb2 + 1, 'rdr_v2',
     v_rd_b2, v_new_rd_b2, v_eff_rd_b2, v_vol_b2,
     v_reaccl_b2, v_new_reaccl_b2,
     v_lp_b2, now());

  -- 12l. Build deltas JSON for return
  v_deltas_json := jsonb_build_array(
    jsonb_build_object('player_id', v_a1, 'delta', v_delta_a1, 'rdr_after', v_ra1 + v_delta_a1),
    jsonb_build_object('player_id', v_a2, 'delta', v_delta_a2, 'rdr_after', v_ra2 + v_delta_a2),
    jsonb_build_object('player_id', v_b1, 'delta', v_delta_b1, 'rdr_after', v_rb1 + v_delta_b1),
    jsonb_build_object('player_id', v_b2, 'delta', v_delta_b2, 'rdr_after', v_rb2 + v_delta_b2)
  );

  -- 13. Final Return (includes resolved rules + deltas + undo expiration)
  RETURN JSONB_BUILD_OBJECT(
    'status', 'inserted',
    'game_id', v_game_id,
    'target_points', v_target_points,
    'win_by', v_win_by,
    'deltas', v_deltas_json,
    'undo_expires_at', v_undo_exp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_game(uuid, uuid[], uuid[], integer, integer, boolean, integer) TO anon;
