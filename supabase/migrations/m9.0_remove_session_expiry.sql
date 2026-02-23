-- ============================================================
-- M9.0: Remove 4-Hour Session Expiry
--
-- Sessions are now ACTIVE until explicitly ended (ended_at IS NOT NULL).
-- There is NO time-based expiry.
--
-- Changes:
--   1. Drop partial unique index (allow multiple active sessions per group)
--   2. Recreate create_session without unique_violation catch
--   3. Recreate record_game without 4-hour check
--   4. Recreate all 9 courts RPCs without 4-hour checks
-- ============================================================


-- ── 1. Drop the one-active-session-per-group index ──────────
-- Allows "Start New Without Ending" flow (multiple active sessions per group).

DROP INDEX IF EXISTS idx_one_active_session_per_group;


-- ── 2. Recreate create_session ──────────────────────────────
-- Removed: EXCEPTION WHEN unique_violation catch.
-- Always creates a new session. No fallback to existing.

DROP FUNCTION IF EXISTS public.create_session(text, uuid[]);

CREATE OR REPLACE FUNCTION public.create_session(
  group_join_code text,
  player_ids      uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_group_id   uuid;
  v_group_name text;
  v_session_id uuid;
  v_label      text;
  v_codes      text[];
  v_pid        uuid;
BEGIN
  -- Validate: group must exist
  SELECT id, name
    INTO v_group_id, v_group_name
    FROM public.groups
   WHERE join_code = lower(group_join_code);

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Group not found: %', group_join_code
      USING ERRCODE = 'P0002';
  END IF;

  -- Validate: must have at least 4 players
  IF array_length(player_ids, 1) IS NULL OR array_length(player_ids, 1) < 4 THEN
    RAISE EXCEPTION 'At least 4 players are required to start a session'
      USING ERRCODE = 'P0003';
  END IF;

  -- Build sorted player codes for session label
  SELECT array_agg(p.code ORDER BY p.code)
    INTO v_codes
    FROM public.players p
   WHERE p.id = ANY(player_ids)
     AND p.group_id = v_group_id;

  v_label := to_char(current_date, 'YYYY-MM-DD') || ' ' || array_to_string(v_codes, ' ');

  -- Always insert a new session
  INSERT INTO public.sessions (group_id, session_date, name, started_at)
  VALUES (v_group_id, current_date, v_label, now())
  RETURNING id INTO v_session_id;

  -- Insert session_players (attendance)
  FOREACH v_pid IN ARRAY player_ids LOOP
    INSERT INTO public.session_players (session_id, player_id)
    VALUES (v_session_id, v_pid)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_session(text, uuid[]) TO anon;


-- ── 3. Recreate record_game ─────────────────────────────────
-- Removed: 4-hour expiry check.
-- Kept: ended_at check, FOR UPDATE lock, all other validation.

DROP FUNCTION IF EXISTS public.record_game(uuid, uuid[], uuid[], integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.record_game(
  p_session_id    uuid,
  p_team_a_ids    uuid[],
  p_team_b_ids    uuid[],
  p_team_a_score integer,
  p_team_b_score integer,
  p_force         boolean DEFAULT false
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
BEGIN
  -- Lock the session row to serialize concurrent game inserts
  PERFORM id FROM public.sessions WHERE id = p_session_id FOR UPDATE;

  -- 1. Validate session exists
  SELECT id, ended_at, started_at
    INTO v_session
    FROM public.sessions
   WHERE id = p_session_id;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validate session is active (ended_at only — no time-based expiry)
  IF v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Session has already ended'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate player counts
  IF ARRAY_LENGTH(p_team_a_ids, 1) != 2 OR ARRAY_LENGTH(p_team_b_ids, 1) != 2 THEN
    RAISE EXCEPTION 'Each team must have exactly 2 players'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validate no overlap
  FOREACH v_pid IN ARRAY p_team_a_ids LOOP
    IF v_pid = ANY(p_team_b_ids) THEN
      RAISE EXCEPTION 'Player % appears on both teams', v_pid
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- 5. Validate session attendees
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

  -- 6. Validate scores
  v_winner := GREATEST(p_team_a_score, p_team_b_score);
  v_loser  := LEAST(p_team_a_score, p_team_b_score);

  IF v_winner < 11 OR (v_winner - v_loser) < 2 THEN
    RAISE EXCEPTION 'Invalid score: Winner must have 11+ and lead by 2'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Compute Fingerprint (Order-Invariant)
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
      CONVERT_TO(v_lo || '|' || v_hi || '|' || v_score_part, 'UTF8'),
      'sha256'::text
    ),
    'hex'::text
  );

  -- 8. Duplicate check (Skip if forced)
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

  -- 9. Atomic Sequence & Insertion
  SELECT COALESCE(MAX(sequence_num), 0) + 1
    INTO v_sequence_num
    FROM public.games
   WHERE session_id = p_session_id;

  INSERT INTO public.games (
    session_id, sequence_num, team_a_score, team_b_score, dedupe_key
  )
  VALUES (
    p_session_id, v_sequence_num, p_team_a_score, p_team_b_score, v_fingerprint
  )
  RETURNING id INTO v_game_id;

  -- 10. Insert Players
  INSERT INTO public.game_players (game_id, player_id, team)
  SELECT v_game_id, id, 'A' FROM UNNEST(p_team_a_ids) AS id;

  INSERT INTO public.game_players (game_id, player_id, team)
  SELECT v_game_id, id, 'B' FROM UNNEST(p_team_b_ids) AS id;

  -- 11. Final Return
  RETURN JSONB_BUILD_OBJECT(
    'status', 'inserted',
    'game_id', v_game_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_game(uuid, uuid[], uuid[], integer, integer, boolean) TO anon;


-- ── 4. Recreate courts RPCs (remove 4-hour checks) ─────────
-- Each function below is identical to M8.0 except the
-- SESSION_EXPIRED / 4-hour block is removed.


-- ────────────────────────────────────────────────────────────
-- RPC 1: init_courts
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.init_courts(
  p_session_id  uuid,
  p_join_code   text,
  p_court_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session   record;
  v_current   integer;
  v_i         integer;
BEGIN
  IF p_court_count < 1 OR p_court_count > 8 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COUNT', 'message', 'Court count must be between 1 and 8'));
  END IF;

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

  SELECT count(*)::integer INTO v_current
    FROM public.session_courts
   WHERE session_id = p_session_id;

  IF p_court_count > v_current THEN
    FOR v_i IN (v_current + 1)..p_court_count LOOP
      INSERT INTO public.session_courts (session_id, court_number)
      VALUES (p_session_id, v_i);
    END LOOP;
  ELSIF p_court_count < v_current THEN
    IF EXISTS (
      SELECT 1 FROM public.session_courts
       WHERE session_id = p_session_id
         AND court_number > p_court_count
         AND (status = 'IN_PROGRESS' OR team_a_ids IS NOT NULL OR team_b_ids IS NOT NULL)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'COURT_NOT_EMPTY', 'message', 'Clear court assignments before reducing court count.'));
    END IF;

    DELETE FROM public.session_courts
     WHERE session_id = p_session_id
       AND court_number > p_court_count;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('court_count', p_court_count));
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 2: assign_courts
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_courts(
  p_session_id  uuid,
  p_join_code   text,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session       record;
  v_entry         jsonb;
  v_court_num     integer;
  v_team_a        uuid[];
  v_team_b        uuid[];
  v_all_players   uuid[] := '{}';
  v_court_nums    integer[] := '{}';
  v_court         record;
  v_pid           uuid;
  v_count         integer := 0;
  v_existing      record;
BEGIN
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

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_court_num := (v_entry->>'court_number')::integer;

    SELECT array_agg(elem::text::uuid)
      INTO v_team_a
      FROM jsonb_array_elements_text(v_entry->'team_a_ids') elem;

    SELECT array_agg(elem::text::uuid)
      INTO v_team_b
      FROM jsonb_array_elements_text(v_entry->'team_b_ids') elem;

    IF v_team_a IS NULL OR array_length(v_team_a, 1) != 2 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
          format('Court %s: team_a must have exactly 2 players', v_court_num)));
    END IF;
    IF v_team_b IS NULL OR array_length(v_team_b, 1) != 2 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
          format('Court %s: team_b must have exactly 2 players', v_court_num)));
    END IF;
    IF array_position(v_team_a, NULL) IS NOT NULL OR array_position(v_team_b, NULL) IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
          format('Court %s: team arrays cannot contain NULLs', v_court_num)));
    END IF;

    FOREACH v_pid IN ARRAY v_team_a LOOP
      IF v_pid = ANY(v_team_b) THEN
        RETURN jsonb_build_object('ok', false, 'error',
          jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
            format('Court %s: player %s on both teams', v_court_num, v_pid)));
      END IF;
    END LOOP;

    IF v_court_num = ANY(v_court_nums) THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
          format('Duplicate court number %s in payload', v_court_num)));
    END IF;
    v_court_nums := v_court_nums || v_court_num;

    FOREACH v_pid IN ARRAY (v_team_a || v_team_b) LOOP
      IF v_pid = ANY(v_all_players) THEN
        RETURN jsonb_build_object('ok', false, 'error',
          jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
            format('Player %s assigned to multiple courts', v_pid)));
      END IF;
      v_all_players := v_all_players || v_pid;
    END LOOP;
  END LOOP;

  FOREACH v_pid IN ARRAY v_all_players LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.session_players
       WHERE session_id = p_session_id
         AND player_id = v_pid
         AND status = 'ACTIVE'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
          format('Player %s is not active in this session', v_pid)));
    END IF;
  END LOOP;

  FOREACH v_pid IN ARRAY v_all_players LOOP
    IF EXISTS (
      SELECT 1 FROM public.session_courts
       WHERE session_id = p_session_id
         AND status = 'IN_PROGRESS'
         AND (v_pid = ANY(team_a_ids) OR v_pid = ANY(team_b_ids))
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'PLAYER_IN_PROGRESS', 'message',
          format('Player %s is on an in-progress court', v_pid)));
    END IF;
  END LOOP;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_court_num := (v_entry->>'court_number')::integer;

    SELECT array_agg(elem::text::uuid)
      INTO v_team_a
      FROM jsonb_array_elements_text(v_entry->'team_a_ids') elem;

    SELECT array_agg(elem::text::uuid)
      INTO v_team_b
      FROM jsonb_array_elements_text(v_entry->'team_b_ids') elem;

    SELECT id, status INTO v_existing
      FROM public.session_courts
     WHERE session_id = p_session_id
       AND court_number = v_court_num;

    IF v_existing.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
          format('Court %s does not exist', v_court_num)));
    END IF;

    IF v_existing.status != 'OPEN' THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'STALE_STATE', 'message',
          format('Court %s is not OPEN', v_court_num)));
    END IF;

    UPDATE public.session_courts
       SET team_a_ids = v_team_a,
           team_b_ids = v_team_b,
           status = 'IN_PROGRESS',
           assigned_at = now()
     WHERE session_id = p_session_id
       AND court_number = v_court_num;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('courts_assigned', v_count));
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 3: start_court_game
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_court_game(
  p_session_id   uuid,
  p_join_code    text,
  p_court_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session record;
  v_court   record;
BEGIN
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

  SELECT id, status, team_a_ids, team_b_ids
    INTO v_court
    FROM public.session_courts
   WHERE session_id = p_session_id
     AND court_number = p_court_number;

  IF v_court.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COURT', 'message', 'Court does not exist'));
  END IF;

  IF v_court.status != 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'STALE_STATE', 'message', 'Court is not OPEN'));
  END IF;

  IF v_court.team_a_ids IS NULL OR v_court.team_b_ids IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'COURT_NOT_FULL', 'message', 'Court must have all 4 players assigned'));
  END IF;
  IF array_position(v_court.team_a_ids, NULL) IS NOT NULL
     OR array_position(v_court.team_b_ids, NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'COURT_NOT_FULL', 'message', 'Court has empty player slots'));
  END IF;

  UPDATE public.session_courts
     SET status = 'IN_PROGRESS',
         assigned_at = now()
   WHERE id = v_court.id;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('court_number', p_court_number, 'status', 'IN_PROGRESS'));
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 4: record_court_game
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_court_game(
  p_session_id     uuid,
  p_join_code      text,
  p_court_number   integer,
  p_team_a_score   integer,
  p_team_b_score   integer,
  p_force          boolean DEFAULT false
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

  v_record_result := public.record_game(
    p_session_id,
    v_team_a_ids,
    v_team_b_ids,
    p_team_a_score,
    p_team_b_score,
    p_force
  );

  IF v_record_result->>'status' = 'possible_duplicate' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'POSSIBLE_DUPLICATE', 'message', 'Possible duplicate game detected',
        'existing_game_id', v_record_result->>'existing_game_id',
        'existing_created_at', v_record_result->>'existing_created_at'));
  END IF;

  v_game_id := (v_record_result->>'game_id')::uuid;

  UPDATE public.session_courts
     SET status = 'OPEN',
         team_a_ids = NULL,
         team_b_ids = NULL,
         assigned_at = NULL,
         last_game_id = v_game_id
   WHERE id = v_court.id;

  UPDATE public.session_players
     SET status = 'INACTIVE',
         inactive_effective_after_game = false
   WHERE session_id = p_session_id
     AND player_id = ANY(v_all_player_ids)
     AND inactive_effective_after_game = true;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('game_id', v_game_id));
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 5: update_court_assignment
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_court_assignment(
  p_session_id   uuid,
  p_join_code    text,
  p_court_number integer,
  p_team         text,
  p_slot         integer,
  p_player_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session   record;
  v_court     record;
  v_other     record;
  v_arr       uuid[];
  v_slot_idx  integer;
BEGIN
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

  IF p_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Team must be A or B'));
  END IF;
  IF p_slot NOT IN (1, 2) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Slot must be 1 or 2'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.session_players
     WHERE session_id = p_session_id
       AND player_id = p_player_id
       AND status = 'ACTIVE'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_PLAYER', 'message', 'Player is not active in this session'));
  END IF;

  SELECT id, status, team_a_ids, team_b_ids
    INTO v_court
    FROM public.session_courts
   WHERE session_id = p_session_id
     AND court_number = p_court_number;

  IF v_court.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COURT', 'message', 'Court does not exist'));
  END IF;

  IF v_court.status != 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'STALE_STATE', 'message', 'Court is not OPEN'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.session_courts
     WHERE session_id = p_session_id
       AND status = 'IN_PROGRESS'
       AND (p_player_id = ANY(team_a_ids) OR p_player_id = ANY(team_b_ids))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'PLAYER_IN_PROGRESS', 'message', 'Player is on an in-progress court'));
  END IF;

  FOR v_other IN
    SELECT id, team_a_ids, team_b_ids
      FROM public.session_courts
     WHERE session_id = p_session_id
       AND court_number != p_court_number
       AND status = 'OPEN'
       AND (p_player_id = ANY(team_a_ids) OR p_player_id = ANY(team_b_ids))
  LOOP
    UPDATE public.session_courts
       SET team_a_ids = CASE
             WHEN team_a_ids[1] = p_player_id THEN ARRAY[NULL::uuid, team_a_ids[2]]
             WHEN team_a_ids[2] = p_player_id THEN ARRAY[team_a_ids[1], NULL::uuid]
             ELSE team_a_ids
           END,
           team_b_ids = CASE
             WHEN team_b_ids[1] = p_player_id THEN ARRAY[NULL::uuid, team_b_ids[2]]
             WHEN team_b_ids[2] = p_player_id THEN ARRAY[team_b_ids[1], NULL::uuid]
             ELSE team_b_ids
           END
     WHERE id = v_other.id;

    UPDATE public.session_courts
       SET team_a_ids = CASE
             WHEN team_a_ids[1] IS NULL AND team_a_ids[2] IS NULL THEN NULL
             ELSE team_a_ids
           END,
           team_b_ids = CASE
             WHEN team_b_ids[1] IS NULL AND team_b_ids[2] IS NULL THEN NULL
             ELSE team_b_ids
           END
     WHERE id = v_other.id;
  END LOOP;

  IF p_team = 'A' THEN
    v_arr := COALESCE(v_court.team_a_ids, ARRAY[NULL::uuid, NULL::uuid]);
    v_arr[p_slot] := p_player_id;
    UPDATE public.session_courts
       SET team_a_ids = v_arr
     WHERE id = v_court.id;
  ELSE
    v_arr := COALESCE(v_court.team_b_ids, ARRAY[NULL::uuid, NULL::uuid]);
    v_arr[p_slot] := p_player_id;
    UPDATE public.session_courts
       SET team_b_ids = v_arr
     WHERE id = v_court.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('court_number', p_court_number, 'status', 'OPEN'));
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 6: clear_court_slot
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_court_slot(
  p_session_id   uuid,
  p_join_code    text,
  p_court_number integer,
  p_team         text,
  p_slot         integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session record;
  v_court   record;
  v_arr     uuid[];
BEGIN
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

  IF p_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Team must be A or B'));
  END IF;
  IF p_slot NOT IN (1, 2) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Slot must be 1 or 2'));
  END IF;

  SELECT id, status, team_a_ids, team_b_ids
    INTO v_court
    FROM public.session_courts
   WHERE session_id = p_session_id
     AND court_number = p_court_number;

  IF v_court.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COURT', 'message', 'Court does not exist'));
  END IF;

  IF v_court.status != 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'STALE_STATE', 'message', 'Court is not OPEN'));
  END IF;

  IF p_team = 'A' THEN
    v_arr := v_court.team_a_ids;
    IF v_arr IS NOT NULL THEN
      v_arr[p_slot] := NULL;
      IF v_arr[1] IS NULL AND v_arr[2] IS NULL THEN
        v_arr := NULL;
      END IF;
    END IF;
    UPDATE public.session_courts
       SET team_a_ids = v_arr
     WHERE id = v_court.id;
  ELSE
    v_arr := v_court.team_b_ids;
    IF v_arr IS NOT NULL THEN
      v_arr[p_slot] := NULL;
      IF v_arr[1] IS NULL AND v_arr[2] IS NULL THEN
        v_arr := NULL;
      END IF;
    END IF;
    UPDATE public.session_courts
       SET team_b_ids = v_arr
     WHERE id = v_court.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('court_number', p_court_number));
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 7: mark_player_out
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_player_out(
  p_session_id uuid,
  p_join_code  text,
  p_player_id  uuid,
  p_mode       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session     record;
  v_court       record;
  v_sp          record;
BEGIN
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

  IF p_mode NOT IN ('immediate', 'after_game') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Mode must be immediate or after_game'));
  END IF;

  SELECT id, status INTO v_sp
    FROM public.session_players
   WHERE session_id = p_session_id
     AND player_id = p_player_id;

  IF v_sp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_PLAYER', 'message', 'Player is not in this session'));
  END IF;

  IF p_mode = 'immediate' THEN
    FOR v_court IN
      SELECT id, court_number, status, team_a_ids, team_b_ids
        FROM public.session_courts
       WHERE session_id = p_session_id
         AND (p_player_id = ANY(team_a_ids) OR p_player_id = ANY(team_b_ids))
    LOOP
      IF v_court.status = 'IN_PROGRESS' THEN
        UPDATE public.session_courts
           SET status = 'OPEN',
               team_a_ids = NULL,
               team_b_ids = NULL,
               assigned_at = NULL
         WHERE id = v_court.id;
      ELSE
        UPDATE public.session_courts
           SET team_a_ids = CASE
                 WHEN team_a_ids[1] = p_player_id THEN ARRAY[NULL::uuid, team_a_ids[2]]
                 WHEN team_a_ids[2] = p_player_id THEN ARRAY[team_a_ids[1], NULL::uuid]
                 ELSE team_a_ids
               END,
               team_b_ids = CASE
                 WHEN team_b_ids[1] = p_player_id THEN ARRAY[NULL::uuid, team_b_ids[2]]
                 WHEN team_b_ids[2] = p_player_id THEN ARRAY[team_b_ids[1], NULL::uuid]
                 ELSE team_b_ids
               END
         WHERE id = v_court.id;

        UPDATE public.session_courts
           SET team_a_ids = CASE
                 WHEN team_a_ids[1] IS NULL AND team_a_ids[2] IS NULL THEN NULL
                 ELSE team_a_ids
               END,
               team_b_ids = CASE
                 WHEN team_b_ids[1] IS NULL AND team_b_ids[2] IS NULL THEN NULL
                 ELSE team_b_ids
               END
         WHERE id = v_court.id;
      END IF;
    END LOOP;

    UPDATE public.session_players
       SET status = 'INACTIVE',
           inactive_effective_after_game = false
     WHERE session_id = p_session_id
       AND player_id = p_player_id;

  ELSIF p_mode = 'after_game' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.session_courts
       WHERE session_id = p_session_id
         AND status = 'IN_PROGRESS'
         AND (p_player_id = ANY(team_a_ids) OR p_player_id = ANY(team_b_ids))
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'NOT_ON_COURT', 'message',
          'Player is not on an in-progress court. Use immediate mode instead.'));
    END IF;

    UPDATE public.session_players
       SET inactive_effective_after_game = true
     WHERE session_id = p_session_id
       AND player_id = p_player_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object());
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 8: make_player_active
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.make_player_active(
  p_session_id uuid,
  p_join_code  text,
  p_player_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session record;
  v_sp      record;
BEGIN
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

  SELECT id, status INTO v_sp
    FROM public.session_players
   WHERE session_id = p_session_id
     AND player_id = p_player_id;

  IF v_sp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_PLAYER', 'message', 'Player is not in this session'));
  END IF;

  UPDATE public.session_players
     SET status = 'ACTIVE',
         inactive_reason = NULL,
         inactive_effective_after_game = false
   WHERE session_id = p_session_id
     AND player_id = p_player_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object());
