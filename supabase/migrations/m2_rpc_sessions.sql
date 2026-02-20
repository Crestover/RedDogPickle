-- ============================================================
-- Milestone 2 Migration — RPC-based session management
-- Apply this delta to an existing database that already has
-- the M0 schema (supabase/schema.sql) applied.
--
-- Run the blocks IN ORDER in the Supabase SQL Editor.
-- See docs/how-to-update-schema.md for the apply procedure.
-- ============================================================

-- ------------------------------------------------------------
-- BLOCK 1: join_code canonicalization
--
-- The schema already has a regex CHECK that only allows
-- lowercase characters, but we add an explicit equality check
-- to make the intent machine-verifiable.
-- ------------------------------------------------------------

-- 1a. Normalize any existing rows to lowercase (safe no-op if already lowercase)
update public.groups
set join_code = lower(join_code)
where join_code <> lower(join_code);

-- 1b. Add CHECK that enforces join_code = lower(join_code) at the DB level.
--     The existing regex ^[a-z0-9\-]+$ already implies this, but belt-and-suspenders.
alter table public.groups
  add constraint groups_join_code_lowercase
  check (join_code = lower(join_code));

-- ------------------------------------------------------------
-- BLOCK 2: create_session RPC
--
-- Atomically creates a session + session_players rows.
-- Validates: group exists, player_ids length >= 4.
-- Returns: the new session UUID.
-- Security: SECURITY INVOKER (runs as caller = anon).
--   INSERT is permitted for anon via RLS policy, so this works.
--   No elevated privilege needed for inserts.
-- ------------------------------------------------------------

create or replace function public.create_session(
  group_join_code text,
  player_ids      uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group_id   uuid;
  v_group_name text;
  v_session_id uuid;
  v_label      text;
  v_codes      text[];
  v_pid        uuid;
  v_code       text;
begin
  -- Validate: group must exist
  select id, name
    into v_group_id, v_group_name
    from public.groups
   where join_code = lower(group_join_code);

  if v_group_id is null then
    raise exception 'Group not found: %', group_join_code
      using errcode = 'P0002';
  end if;

  -- Validate: must have at least 4 players
  if array_length(player_ids, 1) is null or array_length(player_ids, 1) < 4 then
    raise exception 'At least 4 players are required to start a session'
      using errcode = 'P0003';
  end if;

  -- Build sorted player codes for session label
  -- Format: YYYY-MM-DD CODE CODE CODE ...
  select array_agg(p.code order by p.code)
    into v_codes
    from public.players p
   where p.id = any(player_ids)
     and p.group_id = v_group_id;

  v_label := to_char(current_date, 'YYYY-MM-DD') || ' ' || array_to_string(v_codes, ' ');

  -- Insert session
  insert into public.sessions (group_id, session_date, name, started_at)
  values (v_group_id, current_date, v_label, now())
  returning id into v_session_id;

  -- Insert session_players (attendance)
  foreach v_pid in array player_ids loop
    insert into public.session_players (session_id, player_id)
    values (v_session_id, v_pid)
    on conflict do nothing;  -- idempotent: ignore duplicate player_id
  end loop;

  return v_session_id;
end;
$$;

-- Grant anon role permission to call this RPC
grant execute on function public.create_session(text, uuid[]) to anon;


-- ------------------------------------------------------------
-- BLOCK 3: end_session RPC
--
-- Sets ended_at = now() and closed_reason = 'manual'.
-- SECURITY DEFINER so it can UPDATE sessions even though
-- no anon UPDATE policy exists — preserving the RLS posture
-- (no public UPDATE policy on sessions).
-- Validates: session must exist.
-- ------------------------------------------------------------

create or replace function public.end_session(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  -- Validate: session must exist
  select exists(
    select 1 from public.sessions where id = p_session_id
  ) into v_exists;

  if not v_exists then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'P0002';
  end if;

  -- Only update if not already ended (idempotent — safe to call twice)
  update public.sessions
     set ended_at      = now(),
         closed_reason = 'manual'
   where id       = p_session_id
     and ended_at is null;
end;
$$;

-- Grant anon role permission to call this RPC
grant execute on function public.end_session(uuid) to anon;


-- ------------------------------------------------------------
-- VERIFICATION QUERIES (run after applying above blocks)
-- ------------------------------------------------------------
-- Check constraint exists:
--   select conname from pg_constraint where conname = 'groups_join_code_lowercase';
--
-- Check functions exist:
--   select proname, prosecdef from pg_proc
--   where proname in ('create_session', 'end_session');
--   (prosecdef = true means SECURITY DEFINER)
--
-- Check grants:
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_name in ('create_session', 'end_session');
-- ------------------------------------------------------------
