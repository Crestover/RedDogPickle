# How to Update the Database Schema

## The Source of Truth

> **Current reality (v0.9.0):** `supabase/schema.sql` only reflects the database as of about Milestone 6 and is **stale** for most functions. The real source of truth is the ordered set of migration files in `supabase/migrations/` (`m0_base_tables.sql` → `m18.0_padel_target_points.sql`), applied by hand in the Supabase SQL Editor. `MEMORY.md` ("Fresh Dev DB Setup Order") lists the order for building a fresh database. Rewriting `schema.sql` to be self-contained is a known to-do.

`supabase/schema.sql` was originally intended as the canonical schema definition — the **full, runnable schema from scratch**, not a series of diffs.

---

## Applying the Schema (First Time)

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Open your project
3. Navigate to **SQL Editor** → **New query**
4. Paste the entire contents of `supabase/schema.sql`
5. Click **Run**
6. Verify success: go to **Table Editor** and confirm all tables exist:
   - `groups`
   - `players`
   - `sessions`
   - `session_players`
   - `games`
   - `game_players`

---

## Making a Schema Change (Migrations)

Since this is an MVP without a migration tool configured, changes are applied manually:

### Step-by-Step

1. **Write the change** as a new migration file `supabase/migrations/mN.M_short_name.sql` (e.g., `ALTER TABLE`, `CREATE OR REPLACE FUNCTION`)
2. **Apply it to the dev Supabase project** in the SQL Editor and test on `dev`
3. **Apply the same file to the production Supabase project before promoting the code** that depends on it, and confirm it took effect (e.g. query the new column or constraint)
4. **Record the change** in `CHANGELOG.md`, `MEMORY.md` (latest migration, pending migrations, migration table) and `docs/decisions.md` if there's a new architectural decision
5. **Commit** the migration file. If the migration is later edited to match what was actually run (as happened with `m18.0`, which also allows `7`), commit that edit too so the file matches both databases

### Example Migration Snippet

```sql
-- Add a new index for improved leaderboard query performance
create index if not exists idx_games_session_played
  on public.games(session_id, played_at);
```

---

## RLS Policy Rules

The current RLS posture is **SELECT + INSERT only** for the anon key.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| groups | ✅ anon | ✅ anon | ❌ | ❌ |
| players | ✅ anon | ✅ anon | ❌ | ❌ |
| sessions | ✅ anon | ✅ anon | ✅ via `end_session` / `set_session_rules` RPCs (SECURITY DEFINER) | ❌ |
| session_players | ✅ anon | ✅ anon | ✅ via courts RPCs | ❌ |
| games | ✅ anon | ✅ anon | ✅ only via `void_last_game` / `undo_game` RPCs (set `voided_at`) | ❌ |
| game_players | ✅ anon | ✅ anon | ❌ | ❌ |

> The table above covers the original six tables. Later tables (`player_ratings`, `game_rdr_deltas`, `session_courts`, …) follow the same posture; see the migration files.
>
> **Service role** bypasses RLS entirely. In the app it is used **only** by the admin panel (`src/lib/supabase/adminServer.ts`), e.g. to create groups and to update `players.hidden`/name/code (no anon UPDATE policy exists on `players`). Everything else that updates data goes through SECURITY DEFINER RPCs.

### Adding a New RLS Policy

```sql
-- Pattern for a new SELECT policy
create policy "table_select" on public.your_table
  for select using (true);

-- Pattern for a new INSERT policy
create policy "table_insert" on public.your_table
  for insert with check (true);
```

> Always test policies in the Supabase SQL Editor using `SET ROLE anon;` before `SET ROLE authenticated;` to confirm behavior.

---

## Verifying RLS Is Working

Run this in the SQL Editor to simulate the anon role:

```sql
-- Simulate anon user
set role anon;

-- Should return rows (SELECT allowed)
select * from public.groups limit 5;

-- Should succeed (INSERT allowed)
insert into public.groups (name, join_code) values ('Test', 'test-code');

-- Should fail (no UPDATE policy for anon)
-- update public.sessions set ended_at = now() where id = '...';

-- Reset
reset role;
```

---

## Adding a New Table

1. Write the CREATE TABLE statement with:
   - UUID primary key using `gen_random_uuid()`
   - `created_at timestamptz not null default now()`
   - All relevant constraints
2. Enable RLS: `alter table public.your_table enable row level security;`
3. Create at minimum a SELECT policy
4. Add appropriate indexes
5. Update `supabase/schema.sql` with the full new state
6. Apply the new table definition in the Supabase SQL Editor
7. Update this doc's RLS table above
8. Record the decision in `docs/decisions.md`

---

## RPC Functions

The app now has 23 RPCs (core + Courts Mode) — see the "RPC Function Reference" in `MEMORY.md`. The two below were the original Milestone 2 pair and illustrate the INVOKER vs DEFINER pattern:

| Function | Security | Callable by | Purpose |
|---|---|---|---|
| `create_session(group_join_code, player_ids)` | INVOKER | anon | Atomically create session + attendees |
| `end_session(p_session_id)` | DEFINER | anon | Set `ended_at = now()`, no UPDATE RLS needed |

### Why SECURITY DEFINER for `end_session`?

The anon key has no UPDATE RLS policy on `sessions` (intentional — immutability). `SECURITY DEFINER` runs the function as the function owner (postgres role), which bypasses RLS, so it can perform the UPDATE without opening a public UPDATE policy.

`search_path = public` is always pinned on SECURITY DEFINER functions as a Supabase security requirement to prevent search-path injection attacks.

### Modifying or Adding an RPC

