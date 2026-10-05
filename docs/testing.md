# Manual Test Checklist

All testing for the MVP is manual. This document is updated at each milestone with screen-by-screen test cases.

Test on a mobile device (or Chrome DevTools mobile emulation) for all UI tests.

---

## Milestone 0 — Project Setup

### Environment & Connectivity
- [ ] `npm run dev` starts without errors
- [ ] App loads at http://localhost:3000
- [ ] No console errors on load
- [ ] Supabase connection: run the following in Supabase SQL Editor and confirm 6 tables exist:
  ```sql
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name;
  ```
  Expected: `game_players`, `games`, `groups`, `players`, `session_players`, `sessions`
- [ ] RLS check: simulate anon SELECT succeeds, anon UPDATE fails (see `docs/how-to-update-schema.md`)
- [ ] Vercel production deploy loads without errors
- [ ] All three env vars confirmed set in Vercel dashboard

---

## Milestone 1 — Group Access & Device Identity

> **Scope note:** Device identity ("Who are you?") and active session detection are **not implemented in Milestone 1**. The tests below cover what IS built: the `/` route, the `/g/[join_code]` route, and the static dashboard shell.

---

### Prerequisites

Before running these tests:

1. Apply `supabase/schema.sql` to your Supabase project (see `docs/how-to-update-schema.md`)
2. Insert at least one test group directly in Supabase:

```sql
-- Run in Supabase SQL Editor
INSERT INTO public.groups (name, join_code)
VALUES ('Test Picklers', 'test-picklers');
```

3. Note the `join_code` value you inserted (`test-picklers` in the example above)
4. Copy `.env.example` to `.env.local` and fill in your Supabase credentials
5. Run `npm install` then `npm run dev`

---

### Test A — Root Route `/` (Local)

**URL:** http://localhost:3000

| # | Step | Expected |
|---|---|---|
| A-1 | Visit `http://localhost:3000` | Page loads with 🏓 emoji, "RedDog Pickle" heading, "Group Code" input, and "Go to Group →" button |
| A-2 | Click "Go to Group →" without entering a code | Error message: "Please enter a group code." appears below the input |
| A-3 | Type `test-picklers` in the input and click "Go to Group →" | Browser navigates to `http://localhost:3000/g/test-picklers` |
| A-4 | Type `TEST-PICKLERS` (uppercase) and click "Go to Group →" | Browser navigates to `http://localhost:3000/g/test-picklers` (lowercased in URL) |
| A-5 | Type `   test-picklers   ` (with spaces) and click "Go to Group →" | Browser navigates to `http://localhost:3000/g/test-picklers` (trimmed) |

---

### Test B — Group Found `/g/{join_code}` (Local)

**URL:** http://localhost:3000/g/test-picklers

| # | Step | Expected |
|---|---|---|
| B-1 | Visit `http://localhost:3000/g/test-picklers` | Page loads showing group name "Test Picklers" and join_code "test-picklers" |
| B-2 | Check the primary button | "🏓 Start Session" button is visible (disabled / greyed out) |
| B-3 | Check the secondary button | "📊 Leaderboard" button is visible (disabled / greyed out) |
| B-4 | Check button tap target size | Both buttons are at least 56px tall (visually large) |
| B-5 | Check "Change group" link | Link at bottom navigates back to `/` when clicked |
| B-6 | Visit with uppercase URL: `http://localhost:3000/g/TEST-PICKLERS` | Same group page loads correctly (case-insensitive) |
| B-7 | Open Chrome DevTools → Network tab, reload | Confirm a request is made to Supabase and returns the group data (status 200) |

---

### Test C — Group Not Found (Local)

**URL:** http://localhost:3000/g/does-not-exist

| # | Step | Expected |
|---|---|---|
| C-1 | Visit `http://localhost:3000/g/does-not-exist` | Page shows "Group not found" heading (not a 500 error, not a blank page) |
| C-2 | Check error message | Shows the invalid code in a monospace style, with instruction to check the code |
| C-3 | Click "← Try a different code" | Navigates back to `/` |
| C-4 | Visit `http://localhost:3000/g/` (empty code) | Next.js 404 page (acceptable) |

---

### Test D — Supabase Connection (Local)

| # | Step | Expected |
|---|---|---|
| D-1 | Open `.env.local` and temporarily break the URL (e.g. add an X) | `http://localhost:3000/g/test-picklers` shows "Group not found" (graceful error, not a crash) |
| D-2 | Restore `.env.local` to correct values, restart `npm run dev` | Group page loads again correctly |

---

### Test E — Vercel Production

