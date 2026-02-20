# How to Update the Database Schema

## The Source of Truth

`supabase/schema.sql` is the canonical schema definition. It represents the **full, runnable schema from scratch** — not a series of diffs.

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

1. **Write the change** as a SQL migration snippet (e.g., `ALTER TABLE`, `CREATE INDEX`, `CREATE POLICY`)
2. **Update `supabase/schema.sql`** to reflect the new state (keep it as a full from-scratch definition)
3. **Apply the migration snippet** in the Supabase SQL Editor (not the full schema — only the delta)
4. **Record the change** in `CHANGELOG.md` and update `docs/decisions.md` if there's a new architectural decision
5. **Commit** the updated `supabase/schema.sql`

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
| sessions | ✅ anon | ✅ anon | ✅ service role only | ❌ |
| session_players | ✅ anon | ✅ anon | ❌ | ❌ |
| games | ✅ anon | ✅ anon | ❌ | ❌ |
| game_players | ✅ anon | ✅ anon | ❌ | ❌ |

> **Service role** (used in Next.js Server Actions) bypasses RLS entirely. All UPDATE operations go through the service role, never the anon key.

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

## What NOT to Do

- ❌ Do not apply the full `schema.sql` to an existing database — it will fail on duplicate table errors. Only apply it to a fresh database.
- ❌ Do not add UPDATE or DELETE RLS policies for the anon key without recording the decision in `docs/decisions.md` and getting approval — games are immutable in the MVP.
- ❌ Do not use the Supabase Table Editor UI to add columns or modify constraints — always use SQL so `schema.sql` stays in sync.
