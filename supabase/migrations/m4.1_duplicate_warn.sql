-- ============================================================
-- Milestone 4.1: Duplicate warn-and-confirm (replaces hard-block)
--
-- Delta migration — apply to existing DB after m4_record_game.sql.
--
-- Changes:
--   1. DROP the unique constraint games_dedupe_key_unique.
--      Without a time bucket in the fingerprint, the same game
--      played legitimately a second time would be blocked forever.
--      The 15-minute recency check in the RPC is the sole gate.
--
--   2. REPLACE record_game with a new signature:
--        + p_force boolean DEFAULT false
--        - returns jsonb instead of uuid
--
--      Return shapes:
--        { "status": "inserted",           "game_id": "<uuid>" }
--        { "status": "possible_duplicate", "existing_game_id": "<uuid>",
--                                          "existing_created_at": "<iso>" }
--
--      Logic:
--        - Compute fingerprint (sha256) WITHOUT time bucket
--          (order-insensitive within teams AND across teams)
--        - If p_force = false:
--            look for existing game in same session with same fingerprint
--            AND created_at >= now() - interval '15 minutes'
--            If found → return possible_duplicate (no insert)
--        - If p_force = true OR no recent match:
--            insert games + game_players atomically, return inserted
--
--   No new tables. No new RLS policies.
--   games + game_players remain SELECT + INSERT only (no anon UPDATE/DELETE).
-- ============================================================

-- ── Step 1: Drop unique constraint on dedupe_key ────────────
-- The constraint hard-blocks identical fingerprints forever.
-- With no time bucket we must allow deliberate re-entry; the
-- 15-min recency check in the RPC handles accidental duplicates.
alter table public.games
  drop constraint if exists games_dedupe_key_unique;


-- ── Step 2: Replace record_game RPC ────────────────────────
-- New signature: adds p_force, returns jsonb.
-- SECURITY DEFINER + search_path = public (same as before).
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

  -- ── 7. Compute fingerprint (NO time bucket) ─────────────
  -- Order-insensitive within teams AND across teams.
  select array_agg(u order by u) into v_team_a_sorted from unnest(p_team_a_ids) as u;
  select array_agg(u order by u) into v_team_b_sorted from unnest(p_team_b_ids) as u;

  v_team_a_str := array_to_string(v_team_a_sorted, ',');
  v_team_b_str := array_to_string(v_team_b_sorted, ',');

  -- Sort team strings lexicographically (team-order-invariant)
  if v_team_a_str <= v_team_b_str then
    v_lo := v_team_a_str; v_hi := v_team_b_str;
  else
    v_lo := v_team_b_str; v_hi := v_team_a_str;
  end if;

  -- Score part: min:max (order-insensitive)
  v_score_part  := least(p_team_a_score, p_team_b_score)::text
                || ':'
                || greatest(p_team_a_score, p_team_b_score)::text;

  -- No time bucket — fingerprint is purely teams + scores
  v_fingerprint := encode(digest(v_lo || '|' || v_hi || '|' || v_score_part, 'sha256'), 'hex');

  -- ── 8. Recent-duplicate check (skipped when p_force = true) ─
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
        'status',           'possible_duplicate',
        'existing_game_id', v_existing_id,
        'existing_created_at', v_existing_at
      );
    end if;
  end if;

  -- ── 9. Derive sequence_num atomically ───────────────────
  select coalesce(max(sequence_num), 0) + 1
    into v_sequence_num
    from public.games
   where session_id = p_session_id;

  -- ── 10. Insert game row ─────────────────────────────────
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
    v_fingerprint
  )
  returning id into v_game_id;

  -- ── 11. Insert game_players rows (4 rows) ───────────────
  foreach v_pid in array p_team_a_ids loop
    insert into public.game_players (game_id, player_id, team)
    values (v_game_id, v_pid, 'A');
  end loop;

  foreach v_pid in array p_team_b_ids loop
    insert into public.game_players (game_id, player_id, team)
    values (v_game_id, v_pid, 'B');
  end loop;

  return jsonb_build_object(
    'status',  'inserted',
    'game_id', v_game_id
  );
end;
$$;

-- Re-grant execute to anon (covers the updated signature)
grant execute on function public.record_game(uuid, uuid[], uuid[], integer, integer, boolean) to anon;