1. Write the `CREATE OR REPLACE FUNCTION` statement
2. Include `set search_path = public` on any SECURITY DEFINER function
3. Add `grant execute on function ... to anon;` if the anon role should call it
4. Apply in the Supabase SQL Editor
5. Update `supabase/schema.sql` to include the new function
6. Record the decision in `docs/decisions.md`

### Verifying RPC Grants

```sql
select grantee, routine_name, privilege_type
from information_schema.routine_privileges
where routine_name in ('create_session', 'end_session')
order by routine_name, grantee;
```

Expected output:
```
 grantee | routine_name    | privilege_type
---------+-----------------+----------------
 anon    | create_session  | EXECUTE
 anon    | end_session     | EXECUTE
```

---

## Correcting Recorded Game Data (Production Runbook)

Use this when a recorded game is wrong (wrong score, wrong player), a game was never entered, or a game should not exist. It has been run several times on production; each step below was tested.

### Why not just edit the row?

Ratings (`player_ratings`, `game_rdr_deltas`) are updated inline when a game is recorded and are rolled back only by `void_last_game`, which works **newest-first (LIFO)**. Editing a game's score or players directly would leave that game's rating delta — and every later game's delta, since each depends on the ratings before it — inconsistent with the "corrected" data. So the supported correction is: **void back to the bad game, re-record it correctly, re-record everything after it, then restore numbering and times with SQL.** Voided rows stay in the database as an audit trail.

### Steps

1. **Identify** the session id (it is in the session URL) and the game(s) involved. Open `/g/{join_code}/session/{id}/games` and toggle "Show voided" to see everything. Note how many games come *after* the bad one — each must be voided and re-recorded.
2. **Make sure nobody else is recording** in that session until you are done. A game entered mid-correction lands in the wrong order.
3. **If the session is ended, reopen it** (the app has no reopen button yet — planned as 7i). In the production SQL Editor:
   ```sql
   UPDATE sessions SET ended_at = NULL WHERE id = '<session_id>';
   ```
4. **Void newest-first** from the live session page: "Void Last Game" → "Confirm Void?". After each void the "LAST:" line shows the previous game. Stop once the bad game is voided.
5. **Re-record** the corrected game, then every later game, in their true order, using the normal Quick Game Screen. Check the "LAST:" line after each. (A score containing 0 asks for a second "Confirm Shutout" tap, and that prompt resets itself after a few seconds.)
6. **Restore numbering and times.** New games were assigned `sequence_num = MAX + 1` over *all* games including voided ones, and today's `played_at`. Pair the new live rows (in sequence order) with the voided originals they replace and copy the original number and time across. Template for "the voided originals are numbered `A..B` and the new live rows are numbered `C..D`":
   ```sql
   WITH originals AS (
     SELECT sequence_num, played_at,
            ROW_NUMBER() OVER (ORDER BY sequence_num) AS rn
     FROM games
     WHERE session_id = '<session_id>'
       AND voided_at IS NOT NULL
       AND sequence_num BETWEEN <A> AND <B>
   ),
   replacements AS (
     SELECT id,
            ROW_NUMBER() OVER (ORDER BY sequence_num) AS rn
     FROM games
     WHERE session_id = '<session_id>'
       AND voided_at IS NULL
       AND sequence_num BETWEEN <C> AND <D>
   )
   UPDATE games g
   SET sequence_num = o.sequence_num,
       played_at = o.played_at
   FROM replacements r
   JOIN originals o ON o.rn = r.rn
   WHERE g.id = r.id;
   ```
   Variations that have been needed:
   - **A game was added** (e.g. a missing game at the start): run a first statement that adds `+ k` to the `sequence_num` of every live game *except* the newest `k` (select those by `ORDER BY created_at DESC LIMIT k`), **then** set the newest `k` rows to the freed numbers with `ROW_NUMBER() OVER (ORDER BY created_at ASC)`. Order matters — shifting after assigning would shift the new rows too.
   - **Games backfilled before existing ones**: derive their times as offsets from a known row (`played_at - interval '5 minutes'`, …) instead of typing clock times; displayed times are America/Chicago, and offsets avoid timezone mistakes.
   - **More than one voided row shares a number** (voided rows keep their old numbers, so a re-corrected game can collide with an earlier voided batch): disambiguate with `ORDER BY voided_at DESC LIMIT 1`.
7. **Re-close the session at the right time.** The End button stamps "now", which is usually wrong for a correction. Set it from the last live game instead (adds 3 minutes to the last game's minute here — change the interval as needed):
   ```sql
   UPDATE sessions
   SET ended_at = date_trunc('minute', (
         SELECT MAX(played_at) FROM games
         WHERE session_id = '<session_id>' AND voided_at IS NULL
       )) + interval '3 minutes',
       closed_reason = 'manual'
   WHERE id = '<session_id>' AND ended_at IS NULL;
   ```
8. **Verify** on the session games page: live count, order, scores, teams, times, and that the session shows as Ended. "Show voided" will legitimately show duplicate G-numbers (voided rows were not renumbered).

### Notes

- `sequence_num` is not unique in the database, so these updates never violate a constraint, but the shift-then-assign order above still matters.
- Ratings need no extra step: each re-recorded game computed fresh deltas in order.
- Data corrections and other non-code changes do **not** bump the app version or add a changelog entry.
- If the classifier/permissions layer blocks a single "Void Last Game" tap during an automated run, have the user do that tap and continue; do not work around it.

---

## What NOT to Do

- ❌ Do not apply the full `schema.sql` to an existing database — it will fail on duplicate table errors. Only apply it to a fresh database.
- ❌ Do not add UPDATE or DELETE RLS policies for the anon key without recording the decision in `docs/decisions.md` and getting approval — games are immutable in the MVP.
- ❌ Do not use the Supabase Table Editor UI to add columns or modify constraints — always use SQL so `schema.sql` stays in sync.
