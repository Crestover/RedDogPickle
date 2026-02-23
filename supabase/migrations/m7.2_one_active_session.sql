-- ============================================================
-- M7.2: Enforce one active session per group
--
-- Fixes M-1: Two users clicking "Start Session" simultaneously
-- can create duplicate active sessions for the same group.
--
-- Solution:
--   1. Partial unique index prevents >1 active session per group
--   2. create_session catches unique_violation and returns the
--      existing active session ID instead of erroring
-- ============================================================

-- ── 1. Partial unique index ───────────────────────────────────
-- Only one row per group_id can have ended_at IS NULL at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_group
  ON public.sessions(group_id)
  WHERE ended_at IS NULL;

-- ── 2. Updated create_session RPC ─────────────────────────────
-- Catches the unique violation from the partial index and returns
-- the existing active session ID instead of raising an error.
-- This makes concurrent "Start Session" clicks idempotent.

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

  -- Attempt insert; catch unique violation from partial index
  BEGIN
    INSERT INTO public.sessions (group_id, session_date, name, started_at)
    VALUES (v_group_id, current_date, v_label, now())
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another session is already active for this group.
    -- Return the existing active session ID instead of failing.
    SELECT s.id INTO v_session_id
      FROM public.sessions s
     WHERE s.group_id = v_group_id
       AND s.ended_at IS NULL
     LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      RETURN v_session_id;
    END IF;

    -- Should not happen, but re-raise if no active session found
    RAISE;
  END;

  -- Insert session_players (attendance)
  FOREACH v_pid IN ARRAY player_ids LOOP
    INSERT INTO public.session_players (session_id, player_id)
    VALUES (v_session_id, v_pid)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_session_id;
END;
$$;

-- Grant anon role permission to call this RPC
GRANT EXECUTE ON FUNCTION public.create_session(text, uuid[]) TO anon;