After pushing to GitHub and confirming Vercel has deployed with env vars set:

| # | Step | Expected |
|---|---|---|
| E-1 | Visit your Vercel URL (e.g. `https://reddogpickle.vercel.app`) | Root page loads with group code input |
| E-2 | Enter `test-picklers` and submit | Group dashboard loads with correct group name |
| E-3 | Visit `https://your-vercel-url.app/g/no-such-group` | "Group not found" page |
| E-4 | Check Vercel Functions log | No errors in the Functions tab of the deployment |
| E-5 | Run Lighthouse on the group page (Chrome DevTools → Lighthouse → Mobile) | Performance score ≥ 80 (stretch: ≥ 90) |

---

### Test F — Mobile Layout Check

Using Chrome DevTools → Toggle Device Toolbar → iPhone SE or similar:

| # | Step | Expected |
|---|---|---|
| F-1 | Visit `/` on mobile viewport | Input and button fill width, no horizontal scrolling |
| F-2 | Visit `/g/test-picklers` on mobile viewport | Both action buttons fill width, are visually large (≥56px tall) |
| F-3 | Tap "Go to Group →" on the input page | Touch response is immediate, navigates correctly |

---

### Items NOT tested in Milestone 1 (deferred)

- "Who are you?" / device identity screen — post-MVP
- Active session detection → implemented in Milestone 2 ✅
- Start Session functionality → implemented in Milestone 2 ✅
- Leaderboard — Milestone 5

---

## Milestone 2 — Sessions (RPC-based)

> **Scope:** join_code canonicalization, `create_session` RPC, `end_session` RPC, Start Session UI, Active Session UI, active-session detection on dashboard.

---

### Prerequisites

1. Apply the migration delta to your Supabase project:
   ```
   BROWSER → Supabase dashboard → SQL Editor → New query
   Paste: supabase/migrations/m2_rpc_sessions.sql (run all three BLOCKS in order)
   ```
2. Insert at least 4 test players into your test group:
   ```sql
   -- Replace the group_id with your actual group's UUID
   -- Get it: SELECT id FROM public.groups WHERE join_code = 'test-picklers';
   INSERT INTO public.players (group_id, display_name, code)
   VALUES
     ('<group_id>', 'Alice Smith',   'ALS'),
     ('<group_id>', 'Bob Jones',     'BOJ'),
     ('<group_id>', 'Carol White',   'CAW'),
     ('<group_id>', 'David Brown',   'DAB');
   ```
3. Run `npm run dev`

---

### Test G — join_code Canonicalization

| # | Step | Expected |
|---|---|---|
| G-1 | In Supabase SQL Editor, run: `SELECT conname FROM pg_constraint WHERE conname = 'groups_join_code_lowercase';` | Returns 1 row |
| G-2 | Try to insert a mixed-case join_code: `INSERT INTO public.groups (name, join_code) VALUES ('Bad', 'BadCode');` | Error: violates check constraint `groups_join_code_lowercase` |
| G-3 | Visit `/g/TEST-PICKLERS` (uppercase) | Page loads the group correctly (app lowercases the param) |
| G-4 | Visit `/g/Test-Picklers` (mixed) | Page loads the group correctly |

---

### Test H — Dashboard Active-Session Detection

| # | Step | Expected |
|---|---|---|
| H-1 | Visit `/g/test-picklers` with no sessions in DB | Dashboard shows **"🏓 Start Session"** as primary (green), "📊 Leaderboard" as secondary (disabled) |
| H-2 | Insert an active session directly in SQL: `INSERT INTO public.sessions (group_id, session_date, name) VALUES ('<group_id>', current_date, '2026-02-20 ALS BOJ CAW DAB');` | — |
| H-3 | Reload `/g/test-picklers` | Dashboard shows **"🏓 Continue Session"** as primary, **"+ New Session"** as secondary. Green banner shows session name. |
| H-4 | End the session: `UPDATE public.sessions SET ended_at = now(), closed_reason = 'manual' WHERE ended_at IS NULL;` | — |
| H-5 | Reload `/g/test-picklers` | Dashboard returns to "🏓 Start Session" primary state |
| H-6 | Insert a session started 5 hours ago: `INSERT INTO public.sessions (group_id, session_date, name, started_at) VALUES ('<group_id>', current_date, 'Old', now() - interval '5 hours');` | — |
| H-7 | Reload `/g/test-picklers` | Dashboard shows "🏓 Start Session" (old session not active — past 4-hour window) |

---

### Test I — Start Session UI (`/g/{join_code}/start`)

