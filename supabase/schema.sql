-- ============================================================
-- RedDog Pickle — Supabase Schema (canonical, from-scratch)
-- SPEC v1.3 MVP — updated through Milestone 2
--
-- RLS: SELECT + INSERT via anon key. No anon UPDATE/DELETE.
-- Session ending performed via SECURITY DEFINER RPC (end_session).
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- Groups
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null,
  created_at  timestamptz not null default now(),

  constraint groups_join_code_unique    unique (join_code),
  -- join_code: URL-safe lowercase alphanumeric + hyphen
  constraint groups_join_code_format    check (join_code ~ '^[a-z0-9\-]+$'),
  -- Belt-and-suspenders: explicit lowercase equality check
  constraint groups_join_code_lowercase check (join_code = lower(join_code))
);

-- Players
create table public.players (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id),
  display_name text not null,
  code         text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),

  constraint players_group_code_unique     unique (group_id, code),
  -- code: short uppercase alphanumeric identifier, e.g. "JDO"
  constraint players_code_format           check (code ~ '^[A-Z0-9]+$'),
  constraint players_display_name_nonempty check (length(trim(display_name)) > 0)
);

-- Sessions
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id),
  session_date   date not null,
  name           text not null,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  closed_reason  text,
  created_at     timestamptz not null default now(),

  constraint sessions_closed_reason_values check (
    closed_reason is null or closed_reason in ('manual', 'auto')
  ),
  constraint sessions_ended_after_started check (
    ended_at is null or ended_at >= started_at
  )
);

-- Session Players (Attendance)
create table public.session_players (
  session_id  uuid not null references public.sessions(id),
  player_id   uuid not null references public.players(id),
  created_at  timestamptz not null default now(),

  constraint session_players_pk primary key (session_id, player_id)
);

-- Games
create table public.games (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.sessions(id),
  played_at            timestamptz not null default now(),
  sequence_num         integer not null,
  team_a_score         integer not null,
  team_b_score         integer not null,
  dedupe_key           text not null,
  created_by_player_id uuid references public.players(id),
  created_at           timestamptz not null default now(),

  -- games_dedupe_key_unique intentionally removed in M4.1:
  -- fingerprint has no time bucket so the same scoreline played a second
  -- time would be permanently blocked. The RPC's 15-min recency check is
  -- the duplicate gate; dedupe_key is retained for auditability only.
  constraint games_scores_nonnegative    check (team_a_score >= 0 and team_b_score >= 0),
  constraint games_scores_not_equal      check (team_a_score != team_b_score),
  constraint games_sequence_num_positive check (sequence_num > 0)
);

