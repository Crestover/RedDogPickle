-- ============================================================
-- M8.0: Courts Mode V2 — Full Server Persistence
--
-- Adds:
--   1. session_courts table with CHECK + trigger constraints
--   2. status/inactive columns on session_players
--   3. Nine RPCs for court lifecycle management
--   4. RLS policies (anon SELECT only on session_courts)
--   5. Indexes
--
-- All court mutations happen through SECURITY DEFINER RPCs.
-- Every mutating RPC accepts p_join_code for group-scoped access
-- and uses FOR UPDATE to serialize concurrent mutations.
-- Standardized return shape: {ok, error?, data?}
-- ============================================================

-- ============================================================
-- 1. NEW TABLE: session_courts
-- ============================================================

CREATE TABLE public.session_courts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.sessions(id),
  court_number  integer NOT NULL,
  status        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS')),
  team_a_ids    uuid[],
  team_b_ids    uuid[],
  assigned_at   timestamptz,
  last_game_id  uuid REFERENCES public.games(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, court_number),

  -- Arrays must always be length 2 when non-null
  CONSTRAINT session_courts_array_length CHECK (
    (team_a_ids IS NULL OR array_length(team_a_ids, 1) = 2)
    AND (team_b_ids IS NULL OR array_length(team_b_ids, 1) = 2)
  )
);

-- Index for session lookups
CREATE INDEX idx_session_courts_session_id ON public.session_courts(session_id);

-- ── Trigger: enforce IN_PROGRESS invariants + no duplicates ──