| # | Step | Expected |
|---|---|---|
| I-1 | From dashboard, tap "🏓 Start Session" | Navigates to `/g/test-picklers/start` |
| I-2 | Page loads | Shows "Start Session" heading, player search input, list of all 4 test players as tappable buttons (≥64px tall) |
| I-3 | Search for "ali" | List filters to show only Alice Smith |
| I-4 | Clear search | All 4 players shown again |
| I-5 | Tap "Alice Smith" | Button turns green with ✓; counter shows "1 selected" |
| I-6 | Tap "Alice Smith" again | Button returns to white; counter shows "0 selected" |
| I-7 | Select only 3 players and tap "Start Session (3 players)" | Error: "Please select at least 4 players." Submit button is disabled (visually grey) until 4 selected |
| I-8 | Select all 4 players | Submit button becomes active, label reads "Start Session (4 players)" |
| I-9 | Tap "Start Session (4 players)" | Button shows "Starting…", then browser navigates to `/g/test-picklers/session/{new_uuid}` |
| I-10 | In Supabase Table Editor, check `sessions` table | New row exists with correct `group_id`, `session_date`, and `name` in format `YYYY-MM-DD ALS BOJ CAW DAB` (codes sorted alphabetically) |
| I-11 | In Supabase Table Editor, check `session_players` table | 4 rows exist with the new `session_id` and the 4 player UUIDs |
| I-12 | In Supabase SQL Editor, verify `create_session` RPC validates player count: `SELECT public.create_session('test-picklers', ARRAY['<uuid1>', '<uuid2>']::uuid[]);` | Error: "At least 4 players are required to start a session" |
| I-13 | Tap back arrow "← test-picklers" | Returns to group dashboard |

---

### Test J — Active Session Page (`/g/{join_code}/session/{session_id}`)

| # | Step | Expected |
|---|---|---|
| J-1 | Navigate to the active session page (from dashboard "Continue Session" or direct URL) | Page shows: "Active" green badge, started time, session name in monospace, list of attendees with code badges |
| J-2 | Attendee list | Shows all 4 selected players with their codes in green circles |
| J-3 | "🏓 Record Game" button | Visible but disabled (grey, says "Coming in Milestone 4") |
| J-4 | "End Session" button | Visible, outlined red text |
| J-5 | Tap "End Session" (first tap) | Button changes to solid red "⚠️ Confirm End Session". A "Cancel" link appears below. |
| J-6 | Tap "Cancel" | Button returns to original "End Session" state |
| J-7 | Tap "End Session" → then tap "⚠️ Confirm End Session" | Button shows "Ending session…", then browser navigates back to `/g/test-picklers` |
| J-8 | Dashboard after ending | Shows "🏓 Start Session" (no active session banner) |
| J-9 | In Supabase, verify: `SELECT ended_at, closed_reason FROM public.sessions WHERE id = '<session_id>';` | `ended_at` is set, `closed_reason = 'manual'` |
| J-10 | Revisit the ended session URL directly | Page shows "Ended" grey badge, no "End Session" button, shows "This session has ended." message |
| J-11 | Try to call `end_session` on a non-existent UUID via SQL: `SELECT public.end_session('00000000-0000-0000-0000-000000000000');` | Error: "Session not found" |

---

### Test K — RLS Enforcement (no anon UPDATE)

| # | Step | Expected |
|---|---|---|
| K-1 | In Supabase SQL Editor, simulate anon role trying to UPDATE: `SET ROLE anon; UPDATE public.sessions SET ended_at = now() WHERE true; RESET ROLE;` | Error: permission denied (no UPDATE policy for anon role) |
| K-2 | In Supabase SQL Editor, verify `end_session` RPC works as anon: `SET ROLE anon; SELECT public.end_session('<any_valid_session_id>'); RESET ROLE;` | Success (SECURITY DEFINER allows the UPDATE internally) |
| K-3 | Verify no anon UPDATE policy exists on sessions: `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'sessions' AND cmd = 'UPDATE';` | Returns 0 rows |

---

### Test L — Vercel Production (after deploying M2)

| # | Step | Expected |
|---|---|---|
| L-1 | Push to `main`, confirm Vercel redeploys successfully | Build passes, no errors in Vercel Functions log |
| L-2 | Visit production URL dashboard | Start Session link works |
| L-3 | Start a session on production | Navigates to session page, session exists in Supabase |
| L-4 | End the session on production | Redirects to dashboard, session ended in DB |

---

### Items NOT tested in Milestone 2 (deferred)

- "Who are you?" / device identity screen — post-MVP scope (see `docs/assumptions.md` A-001)
- Add Player UI — Milestone 3 scope (players must be seeded via SQL for now)
- Game recording — Milestone 4
- Leaderboard — Milestone 5

