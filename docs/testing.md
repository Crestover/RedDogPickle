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

### Player Selection
- [ ] Only session attendees are shown (not all group players)
- [ ] Players displayed as large tappable buttons (≥44px)
- [ ] Exactly 4 players must be selected before proceeding
- [ ] Selected state is visually clear

### Team Assignment
- [ ] Two columns: Team A and Team B
- [ ] Players can be tapped to move between teams
- [ ] "Swap" button swaps Team A and Team B rosters
- [ ] Each team shows exactly 2 players when valid

### Score Entry
- [ ] Two score input fields (one per team)
- [ ] Numeric keyboard appears on mobile
- [ ] Scores are validated:
  - [ ] Winner score must be ≥ 11
  - [ ] Winner − loser must be ≥ 2
  - [ ] Scores cannot be equal
  - [ ] Scores cannot be negative
- [ ] Invalid scores show a clear error message before submission

### Save & Deduplication
- [ ] Valid game is saved successfully
- [ ] Confirmation message is shown after save
- [ ] Player selection is cleared after save (ready for next game)
- [ ] `sequence_num` increments correctly within session
- [ ] **Duplicate detection (cross-device test):**
  - [ ] Record the same game from two different browser tabs/devices within 10 minutes
  - [ ] The second submit shows "Looks like this game was already recorded."
  - [ ] A link to the existing game is provided

---

## Milestone 5 — Leaderboards & Stats

### Session Summary
- [ ] Session summary shows the session leaderboard
- [ ] Session summary shows game history sorted by `sequence_num` descending (most recent first)
- [ ] Each game shows: teams, scores, time played
- [ ] No edit button is present (games are immutable)

### All-Time Leaderboard
- [ ] Shows all players with at least 1 game
- [ ] Columns: games_played, games_won, win_pct, points_for, points_against, point_diff, avg_point_diff
- [ ] Sorted: win_pct desc → games_won desc → point_diff desc
- [ ] Stats are accurate (verify manually with known game data)

### 30-Day Toggle
- [ ] Toggle between "All Time" and "Last 30 Days" works
- [ ] 30-day filter: only games where `played_at >= now() - 30 days`
- [ ] Players with 0 games in the last 30 days are excluded from the 30-day view
- [ ] Toggling back to "All Time" restores the full leaderboard

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