CREATE OR REPLACE FUNCTION public.validate_session_court_state()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_all_ids uuid[];
BEGIN
  IF NEW.status = 'IN_PROGRESS' THEN
    -- Must have non-null complete teams
    IF NEW.team_a_ids IS NULL OR NEW.team_b_ids IS NULL THEN
      RAISE EXCEPTION 'IN_PROGRESS court must have team arrays' USING ERRCODE = 'P0001';
    END IF;
    IF array_position(NEW.team_a_ids, NULL) IS NOT NULL
       OR array_position(NEW.team_b_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'IN_PROGRESS court cannot have NULL slots' USING ERRCODE = 'P0001';
    END IF;
    -- All 4 must be distinct
    v_all_ids := NEW.team_a_ids || NEW.team_b_ids;
    IF (SELECT count(DISTINCT u) FROM unnest(v_all_ids) u) < 4 THEN
      RAISE EXCEPTION 'IN_PROGRESS court must have 4 distinct players' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- For any status: no duplicate players within same court (when arrays non-null)
  IF NEW.team_a_ids IS NOT NULL AND NEW.team_b_ids IS NOT NULL THEN
    v_all_ids := array_remove(NEW.team_a_ids, NULL) || array_remove(NEW.team_b_ids, NULL);
    IF (SELECT count(u) FROM unnest(v_all_ids) u) >
       (SELECT count(DISTINCT u) FROM unnest(v_all_ids) u) THEN
      RAISE EXCEPTION 'Duplicate player on same court' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_session_court_state
  BEFORE INSERT OR UPDATE ON public.session_courts
  FOR EACH ROW EXECUTE FUNCTION public.validate_session_court_state();

-- ── RLS: anon SELECT only (all writes via SECURITY DEFINER RPCs) ──

ALTER TABLE public.session_courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_session_courts"
  ON public.session_courts FOR SELECT TO anon USING (true);


-- ============================================================
-- 2. ADD COLUMNS TO session_players
-- ============================================================

ALTER TABLE public.session_players
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE public.session_players
  ADD COLUMN IF NOT EXISTS inactive_reason text;

ALTER TABLE public.session_players
  ADD COLUMN IF NOT EXISTS inactive_effective_after_game boolean NOT NULL DEFAULT false;


-- ============================================================
-- 3. RPCs (9 total)
--
-- Every mutating RPC follows this pattern:
--   - Accepts p_session_id uuid, p_join_code text
--   - FOR UPDATE OF s to lock session row
--   - Validates group ownership via join_code
--   - Validates session is active (not ended, not expired)
--   - Returns jsonb: {ok: true, data: {...}} or {ok: false, error: {code, message}}
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- RPC 1: init_courts
-- Create/adjust court rows. Idempotent. Only adds/removes empty OPEN courts.
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
  -- Clamp court count
  IF p_court_count < 1 OR p_court_count > 8 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COUNT', 'message', 'Court count must be between 1 and 8'));
  END IF;

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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
  END IF;

  -- Current court count
  SELECT count(*)::integer INTO v_current
    FROM public.session_courts
   WHERE session_id = p_session_id;

  IF p_court_count > v_current THEN
    -- Add courts
    FOR v_i IN (v_current + 1)..p_court_count LOOP
      INSERT INTO public.session_courts (session_id, court_number)
      VALUES (p_session_id, v_i);
    END LOOP;
  ELSIF p_court_count < v_current THEN
    -- Remove empty OPEN courts from the highest numbers down
    -- Reject if any court to be removed is non-empty or IN_PROGRESS
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

GRANT EXECUTE ON FUNCTION public.init_courts(uuid, text, integer) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 2: assign_courts
-- Persist Suggest output. Validates courts are OPEN, players
-- ACTIVE & not on IN_PROGRESS courts. Sets status=IN_PROGRESS.
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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
  END IF;

  -- ── Payload self-consistency checks ──

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_court_num := (v_entry->>'court_number')::integer;

    -- Parse team arrays from jsonb
    SELECT array_agg(elem::text::uuid)
      INTO v_team_a
      FROM jsonb_array_elements_text(v_entry->'team_a_ids') elem;

    SELECT array_agg(elem::text::uuid)
      INTO v_team_b
      FROM jsonb_array_elements_text(v_entry->'team_b_ids') elem;

    -- Each entry must have exactly 2 per team with no NULLs
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

    -- No overlap between teams within a court
    FOREACH v_pid IN ARRAY v_team_a LOOP
      IF v_pid = ANY(v_team_b) THEN
        RETURN jsonb_build_object('ok', false, 'error',
          jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
            format('Court %s: player %s on both teams', v_court_num, v_pid)));
      END IF;
    END LOOP;

    -- Court numbers must be unique in payload
    IF v_court_num = ANY(v_court_nums) THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
          format('Duplicate court number %s in payload', v_court_num)));
    END IF;
    v_court_nums := v_court_nums || v_court_num;

    -- No player appears more than once across ALL assignments
    FOREACH v_pid IN ARRAY (v_team_a || v_team_b) LOOP
      IF v_pid = ANY(v_all_players) THEN
        RETURN jsonb_build_object('ok', false, 'error',
          jsonb_build_object('code', 'INVALID_ASSIGNMENT', 'message',
            format('Player %s assigned to multiple courts', v_pid)));
      END IF;
      v_all_players := v_all_players || v_pid;
    END LOOP;
  END LOOP;

  -- ── State validation ──

  -- Validate all players are ACTIVE in session_players
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

  -- Validate no player is on any IN_PROGRESS court
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

  -- ── Apply assignments ──

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_court_num := (v_entry->>'court_number')::integer;

    SELECT array_agg(elem::text::uuid)
      INTO v_team_a
      FROM jsonb_array_elements_text(v_entry->'team_a_ids') elem;

    SELECT array_agg(elem::text::uuid)
      INTO v_team_b
      FROM jsonb_array_elements_text(v_entry->'team_b_ids') elem;

    -- Validate court exists and is OPEN
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

    -- Update court: set teams, status=IN_PROGRESS, assigned_at=now()
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