-- Game Players
create table public.game_players (
  game_id    uuid not null references public.games(id),
  player_id  uuid not null references public.players(id),
  team       text not null,

  constraint game_players_pk          primary key (game_id, player_id),
  constraint game_players_team_values check (team in ('A', 'B'))
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_groups_join_code           on public.groups(join_code);
create index idx_players_group_id           on public.players(group_id);
create index idx_sessions_group_id_started  on public.sessions(group_id, started_at desc);
create index idx_session_players_session_id on public.session_players(session_id);
create index idx_games_session_id_sequence  on public.games(session_id, sequence_num desc);
create index idx_game_players_game_id       on public.game_players(game_id);
create index idx_game_players_player_id     on public.game_players(player_id);
create index idx_games_played_at            on public.games(played_at);

-- ============================================================
-- ROW LEVEL SECURITY — SELECT + INSERT only (anon key)
-- No anon UPDATE. No anon DELETE.
-- end_session uses SECURITY DEFINER to UPDATE sessions without
-- exposing a public UPDATE policy.
-- ============================================================

alter table public.groups          enable row level security;
alter table public.players         enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_players enable row level security;
alter table public.games           enable row level security;
alter table public.game_players    enable row level security;

-- groups
create policy "groups_select" on public.groups  for select using (true);
create policy "groups_insert" on public.groups  for insert with check (true);

-- players
create policy "players_select" on public.players for select using (true);
create policy "players_insert" on public.players for insert with check (true);

-- sessions — no anon UPDATE policy; end_session RPC handles the update
create policy "sessions_select" on public.sessions for select using (true);
create policy "sessions_insert" on public.sessions for insert with check (true);

-- session_players
create policy "session_players_select" on public.session_players for select using (true);
create policy "session_players_insert" on public.session_players for insert with check (true);

-- games
create policy "games_select" on public.games for select using (true);
create policy "games_insert" on public.games for insert with check (true);

-- game_players
create policy "game_players_select" on public.game_players for select using (true);
create policy "game_players_insert" on public.game_players for insert with check (true);

-- ============================================================
-- RPC FUNCTIONS (added Milestone 2)
-- ============================================================

-- ── create_session ─────────────────────────────────────────
-- Atomically creates a session + session_players rows.
-- SECURITY INVOKER: runs as the calling role (anon).
--   Anon INSERT RLS policies on sessions + session_players allow this.
-- Validates: group exists, player_ids.length >= 4.
-- Returns: new session UUID.
-- ────────────────────────────────────────────────────────────
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

  -- Validate: minimum 4 players
  if array_length(player_ids, 1) is null or array_length(player_ids, 1) < 4 then
    raise exception 'At least 4 players are required to start a session'
      using errcode = 'P0003';
  end if;

  -- Build sorted player codes for label: YYYY-MM-DD CODE CODE CODE ...
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

  -- Insert attendance (idempotent on duplicate player_id)
  foreach v_pid in array player_ids loop
    insert into public.session_players (session_id, player_id)
    values (v_session_id, v_pid)
    on conflict do nothing;
  end loop;

  return v_session_id;
end;
$$;

grant execute on function public.create_session(text, uuid[]) to anon;


-- ── end_session ────────────────────────────────────────────
-- Sets ended_at = now(), closed_reason = 'manual'.
-- SECURITY DEFINER: elevates to function owner so it can UPDATE
--   sessions without an anon UPDATE RLS policy.
-- search_path pinned to 'public' (Supabase security best practice).
-- Validates: session must exist.
-- Idempotent: safe to call on an already-ended session.
-- ────────────────────────────────────────────────────────────
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
  select exists(
    select 1 from public.sessions where id = p_session_id
  ) into v_exists;

  if not v_exists then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'P0002';
  end if;

  update public.sessions
     set ended_at      = now(),
         closed_reason = 'manual'
   where id       = p_session_id
     and ended_at is null;
end;
$$;

grant execute on function public.end_session(uuid) to anon;


-- ── record_game ────────────────────────────────────────────
-- Atomically records a single game (games + game_players rows).
--
-- SECURITY DEFINER: runs as function owner to validate session
-- liveness, derive sequence_num, and insert both rows atomically.
-- search_path pinned to 'public' (Supabase security best practice).
--
-- Parameters:
--   p_session_id   — UUID of the active session
--   p_team_a_ids   — exactly 2 player UUIDs on Team A
--   p_team_b_ids   — exactly 2 player UUIDs on Team B
--   p_team_a_score — Team A's score
--   p_team_b_score — Team B's score
--   p_force        — if true, skip the 15-min recent-duplicate check
--
-- Returns jsonb:
--   { "status": "inserted",           "game_id": "<uuid>" }
--   { "status": "possible_duplicate", "existing_game_id": "<uuid>",
--                                     "existing_created_at": "<iso>" }
--
-- fingerprint (dedupe_key) canonicalization — NO time bucket:
--   1. Sort UUIDs within each team
--   2. Sort the two team strings lexicographically (team order-insensitive)
--   3. Score part: min(scores):max(scores)
--   4. SHA-256 of lo|hi|score_part
--   (stored in dedupe_key column for auditability; no longer UNIQUE)
-- ────────────────────────────────────────────────────────────
create or replace function public.record_game(
  p_session_id   uuid,
  p_team_a_ids   uuid[],
  p_team_b_ids   uuid[],
  p_team_a_score integer,
  p_team_b_score integer,
  p_force        boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
begin
  select id, ended_at, started_at
    into v_session
    from public.sessions
   where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'P0002';
  end if;

  if v_session.ended_at is not null then
    raise exception 'Session has already ended'
      using errcode = 'P0001';
  end if;

  if v_session.started_at < now() - interval '4 hours' then
    raise exception 'Session has expired (older than 4 hours)'
      using errcode = 'P0001';
  end if;

  if array_length(p_team_a_ids, 1) is null or array_length(p_team_a_ids, 1) != 2 then
    raise exception 'Team A must have exactly 2 players'
      using errcode = 'P0001';
  end if;

  if array_length(p_team_b_ids, 1) is null or array_length(p_team_b_ids, 1) != 2 then
    raise exception 'Team B must have exactly 2 players'
      using errcode = 'P0001';
  end if;

  foreach v_pid in array p_team_a_ids loop
    if v_pid = any(p_team_b_ids) then
      raise exception 'Player % appears on both teams', v_pid
        using errcode = 'P0001';
    end if;
  end loop;

  select array_agg(player_id)
    into v_attendee_ids
    from public.session_players
   where session_id = p_session_id;

  v_all_player_ids := p_team_a_ids || p_team_b_ids;

  foreach v_pid in array v_all_player_ids loop
    if not (v_pid = any(v_attendee_ids)) then
      raise exception 'Player % is not a session attendee', v_pid
        using errcode = 'P0001';
    end if;
  end loop;

  v_winner := greatest(p_team_a_score, p_team_b_score);
  v_loser  := least(p_team_a_score, p_team_b_score);

  if v_winner < 11 then
    raise exception 'Winning score must be at least 11 (got %)', v_winner
      using errcode = 'P0001';
  end if;

  if (v_winner - v_loser) < 2 then
    raise exception 'Winning margin must be at least 2 (got %)', (v_winner - v_loser)
      using errcode = 'P0001';
  end if;

  -- Compute fingerprint (no time bucket)
  select array_agg(u order by u) into v_team_a_sorted from unnest(p_team_a_ids) as u;
  select array_agg(u order by u) into v_team_b_sorted from unnest(p_team_b_ids) as u;

  v_team_a_str := array_to_string(v_team_a_sorted, ',');
  v_team_b_str := array_to_string(v_team_b_sorted, ',');

  if v_team_a_str <= v_team_b_str then
    v_lo := v_team_a_str; v_hi := v_team_b_str;
  else
    v_lo := v_team_b_str; v_hi := v_team_a_str;
  end if;

  v_score_part  := least(p_team_a_score, p_team_b_score)::text || ':' || greatest(p_team_a_score, p_team_b_score)::text;
  v_fingerprint := encode(digest(v_lo || '|' || v_hi || '|' || v_score_part, 'sha256'), 'hex');

  -- Recent-duplicate check (skipped when p_force = true)
  if not p_force then
    select id, created_at
      into v_existing_id, v_existing_at
      from public.games
     where session_id  = p_session_id
       and dedupe_key  = v_fingerprint
       and created_at >= now() - interval '15 minutes'
     order by created_at desc
     limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'status',              'possible_duplicate',
        'existing_game_id',    v_existing_id,
        'existing_created_at', v_existing_at
      );
    end if;
  end if;

  select coalesce(max(sequence_num), 0) + 1
    into v_sequence_num
    from public.games
   where session_id = p_session_id;

  insert into public.games (session_id, sequence_num, team_a_score, team_b_score, dedupe_key)
  values (p_session_id, v_sequence_num, p_team_a_score, p_team_b_score, v_fingerprint)
  returning id into v_game_id;

  foreach v_pid in array p_team_a_ids loop
    insert into public.game_players (game_id, player_id, team) values (v_game_id, v_pid, 'A');
  end loop;

  foreach v_pid in array p_team_b_ids loop
    insert into public.game_players (game_id, player_id, team) values (v_game_id, v_pid, 'B');
  end loop;

  return jsonb_build_object('status', 'inserted', 'game_id', v_game_id);
end;
$$;

grant execute on function public.record_game(uuid, uuid[], uuid[], integer, integer, boolean) to anon;


-- ============================================================
-- NOTES
-- ============================================================
-- 1. Score rules enforced in record_game RPC AND client:
--      - winner score >= 11, winner - loser >= 2
--      - scores not equal (also DB constraint)
--
-- 2. fingerprint (dedupe_key) canonicalization — NO time bucket:
--      sort UUIDs within each team → join with ','
--      sort the two team strings lexicographically → lo, hi
--      score_part = min(scores):max(scores)
--      fingerprint = sha256(lo|hi|score_part) as hex
--    Stored in dedupe_key for auditability. NOT unique-constrained
--    (constraint removed in M4.1 so the same scoreline can be played
--    again legitimately). Duplicate prevention is the RPC's 15-min
--    recency check + UI warn-and-confirm flow.
--
-- 3. end_session is SECURITY DEFINER so it can UPDATE sessions
--    without any anon UPDATE RLS policy. search_path is pinned
--    to prevent search-path injection (Supabase best practice).
--
-- 4. create_session is SECURITY INVOKER — runs as anon, relies
--    on existing INSERT RLS policies. No privilege elevation needed.
--
-- 5. record_game is SECURITY DEFINER — needs to validate session
--    liveness and derive sequence_num atomically.
--    No anon UPDATE policy required.
--
-- 6. join_code stored + enforced as lowercase at DB level via
--    both regex CHECK and equality CHECK constraints.
--
-- 7. 2-per-team enforced in record_game RPC. No UPDATE/DELETE
--    policies on games or game_players — games are immutable.
--
-- 8. All timestamps stored in UTC (timestamptz).
-- ============================================================
