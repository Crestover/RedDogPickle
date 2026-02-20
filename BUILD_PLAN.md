# Build Plan — RedDog Pickle MVP

## Milestone 0: Project Setup
- [ ] Initialize git repo and push to GitHub
- [ ] Create Next.js app (App Router, TypeScript, Tailwind)
- [ ] Connect Vercel to GitHub repo
- [ ] Create Supabase project
- [ ] Apply schema.sql to Supabase
- [ ] Configure environment variables in Vercel + local `.env.local`
- [ ] Verify Supabase connection from Next.js

---

## Milestone 1: Group Access & Device Identity
Goal: A user can visit `/g/{join_code}`, be identified by device, and land on a working dashboard shell.

- [ ] Root route `/` — "Enter Group Code" form → redirect to `/g/{code}`
- [ ] Group route `/g/[join_code]` — load group by join_code, show error on invalid code
- [ ] Device identity flow — "Who are you?" screen with player list + search + "I'm New"
- [ ] localStorage persistence: `my_player_id`, `my_player_code`, `my_display_name`
- [ ] "Switch Player" affordance in settings/menu
- [ ] Dashboard shell (state-aware): shows "Start Session" or "Continue Session" depending on active session

---

## Milestone 2: Players
Goal: Players can be added to a group and browsed.

- [ ] Add Player form: display_name + auto-suggested code with override
- [ ] Code uniqueness validation (within group), collision error + alternative suggestion
- [ ] Player list displayed as large tappable buttons with search

---

## Milestone 3: Sessions
Goal: A session can be started, attended, and ended.

- [ ] Start Session flow: select attendees → create session + session_players rows
- [ ] Session label generation: `YYYY-MM-DD CODE CODE CODE ...` (sorted alphabetically)
- [ ] Active session detection: `ended_at IS NULL AND started_at > now() - 4 hours`
- [ ] Manual End Session: set `ended_at`, `closed_reason = 'manual'`
- [ ] Auto-close handling: treat session as closed if > 4 hours old; prompt "Start new session?"
- [ ] Session History screen: list of past sessions

---

## Milestone 4: Record Game
Goal: A game can be recorded in < 12 seconds on mobile.

- [ ] Player selection UI: show only session attendees as tappable buttons (select 4)
- [ ] Team assignment: two-column Team A / Team B, tap-to-move, swap button
- [ ] Score inputs (two fields)
- [ ] Application-level validation: winner >= 11, winner - loser >= 2, scores not equal
- [ ] `dedupe_key` generation: deterministic hash of (session_id, sorted team A players, sorted team B players, scores, 10-min time bucket)
- [ ] Insert game + game_players rows atomically
- [ ] Duplicate detection: reject insert on unique constraint violation, show message + link to existing game
- [ ] Post-save: confirmation flash, clear selection

---

## Milestone 5: Leaderboards & Stats
Goal: Stats are visible and accurate.

- [ ] Session Summary screen: session leaderboard + game history (descending by sequence_num)
- [ ] All-time leaderboard: games_played, games_won, win_pct, points_for, points_against, point_diff, avg_point_diff
- [ ] 30-day toggle: filter by `played_at >= now() - 30 days`
- [ ] Sort: win_pct desc → games_won desc → point_diff desc
- [ ] Stats computed from raw game + game_players rows (no denormalized columns)

---

## Milestone 6: Polish & Acceptance Criteria
- [ ] 44px minimum tap targets verified
- [ ] All screens render in < 2s on LTE (Lighthouse / Vercel Analytics)
- [ ] All acceptance criteria from SPEC.md §12 verified manually
- [ ] Error states: invalid group code, duplicate game, closed session, code collision
- [ ] No editing paths exist in MVP (games are immutable)

---

## Tech Decisions

| Concern | Decision |
|---|---|
| Framework | Next.js 14+ App Router |
| Database | Supabase (Postgres) |
| Auth | None (trust-based, device identity via localStorage) |
| Hosting | Vercel |
| Styling | Tailwind CSS |
| DB client | `@supabase/supabase-js` (server + client components) |
| Deduplication | `dedupe_key` unique constraint in DB (cross-device safe) |
| Elo readiness | `sequence_num`, `played_at`, team composition stored; no schema changes needed later |

---

## Deferred (Post-MVP)
- Elo rating computation
- Player avatars / profiles
- Push notifications
- Editing or voiding games
- Authentication / admin tiers