END;
$$;


-- ────────────────────────────────────────────────────────────
-- RPC 9: update_court_count
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_court_count(
  p_session_id  uuid,
  p_join_code   text,
  p_court_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_session  record;
  v_current  integer;
  v_i        integer;
BEGIN
  IF p_court_count < 1 OR p_court_count > 8 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COUNT', 'message', 'Court count must be between 1 and 8'));
  END IF;

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

  SELECT count(*)::integer INTO v_current
    FROM public.session_courts
   WHERE session_id = p_session_id;

  IF p_court_count > v_current THEN
    FOR v_i IN (v_current + 1)..p_court_count LOOP
      INSERT INTO public.session_courts (session_id, court_number)
      VALUES (p_session_id, v_i);
    END LOOP;
  ELSIF p_court_count < v_current THEN
    IF EXISTS (
      SELECT 1 FROM public.session_courts
       WHERE session_id = p_session_id
         AND court_number > p_court_count
         AND (status = 'IN_PROGRESS' OR team_a_ids IS NOT NULL OR team_b_ids IS NOT NULL)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'COURT_NOT_EMPTY', 'message', 'Clear court assignments before reducing court count.'));
    END IF;

    DELETE FROM public.session_courts
     WHERE session_id = p_session_id
       AND court_number > p_court_count;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('court_count', p_court_count));
END;
$$;