---

## Milestone 2 (original placeholder) — Players
- [ ] Empty display_name is rejected

---

## Milestone 3 — Sessions

### Start Session
- [ ] Tapping "Start Session" shows attendee selection
- [ ] All active players in the group are shown as tappable buttons (≥44px)
- [ ] Search works on the attendee list
- [ ] "Add Player" is accessible from this screen
- [ ] At least 4 players must be selected (or: no minimum enforced — check SPEC)
- [ ] Tapping "Create Session" creates a session row and session_player rows
- [ ] Session label format: `YYYY-MM-DD CODE CODE CODE` with codes sorted alphabetically
- [ ] After creation, dashboard shows "Continue Session"

### Session Lifecycle
- [ ] Active session: `ended_at IS NULL AND started_at > now() - 4 hours`
- [ ] "End Session" sets `ended_at` and `closed_reason = 'manual'`
- [ ] After ending, dashboard shows "Start Session" as primary
- [ ] If session is > 4 hours old and user tries to record a game: prompt "Session is closed. Start a new session?"
- [ ] "Start a new session?" prompt leads to Start Session flow

### Session History
- [ ] Session History screen lists past sessions
- [ ] Each session shows its name/label and date
- [ ] Sessions are ordered by date descending

---

## Milestone 3 — Add Player & Session History

> **Scope:** Add Player form with code suggestion + collision handling; Session History list; no DB schema changes.

---

### Prerequisites

Same as Milestone 2. No new migration to apply.

---

### Test M — Add Player (`/g/{join_code}/players/new`)

| # | Step | Expected |
|---|---|---|
| M-1 | From the Start Session page, tap **"+ Add New Player"** | Navigates to `/g/test-picklers/players/new?from=start` |
| M-2 | Page loads | Shows "Add Player" heading, Full Name input, Player Code input with "(auto-suggested)" label, and "Add Player" button |
| M-3 | Type `"Eve Turner"` in Full Name | Player Code field auto-fills with `"ETU"` |
| M-4 | Clear Full Name, type `"Alice"` (single word) | Player Code auto-fills with `"ALI"` |
| M-5 | Type `"Bob van der Berg"` | Player Code auto-fills with `"BVD"` (first letter of first 3 words) |
| M-6 | Manually change code to `"BOB2"` | Code field updates to `"BOB2"` (auto-suggest stops updating since code was touched) |
| M-7 | Submit with empty Full Name | Error: "Name is required." below Full Name input |
| M-8 | Fill Full Name, clear code, submit | Error: "Code is required." below Code input |
| M-9 | Enter code `"abc"` (lowercase) | Field forces uppercase — shows `"ABC"` |
| M-10 | Enter code with a space or special char `"J D"` | Special chars stripped — shows `"JD"` |
| M-11 | Fill valid name + unique code, tap **"Add Player"** | Button shows "Adding player…", then redirects to `/g/test-picklers/start` (because `?from=start`) |
| M-12 | On Start Session page after redirect | New player appears in the player list |
| M-13 | In Supabase Table Editor → players | New row exists with correct `group_id`, `display_name`, `code`, `is_active = true` |
| M-14 | Try to add a player with a code already taken (e.g. `"ALS"`) | Error: `Code "ALS" is already taken in this group. Try a different code.` |
| M-15 | Change the code to something unique and re-submit | Succeeds, redirects |
| M-16 | Visit `/g/test-picklers/players/new` without `?from=` | Page loads; after adding a player, redirects to `/g/test-picklers` (dashboard) |
| M-17 | Preview card | While typing, a preview card shows the code badge + name |

---

### Test N — Session History (`/g/{join_code}/sessions`)

| # | Step | Expected |
|---|---|---|
| N-1 | From the group dashboard, tap **"Session history →"** link | Navigates to `/g/test-picklers/sessions` |
| N-2 | Page loads with no sessions in DB | Shows "No sessions recorded yet." and a "Start First Session" button |
| N-3 | After creating at least one session (via M2 tests), reload | Sessions appear as a list ordered newest first |
| N-4 | Active session (if any) | Shows a green dot and "Active" label |
| N-5 | Ended session | Shows a grey dot, date, session name, "Ended · manual" |
| N-6 | Each session row is tappable | Tapping navigates to `/g/test-picklers/session/{session_id}` |
| N-7 | Session name format | Shown in monospace: `YYYY-MM-DD CODE CODE CODE` |
| N-8 | Session date | Shows human-readable format: "Wed, Feb 19, 2026" |
| N-9 | Back link | "← test-picklers" navigates back to dashboard |
| N-10 | From session page | "View all sessions →" link navigates to session history |
| N-11 | Counter in heading | Shows correct count: "3 sessions total" |

