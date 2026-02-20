-- ============================================================
-- RedDog Pickle — Supabase Schema
-- SPEC v1.3 MVP
-- RLS: SELECT + INSERT only. No UPDATE or DELETE.
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

  constraint groups_join_code_unique unique (join_code),
  -- join_code must be URL-safe (alphanumeric + hyphen), case-insensitive stored as lowercase
  constraint groups_join_code_format check (join_code ~ '^[a-z0-9\-]+$')
);

-- Players
create table public.players (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id),
  display_name text not null,
  code         text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),

  constraint players_group_code_unique unique (group_id, code),
  -- code: short uppercase identifier, e.g. "JDO"
  constraint players_code_format check (code ~ '^[A-Z0-9]+$'),
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
  -- ended_at must be after started_at when set
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

  constraint games_dedupe_key_unique unique (session_id, dedupe_key),
  constraint games_scores_nonnegative check (team_a_score >= 0 and team_b_score >= 0),
  constraint games_scores_not_equal check (team_a_score != team_b_score),
  -- sequence_num must be positive
  constraint games_sequence_num_positive check (sequence_num > 0)
);

-- Game Players
create table public.game_players (
  game_id    uuid not null references public.games(id),
  player_id  uuid not null references public.players(id),
  team       text not null,

  constraint game_players_pk primary key (game_id, player_id),
  constraint game_players_team_values check (team in ('A', 'B'))
);

-- ============================================================
-- INDEXES (for common query patterns)
-- ============================================================

-- Look up group by join_code
create index idx_groups_join_code on public.groups(join_code);

-- List players in a group
create index idx_players_group_id on public.players(group_id);

-- List sessions for a group, ordered by time
create index idx_sessions_group_id_started on public.sessions(group_id, started_at desc);

-- List attendance for a session
create index idx_session_players_session_id on public.session_players(session_id);

-- List games in a session ordered by sequence
create index idx_games_session_id_sequence on public.games(session_id, sequence_num desc);

-- Look up game players by game
create index idx_game_players_game_id on public.game_players(game_id);

-- Look up game players by player (for leaderboard queries)
create index idx_game_players_player_id on public.game_players(player_id);

-- Look up games by played_at (for 30-day leaderboard filter)
create index idx_games_played_at on public.games(played_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- SELECT + INSERT only. No UPDATE. No DELETE.
-- ============================================================

alter table public.groups         enable row level security;
alter table public.players        enable row level security;
alter table public.sessions       enable row level security;
alter table public.session_players enable row level security;
alter table public.games          enable row level security;
alter table public.game_players   enable row level security;

-- ---- groups ----
create policy "groups_select" on public.groups
  for select using (true);

create policy "groups_insert" on public.groups
  for insert with check (true);

-- ---- players ----
create policy "players_select" on public.players
  for select using (true);

create policy "players_insert" on public.players
  for insert with check (true);

-- ---- sessions ----
-- SELECT: anyone can read sessions
create policy "sessions_select" on public.sessions
  for select using (true);

-- INSERT: anyone can create a session
create policy "sessions_insert" on public.sessions
  for insert with check (true);

-- UPDATE: restricted to only setting ended_at/closed_reason (manual end)
-- We allow UPDATE here but only via the service role in server-side code;
-- the anon key cannot update via RLS (policy not created for anon).
-- Service role bypasses RLS entirely, so no anon update policy is needed.

-- ---- session_players ----
create policy "session_players_select" on public.session_players
  for select using (true);

create policy "session_players_insert" on public.session_players
  for insert with check (true);

-- ---- games ----
create policy "games_select" on public.games
  for select using (true);

create policy "games_insert" on public.games
  for insert with check (true);

-- ---- game_players ----
create policy "game_players_select" on public.game_players
  for select using (true);

create policy "game_players_insert" on public.game_players
  for insert with check (true);

-- ============================================================
-- NOTES
-- ============================================================
-- 1. Application-level validations (not enforced here):
--      - winner score >= 11
--      - winner - loser >= 2
--    These are validated in server-side code before insert.
--
-- 2. dedupe_key is computed client-side before insert as a
--    deterministic hash of:
--      SHA256( session_id || sorted_team_a_ids || sorted_team_b_ids
--              || team_a_score || team_b_score || 10min_bucket )
--    The unique(session_id, dedupe_key) constraint enforces
--    cross-device duplicate prevention at the DB level.
--
-- 3. session.ended_at UPDATE is only performed via service role
--    (server actions), not exposed to anon key. No anon UPDATE
--    RLS policy is created, preserving immutability from the client.
--
-- 4. Exactly-4-players and exactly-2-per-team constraints are
--    enforced at the application layer (server action), not in SQL,
--    because SQL CHECK constraints cannot reference row counts
--    across a sibling table easily without triggers.
--
-- 5. All timestamps stored in UTC (timestamptz).
-- ============================================================
