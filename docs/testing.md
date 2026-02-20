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

- "Who are you?" / device identity screen — Milestone 2
- Active session detection (Continue Session state) — Milestone 2
- Start Session functionality — Milestone 3
- Leaderboard — Milestone 5

---

## Milestone 2 — Players

### Add Player
- [ ] "I'm New" / Add Player form shows display_name and code fields
- [ ] Code is auto-suggested (e.g., from initials of display_name)
- [ ] User can override the suggested code
- [ ] Submitting with a duplicate code within the group shows a clear error
- [ ] Error message suggests an alternative code
- [ ] Submitting with a valid, unique code creates the player
- [ ] New player appears in the player list immediately after creation
- [ ] Code format is validated (uppercase alphanumeric only)
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