---

### Test O — Navigation Flows

| # | Step | Expected |
|---|---|---|
| O-1 | Full happy path: Dashboard → Start Session → Add Player → (redirects back) → select 4 players → Start Session → session page | All steps navigate correctly, new player is selectable |
| O-2 | Dashboard → Session History → tap a session → "← group name" link | Returns to dashboard |
| O-3 | Start Session with 0 players | Shows "No players yet." empty state with prompt to add player above |

---

### Items NOT tested in Milestone 3 (deferred)

- Game recording — Milestone 4
- Leaderboard — Milestone 5

---

## Milestone 4 — Record Game

> **Scope:** `record_game` RPC (atomic insert, dedupe_key, session-liveness validation), `RecordGameForm` (3-step UI: select → scores → confirm), game list on session page.

---

### Prerequisites

1. Apply the M4 migration to your Supabase project:
   ```
   BROWSER → Supabase dashboard → SQL Editor → New query
   Paste: supabase/migrations/m4_record_game.sql
   Click "Run"
   ```
2. Start an active session with at least 4 players (use M2/M3 tests to create one).
3. Run `npm run dev`.

---

### Test P — RPC Applied

| # | Step | Expected |
|---|---|---|
| P-1 | In Supabase SQL Editor: `SELECT proname FROM pg_proc WHERE proname = 'record_game';` | Returns 1 row |
| P-2 | Check grant: `SELECT grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_name = 'record_game';` | Row with `grantee = 'anon'`, `privilege_type = 'EXECUTE'` |
| P-3 | Verify no anon UPDATE/DELETE on games: `SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('games','game_players') AND cmd IN ('UPDATE','DELETE');` | Returns 0 rows |

---

### Test Q — RecordGameForm UI (Step 1: Select Players)

| # | Step | Expected |
|---|---|---|
| Q-1 | Navigate to an active session page | "Record Game — Pick Teams" section visible inside a grey card |
| Q-2 | Player rows | All session attendees listed, each with A and B buttons; colour legend shows blue=A, orange=B |
| Q-3 | Tap "A" next to a player | Row turns blue; Team A summary shows "(1/2)"; "A" button turns solid blue |
| Q-4 | Tap "A" again for same player | Player deselected; counter returns to "(0/2)" |
| Q-5 | Assign 2 players to Team A | "A" buttons for remaining players greyed/disabled |
| Q-6 | Assign 2 different players to Team B | "B" buttons greyed for remaining |
| Q-7 | Tap Team A player's "B" button | Player moves from Team A to Team B |
| Q-8 | Click "Next: Enter Scores →" with <2 on either team | Error: "Team A needs exactly 2 players." or "Team B needs exactly 2 players." |
| Q-9 | With 2+2 assigned, click "Next: Enter Scores →" | Advances to scores step |

---

### Test R — RecordGameForm UI (Step 2: Scores)

| # | Step | Expected |
|---|---|---|
| R-1 | Scores step loads | Team A/B panels with player names; two large score inputs |
| R-2 | Tap score field on mobile | Numeric keyboard appears |
| R-3 | Enter 11 for Team A, 7 for Team B | Live preview: "🏆 Team A wins 11–7" |
| R-4 | Enter equal scores (11 and 11), click "Review →" | Error: "Scores cannot be equal." |
| R-5 | Enter winning score 10, click "Review →" | Error: "Winning score must be at least 11 (got 10)." |
| R-6 | Enter 11 and 10 (margin 1), click "Review →" | Error: "Winning margin must be at least 2 (got 1)." |
| R-7 | Enter valid scores (11-7), click "Review →" | Advances to confirm step |
| R-8 | Click "← Back" | Returns to select step; assignments preserved |

---

### Test S — RecordGameForm UI (Step 3: Confirm + Submit)

| # | Step | Expected |
|---|---|---|
| S-1 | Confirm step loads | Summary card: Team A (blue), Team B (orange), large scores; winner side has 🏆 + green tint |
| S-2 | Click "← Edit Scores" | Returns to scores step |
| S-3 | Click "Start Over" | Resets all state; returns to select step |
| S-4 | Click "✅ Save Game" | Button shows "Saving…"; then redirects to session page |
| S-5 | After redirect — game list | New game in "Games (N)": correct sequence #, scores, player codes, time |
| S-6 | Supabase → games table | New row: correct `session_id`, `sequence_num`, scores, non-null `dedupe_key` |
| S-7 | Supabase → game_players table | 4 rows: 2 `team='A'`, 2 `team='B'` |

