-- ============================================================
-- Milestone 4: record_game RPC
--
-- Delta migration — apply to existing DB (schema already has
-- games + game_players tables and their RLS policies).
--
-- No table or policy changes needed.
-- Adds one new SECURITY DEFINER function: record_game.
-- ============================================================

-- ── record_game ────────────────────────────────────────────
-- Atomically records a single game (games + game_players rows).
--
-- SECURITY DEFINER: runs as function owner so it can:
--   - validate session liveness without relying on caller permissions
--   - derive sequence_num atomically (no TOCTOU race)
--   - insert into games and game_players in one transaction
--
-- search_path pinned to 'public' (Supabase security best practice).
--
-- Parameters:
--   p_session_id   — UUID of the active session
--   p_team_a_ids   — exactly 2 player UUIDs on Team A
--   p_team_b_ids   — exactly 2 player UUIDs on Team B
--   p_team_a_score — Team A's score
--   p_team_b_score — Team B's score
--
-- Returns: UUID of the newly inserted game row.
--
-- Error codes used:
--   P0001 — validation failure (session inactive, bad player count, etc.)
--   P0002 — session not found
--   23505 — unique constraint violation (duplicate game) — raised by DB,
--            not by this function; caught by the Server Action layer.
--
-- dedupe_key canonicalization (order-insensitive within teams AND across teams):
--   1. Sort UUIDs within each team → team_a_str, team_b_str
--   2. Sort the two team strings lexicographically → [lo, hi]
--   3. Score part: min(scores)::text || ':' || max(scores)::text
--   4. 10-min bucket: floor(epoch_seconds / 600) as text
--   5. raw = lo || '|' || hi || '|' || score_part || '|' || bucket
--   6. dedupe_key = encode(digest(raw, 'sha256'), 'hex')
-- ────────────────────────────────────────────────────────────

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

drop function if exists public.record_game(uuid, uuid[], uuid[], integer, integer, boolean);

create or replace function public.record_game(
  p_session_id   uuid,
  p_team_a_ids   uuid[],
  p_team_b_ids   uuid[],
  p_team_a_score integer,
  p_team_b_score integer
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session         record;
  v_attendee_ids    uuid[];
  v_all_player_ids  uuid[];
  v_pid             uuid;
  v_game_id         uuid;
  v_sequence_num    integer;
  v_team_a_sorted   uuid[];
  v_team_b_sorted   uuid[];
  v_team_a_str      text;
  v_team_b_str      text;
  v_lo              text;
  v_hi              text;
  v_score_part      text;
  v_bucket          text;
  v_raw             text;
  v_dedupe_key      text;
  v_winner          integer;
  v_loser           integer;
begin
  -- ── 1. Validate session exists ──────────────────────────
  select id, ended_at, started_at
    into v_session
    from public.sessions
   where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'P0002';
  end if;

  -- ── 2. Validate session is active (4-hour rule) ─────────
  if v_session.ended_at is not null then
    raise exception 'Session has already ended'
      using errcode = 'P0001';
  end if;

  if v_session.started_at < now() - interval '4 hours' then
    raise exception 'Session has expired (older than 4 hours)'
      using errcode = 'P0001';
  end if;

  -- ── 3. Validate player counts ───────────────────────────
  if array_length(p_team_a_ids, 1) is null or array_length(p_team_a_ids, 1) != 2 then
    raise exception 'Team A must have exactly 2 players'
      using errcode = 'P0001';
  end if;

  if array_length(p_team_b_ids, 1) is null or array_length(p_team_b_ids, 1) != 2 then
    raise exception 'Team B must have exactly 2 players'
      using errcode = 'P0001';
  end if;

  -- ── 4. Validate no player appears on both teams ─────────
  foreach v_pid in array p_team_a_ids loop
    if v_pid = any(p_team_b_ids) then
      raise exception 'Player % appears on both teams', v_pid
        using errcode = 'P0001';
    end if;
  end loop;

  -- ── 5. Validate all 4 players are session attendees ─────
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

  -- ── 6. Validate scores ──────────────────────────────────
  -- DB constraint handles scores_not_equal + scores_nonnegative.
  -- Application rules: winner >= 11, winner - loser >= 2.
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

  -- ── 7. Compute dedupe_key ────────────────────────────────
  -- Sort UUIDs within each team
  select array_agg(u order by u)
    into v_team_a_sorted
    from unnest(p_team_a_ids) as u;

  select array_agg(u order by u)
    into v_team_b_sorted
    from unnest(p_team_b_ids) as u;

  v_team_a_str := array_to_string(v_team_a_sorted, ',');
  v_team_b_str := array_to_string(v_team_b_sorted, ',');

  -- Sort the two team strings lexicographically (order-insensitive across teams)
  if v_team_a_str <= v_team_b_str then
    v_lo := v_team_a_str;
    v_hi := v_team_b_str;
  else
    v_lo := v_team_b_str;
    v_hi := v_team_a_str;
  end if;

  -- Score part: always min:max (order-insensitive)
  v_score_part := least(p_team_a_score, p_team_b_score)::text
               || ':'
               || greatest(p_team_a_score, p_team_b_score)::text;

  -- 10-minute time bucket: floor(epoch_seconds / 600)
  v_bucket := floor(extract(epoch from now()) / 600)::bigint::text;

  -- Concatenate + hash
  v_raw := v_lo || '|' || v_hi || '|' || v_score_part || '|' || v_bucket;

  v_dedupe_key := extensions.encode(
  extensions.digest(convert_to(v_raw, 'UTF8'), 'sha256'),
  'hex'
  );

  -- ── 8. Derive sequence_num ──────────────────────────────
  select coalesce(max(sequence_num), 0) + 1
    into v_sequence_num
    from public.games
   where session_id = p_session_id;

  -- ── 9. Insert game row ──────────────────────────────────
  -- Unique constraint (session_id, dedupe_key) raises 23505 on
  -- duplicate; the Server Action layer catches this.
  insert into public.games (
    session_id,
    sequence_num,
    team_a_score,
    team_b_score,
    dedupe_key
  )
  values (
    p_session_id,
    v_sequence_num,
    p_team_a_score,
    p_team_b_score,
    v_dedupe_key
  )
  returning id into v_game_id;

  -- ── 10. Insert game_players rows (4 rows) ───────────────
  foreach v_pid in array p_team_a_ids loop
    insert into public.game_players (game_id, player_id, team)
    values (v_game_id, v_pid, 'A');
  end loop;

  foreach v_pid in array p_team_b_ids loop
    insert into public.game_players (game_id, player_id, team)
    values (v_game_id, v_pid, 'B');
  end loop;

  return v_game_id;
end;
$$;

grant execute on function public.record_game(uuid, uuid[], uuid[], integer, integer) to anon;