GRANT EXECUTE ON FUNCTION public.assign_courts(uuid, text, jsonb) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 3: start_court_game
-- Explicit OPEN -> IN_PROGRESS transition for manually filled courts.
-- Validates court has 4 non-null players assigned.
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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
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

  IF v_court.status != 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'STALE_STATE', 'message', 'Court is not OPEN'));
  END IF;

  -- Validate all 4 slots filled (non-NULL)
  IF v_court.team_a_ids IS NULL OR v_court.team_b_ids IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'COURT_NOT_FULL', 'message', 'Court must have all 4 players assigned'));
  END IF;
  IF array_position(v_court.team_a_ids, NULL) IS NOT NULL
     OR array_position(v_court.team_b_ids, NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'COURT_NOT_FULL', 'message', 'Court has empty player slots'));
  END IF;

  -- Transition to IN_PROGRESS
  UPDATE public.session_courts
     SET status = 'IN_PROGRESS',
         assigned_at = now()
   WHERE id = v_court.id;

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('court_number', p_court_number, 'status', 'IN_PROGRESS'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_court_game(uuid, text, integer) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 4: record_court_game
-- Reads teams from court -> calls record_game() internally ->
-- resets court to OPEN -> processes pending inactives.
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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
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

  -- Call record_game() internally (reuses all validation/dedup/insertion)
  -- Note: record_game also does FOR UPDATE on sessions, but we already hold the lock
  v_record_result := public.record_game(
    p_session_id,
    v_team_a_ids,
    v_team_b_ids,
    p_team_a_score,
    p_team_b_score,
    p_force
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

  RETURN jsonb_build_object('ok', true, 'data',
    jsonb_build_object('game_id', v_game_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_court_game(uuid, text, integer, integer, integer, boolean) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 5: update_court_assignment
-- Manual slot tap. Court must be OPEN. Removes player from
-- other OPEN courts. No auto-transition.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_court_assignment(
  p_session_id   uuid,
  p_join_code    text,
  p_court_number integer,
  p_team         text,     -- 'A' or 'B'
  p_slot         integer,  -- 1 or 2 (1-indexed)
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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
  END IF;

  -- Validate inputs
  IF p_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Team must be A or B'));
  END IF;
  IF p_slot NOT IN (1, 2) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Slot must be 1 or 2'));
  END IF;

  -- Validate player is ACTIVE in session
  IF NOT EXISTS (
    SELECT 1 FROM public.session_players
     WHERE session_id = p_session_id
       AND player_id = p_player_id
       AND status = 'ACTIVE'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_PLAYER', 'message', 'Player is not active in this session'));
  END IF;

  -- Fetch target court
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

  -- Check if player is on an IN_PROGRESS court
  IF EXISTS (
    SELECT 1 FROM public.session_courts
     WHERE session_id = p_session_id
       AND status = 'IN_PROGRESS'
       AND (p_player_id = ANY(team_a_ids) OR p_player_id = ANY(team_b_ids))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'PLAYER_IN_PROGRESS', 'message', 'Player is on an in-progress court'));
  END IF;

  -- Remove player from any other OPEN courts (never touch IN_PROGRESS)
  FOR v_other IN
    SELECT id, team_a_ids, team_b_ids
      FROM public.session_courts
     WHERE session_id = p_session_id
       AND court_number != p_court_number
       AND status = 'OPEN'
       AND (p_player_id = ANY(team_a_ids) OR p_player_id = ANY(team_b_ids))
  LOOP
    -- Clear the player's slot in the other court
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

    -- If both arrays are now fully null, set them to NULL
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

  -- Set the slot on the target court
  -- Initialize arrays if NULL
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

GRANT EXECUTE ON FUNCTION public.update_court_assignment(uuid, text, integer, text, integer, uuid) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 6: clear_court_slot
-- Clears one slot on an OPEN court.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_court_slot(
  p_session_id   uuid,
  p_join_code    text,
  p_court_number integer,
  p_team         text,     -- 'A' or 'B'
  p_slot         integer   -- 1 or 2 (1-indexed)
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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
  END IF;

  -- Validate inputs
  IF p_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Team must be A or B'));
  END IF;
  IF p_slot NOT IN (1, 2) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Slot must be 1 or 2'));
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

  IF v_court.status != 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'STALE_STATE', 'message', 'Court is not OPEN'));
  END IF;

  -- Clear the slot
  IF p_team = 'A' THEN
    v_arr := v_court.team_a_ids;
    IF v_arr IS NOT NULL THEN
      v_arr[p_slot] := NULL;
      -- If both slots are null, set entire array to NULL
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

GRANT EXECUTE ON FUNCTION public.clear_court_slot(uuid, text, integer, text, integer) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 7: mark_player_out
-- 'immediate': INACTIVE, clear from courts (revert IN_PROGRESS
--   to OPEN atomically if on one). 'after_game': set flag.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_player_out(
  p_session_id uuid,
  p_join_code  text,
  p_player_id  uuid,
  p_mode       text  -- 'immediate' or 'after_game'
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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
  END IF;

  -- Validate mode
  IF p_mode NOT IN ('immediate', 'after_game') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_INPUT', 'message', 'Mode must be immediate or after_game'));
  END IF;

  -- Validate player is in session
  SELECT id, status INTO v_sp
    FROM public.session_players
   WHERE session_id = p_session_id
     AND player_id = p_player_id;

  IF v_sp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_PLAYER', 'message', 'Player is not in this session'));
  END IF;

  IF p_mode = 'immediate' THEN
    -- Check if player is on any court
    FOR v_court IN
      SELECT id, court_number, status, team_a_ids, team_b_ids
        FROM public.session_courts
       WHERE session_id = p_session_id
         AND (p_player_id = ANY(team_a_ids) OR p_player_id = ANY(team_b_ids))
    LOOP
      IF v_court.status = 'IN_PROGRESS' THEN
        -- Atomic: clear ALL slots, revert to OPEN
        UPDATE public.session_courts
           SET status = 'OPEN',
               team_a_ids = NULL,
               team_b_ids = NULL,
               assigned_at = NULL
         WHERE id = v_court.id;
      ELSE
        -- OPEN court: clear just this player's slot
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

        -- Clean up fully-null arrays
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

    -- Set player INACTIVE
    UPDATE public.session_players
       SET status = 'INACTIVE',
           inactive_effective_after_game = false
     WHERE session_id = p_session_id
       AND player_id = p_player_id;

  ELSIF p_mode = 'after_game' THEN
    -- Validate player is on an IN_PROGRESS court
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

    -- Set the flag — player stays on court
    UPDATE public.session_players
       SET inactive_effective_after_game = true
     WHERE session_id = p_session_id
       AND player_id = p_player_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object());
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_player_out(uuid, text, uuid, text) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 8: make_player_active
-- Set ACTIVE, clear flags.
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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
  END IF;

  -- Validate player exists in session
  SELECT id, status INTO v_sp
    FROM public.session_players
   WHERE session_id = p_session_id
     AND player_id = p_player_id;

  IF v_sp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_PLAYER', 'message', 'Player is not in this session'));
  END IF;

  -- Set ACTIVE, clear all flags
  UPDATE public.session_players
     SET status = 'ACTIVE',
         inactive_reason = NULL,
         inactive_effective_after_game = false
   WHERE session_id = p_session_id
     AND player_id = p_player_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object());
END;
$$;

GRANT EXECUTE ON FUNCTION public.make_player_active(uuid, text, uuid) TO anon;


-- ────────────────────────────────────────────────────────────
-- RPC 9: update_court_count
-- Add/remove courts. Cannot remove IN_PROGRESS or non-empty
-- OPEN courts. Clamp 1-8.
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
  -- Clamp court count
  IF p_court_count < 1 OR p_court_count > 8 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'INVALID_COUNT', 'message', 'Court count must be between 1 and 8'));
  END IF;

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
  IF v_session.started_at < NOW() - INTERVAL '4 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code', 'SESSION_EXPIRED', 'message', 'Session expired (4-hour rule)'));
  END IF;

  -- Current court count
  SELECT count(*)::integer INTO v_current
    FROM public.session_courts
   WHERE session_id = p_session_id;

  IF p_court_count > v_current THEN
    -- Add courts
    FOR v_i IN (v_current + 1)..p_court_count LOOP
      INSERT INTO public.session_courts (session_id, court_number)
      VALUES (p_session_id, v_i);
    END LOOP;
  ELSIF p_court_count < v_current THEN
    -- Reject if any court to be removed is non-empty or IN_PROGRESS
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

GRANT EXECUTE ON FUNCTION public.update_court_count(uuid, text, integer) TO anon;