---

### Test T — RPC Score + Attendee Validation

| # | Step | Expected |
|---|---|---|
| T-1 | Equal scores via SQL: `SELECT public.record_game('<sid>', ARRAY['<p1>','<p2>']::uuid[], ARRAY['<p3>','<p4>']::uuid[], 11, 11);` | Error: violates `games_scores_not_equal` constraint |
| T-2 | Winning score < 11 (10-5) | Error: "Winning score must be at least 11 (got 10)" |
| T-3 | Margin < 2 (11-10) | Error: "Winning margin must be at least 2 (got 1)" |
| T-4 | Player on both teams | Error: "Player … appears on both teams" |
| T-5 | Non-attendee player | Error: "Player … is not a session attendee" |
| T-6 | Ended session | Error: "Session has already ended" |
| T-7 | Session started 5+ hours ago | Error: "Session has expired (older than 4 hours)" |
| T-8 | Nonexistent session_id | Error: "Session not found" |

---

### Test U — Duplicate Warn-and-Confirm *(updated M4.1)*

> **Prerequisite:** Apply `supabase/migrations/m4.1_duplicate_warn.sql` in Supabase SQL Editor before running these tests.

| # | Step | Expected |
|---|---|---|
| U-1 | Open the same active session in **two browser tabs** | Both show same session |
| U-2 | Tab 1: record a game (e.g. Team A: JDO+ALS, Team B: BOJ+CAW, 11–7) | Game saved; redirected; Game #1 in list |
| U-3 | Tab 2: submit the **identical** game (same 4 players, same scores) within 15 min | Confirm step stays open; **amber warning banner** appears: "⚠️ This game may have already been recorded X minutes ago." |
| U-4 | Warning banner contents | Shows "Cancel" and "Record anyway" buttons; no red error text |
| U-5 | Click **Cancel** | Form resets to select step; only 1 row in games table |
| U-6 | Repeat Tab 2 submission → click **Record anyway** | Button shows "Saving…"; game inserts; 2 rows in games table |
| U-7 | Submit a different scoreline (e.g. 11–8, same players) within 15 min | No warning; inserts normally (different fingerprint) |
| U-8 | Submit same game after >15 min (simulate: `UPDATE public.games SET created_at = now() - interval '16 minutes' WHERE id = '<game1_id>';`) then retry | No warning; inserts normally (recency window expired) |
| U-9 | Verify via SQL: `SELECT COUNT(*), dedupe_key FROM public.games WHERE session_id = '<sid>' GROUP BY dedupe_key;` | After U-6: one dedupe_key has count = 2 |
| U-10 | Verify constraint removed: `SELECT conname FROM pg_constraint WHERE conname = 'games_dedupe_key_unique';` | Returns 0 rows |

---

### Test V — sequence_num and Game List

| # | Step | Expected |
|---|---|---|
| V-1 | Record 3 games | Session page shows Games #1, #2, #3 |
| V-2 | Game list order | Most recent (highest sequence_num) first |
| V-3 | Each game card | Sequence #, time, Team A codes, Team B codes, scores, 🏆 on winner side |
| V-4 | Ended session | Game list still shows; no RecordGameForm (session ended state) |

---

---

## Milestone 5 — Group Leaderboards & Stats

### Test W — Group Leaderboard — All-time Math Correctness

| # | Step | Expected |
|---|---|---|
| W-1 | Navigate to `/g/{join_code}/leaderboard` | Page loads with "Leaderboard" title, "All-time" toggle active |
| W-2 | Player who played 4 games (won 3) | games_played=4, games_won=3, win_pct=75.0 |
| W-3 | Same player scored 11,11,11 for, 8,9,7 against | points_for=33, points_against=24, point_diff=+9, avg_point_diff=+2.3 |
| W-4 | Losses column | W-L display shows correct losses (games_played − games_won) |
| W-5 | Player with 0 games | Not shown (only players with ≥1 game appear) |
| W-6 | Player from a DIFFERENT group | Not shown (group filter works) |
| W-7 | Rank numbers | Sequential #1, #2, #3… matching sort order |

---

### Test X — Group Leaderboard — 30-Day Filter

| # | Step | Expected |
|---|---|---|
| X-1 | Click "Last 30 Days" toggle | URL changes to `?range=30d`, toggle highlights "Last 30 Days" |
| X-2 | Games played > 30 days ago | Not included in stats |
| X-3 | Games played within 30 days | Included in stats |
| X-4 | Player with ALL games > 30 days ago | Not shown in 30-day view |
| X-5 | Click "All-time" toggle | URL drops `?range` param, full stats restored |
| X-6 | Empty 30-day view (no recent games) | Shows "No games in the last 30 days." with "Start a Session" link |

