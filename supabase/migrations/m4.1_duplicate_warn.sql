-- ============================================================
-- Milestone 4.1: Duplicate warn-and-confirm (replaces hard-block)
--
-- Delta migration — apply to existing DB after m4_record_game.sql.
-- ============================================================

-- ── Step 1: Drop unique constraint on dedupe_key ────────────
-- Allows deliberate duplicate re-entry; recency check handles accidental dups.
ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_dedupe_key_unique;


-- ── Step 2: Clean up existing signatures ────────────────────
-- Ensure no ambiguous function versions remain.
DROP FUNCTION IF EXISTS public.record_game(uuid, uuid[], uuid[], integer, integer);
DROP FUNCTION IF EXISTS public.record_game(uuid, uuid[], uuid[], integer, integer, boolean);


-- ── Step 3: Create refined record_game RPC ──────────────────
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
SET search_path = public
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
  -- 1. Validate session exists
  SELECT id, ended_at, started_at
    INTO v_session
    FROM public.sessions
   WHERE id = p_session_id;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validate session is active (4-hour rule)
  IF v_session.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Session has already ended'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RAISE EXCEPTION 'Session has expired (older than 4 hours)'
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

  -- 10. Insert Players (using verified 'team' column)
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.record_game(uuid, uuid[], uuid[], integer, integer, boolean) TO anon;