---

### Test Y — Sorting and Tie-Breaking

| # | Step | Expected |
|---|---|---|
| Y-1 | Two players: A has 75% win, B has 50% win | A ranks higher |
| Y-2 | Two players: same win_pct, A has 5 wins, B has 3 wins | A ranks higher (games_won tiebreak) |
| Y-3 | Two players: same win_pct and games_won, A has +10 diff, B has +5 diff | A ranks higher (point_diff tiebreak) |
| Y-4 | Two players: all stats tied, names "Alice" and "Bob" | Alice ranks higher (display_name ASC) |
| Y-5 | Verify sort is consistent across page refreshes | Same order every time |

---

### Test Z — Dashboard Leaderboard Link

| # | Step | Expected |
|---|---|---|
| Z-1 | Dashboard with active session | Shows "Continue Session", "+ New Session", AND "📊 Leaderboard" buttons |
| Z-2 | Dashboard without active session | Shows "Start Session" AND "📊 Leaderboard" buttons |
| Z-3 | Click "📊 Leaderboard" from dashboard | Navigates to `/g/{join_code}/leaderboard` |
| Z-4 | Leaderboard back link | "← {group.name}" navigates back to dashboard |

---

## Milestone 5.1 — Last Session Leaderboard + Session Standings

### Test AA — Leaderboard "Last Session" Toggle

| # | Step | Expected |
|---|---|---|
| AA-1 | Navigate to `/g/{join_code}/leaderboard` | 3-pill toggle: "All-time" (active), "30 Days", "Last Session" |
| AA-2 | Click "Last Session" pill | URL changes to `?range=last`; shows stats from most recently ended session |
| AA-3 | Verify stats match | Compare displayed W-L, win%, point diff against the last ended session's raw game data |
| AA-4 | No ended sessions exist | "Last Session" tab shows "No completed sessions yet." with "Start a Session" link |
| AA-5 | Click "All-time" or "30 Days" | Switches back to group-wide stats; URL updates accordingly |
| AA-6 | Direct URL `?range=last` | Loads correctly without navigating through pills |

---

### Test AB — Session Standings

| # | Step | Expected |
|---|---|---|
| AB-1 | Session page with games recorded | "Session Standings" section visible ABOVE attendees, actions, and game list |
| AB-2 | Standings content | Shows ranked list: #N, code badge, name, W-L, win%, point diff (green/red), PF/PA, avg |
| AB-3 | Collapse toggle | Clicking header ▼/▶ collapses/expands standings section |
| AB-4 | Default state | Standings expanded on page load |
| AB-5 | No games yet | Session Standings section hidden (no empty state shown) |
| AB-6 | Stats accuracy | Hand-verify one player's stats against raw game data for the session |

---

## Milestone 5.2 — Pairing Balance + Session Page Layout Cleanup

### Test AC — Pairing Balance

| # | Step | Expected |
|---|---|---|
| AC-1 | Session page with attendees but no games | "Pairing Balance" section visible; all attendee pairs listed with "0 games" |
| AC-2 | Record a game (e.g. ALS+BOJ vs CAW+DAB) | After refresh, ALS·BOJ shows "1 game", ALS·CAW shows "0 games", etc. |
| AC-3 | Record a second game with same teams | ALS·BOJ shows "2 games"; other same-team pairs also update |
| AC-4 | Sort order | Pairs sorted fewest-first (0 games at top), then by name |
| AC-5 | Pluralisation | "0 games", "1 game", "2 games" (singular for 1, plural for 0 and 2+) |
| AC-6 | Attendees section removed | No "Attendees (N)" section on session page |
| AC-7 | EndSessionButton in header | "End" button visible next to session name (compact pill style) |
| AC-8 | EndSessionButton two-tap | Tap → "Confirm?"; tap again → ends session; "Cancel" link available |
| AC-9 | Ended session | No EndSessionButton visible; no Record Game form; Pairing Balance still shows |
| AC-10 | Pairing Balance empty | Section hidden when no attendees (0 pairs) |

---

## Milestone 6 — Polish & Acceptance Criteria

### Full SPEC §12 Acceptance Criteria
- [ ] Group loads via `/g/{join_code}`
- [ ] Device identity selection works
- [ ] Session created correctly with proper label and attendance
- [ ] Session auto-closes after 4 hours (treat as closed in UI)
- [ ] Games validated properly (score rules enforced)
- [ ] Duplicate detection works across devices
- [ ] Session leaderboard accurate
- [ ] All-time leaderboard accurate
- [ ] 30-day toggle accurate
- [ ] Game ordering deterministic (sequence_num)
- [ ] No editing possible in MVP

### Mobile UX
- [ ] All tap targets ≥ 44px (verify in Chrome DevTools)
- [ ] No unnecessary typing required for core flows
- [ ] Active session is prominently displayed on dashboard
- [ ] Save feedback is clear and immediate
- [ ] Maximum 3 primary navigation destinations

### Performance
- [ ] Lighthouse mobile score ≥ 90 performance (or page load < 2s on simulated LTE)
- [ ] No layout shift on initial load

### Error States
- [ ] Invalid group code → clear error, not a crash
- [ ] Duplicate game → "already recorded" message + link
- [ ] Closed session → prompt to start new session
- [ ] Code collision when adding player → error + suggested alternative

---

## Milestone 7 — Admin, Padel, UX (v0.9.0)

> Milestones 0–6 above are the original MVP checklist and are partly out of date (e.g. 4-hour session expiry and "no editing" wording). The automated suite (`npx vitest run`, 279 tests / 21 files) covers validators, sport config, stat labels and key components; the checks below are the manual ones. A broader running checklist is in `MEMORY.md` ("Manual QA Checklist").

### Test AD — Session Standings Link Scope (7a)
- [ ] On an **active** session, tap "Session standings →" → shows standings for that session only (`?tab=standings`), not the all-time group leaderboard
- [ ] Footer links are labelled "Session games →" and "Session standings →"
- [ ] An ended session's Games/Standings tabs still work

### Test AE — Player Search in Roster (7b)
- [ ] Session with 18 or fewer attendees: no search box in "Pick N players"
- [ ] Session with more than 18 attendees: search box filters the list; selection survives filtering

### Test AF — Add Player Mid-Start Keeps Selection
- [ ] Start Session → select several players → "+ Add New Player" → save → returns to Start Session with the earlier selections still selected **and** the new player selected
- [ ] Works for both pickleball and padel groups
- [ ] Add-player errors (e.g. duplicate code) show inline, no raw `NEXT_REDIRECT` text

### Test AG — Padel Scoring (7c)
- [ ] Group with sport = padel shows the Padel badge on the dashboard
- [ ] Records: 6-0, 6-4, 7-5, 9-7 are accepted
- [ ] Rejects: 6-5, 7-6, 11-7, equal scores
- [ ] Target preset is fixed at 6 (no 11/15/21 choice)
- [ ] Leaderboard/standings/player page use Sets and Games wording; a pickleball group still uses Games and Points
- [ ] (After any padel-related migration) `record_game` succeeds with target 6 — the `m18.0` CHECK constraints must be applied on that database

### Test AH — Per-Player History (7e)
- [ ] Tap a player's name on the main leaderboard and on both session standings screens → `/g/{join_code}/players/{player_id}`
- [ ] Page shows the stat summary with sport-correct labels and every non-voided game across sessions, with W/L pill and session date link
- [ ] The `/v/` view-only pages do not link to this page

### Test AI — Admin Panel (7d, 7f)
- [ ] Logged out, `/rd-admin` redirects to `/rd-admin/login`
- [ ] Wrong password → "Incorrect password."; correct password → group list (players, sessions, last session date)
- [ ] Missing/mismatched env (e.g. wrong service-role key) → visible error message, not an empty "No groups yet."
- [ ] Create a group (name, sport, join code) → appears in the list; the join code works at `/g/{code}`
- [ ] Open a group → hide a player → they vanish from leaderboards but stay selectable when starting a session; unhide reverses it
- [ ] Edit a player's name and code (code auto-uppercases) → persists; duplicate code shows an inline error and the row stays in edit mode; Cancel reverts
- [ ] Logout, or wait 4 hours → login required again
- [ ] The admin path is not linked from any public page

### Test AJ — Home Page and Share Preview
- [ ] Browser tab title is "Red Dog – Fetch Your Stats. Bury the Excuses."
- [ ] Reloading the home page shows different slogans over several loads; no hydration warning in the console
- [ ] Pasting the site URL in a messaging app shows the same title and the logo image

### Test AK — Data Correction Dry Run (procedure in `how-to-update-schema.md`)
- [ ] On the dev database: record 3 games, void the last 2, re-record them differently, run the renumber SQL → game list shows the corrected games in the original positions with the original times; "Show voided" still lists the voided rows
- [ ] Ratings after the correction match a session recorded cleanly in the final order
