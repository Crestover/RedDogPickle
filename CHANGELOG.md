# Changelog

All notable changes to this project are documented here.

Format: `## [Milestone N] — Title (YYYY-MM-DD)`

---

## [Pre-M0] — Spec & Project Foundation (2026-02-19)

### Added
- `SPEC.md` — Full product specification v1.3
- `BUILD_PLAN.md` — 6-milestone breakdown with tech decisions table
- `SETUP_GUIDE.md` — Step-by-step guide for git, GitHub, Vercel, Supabase setup
- `supabase/schema.sql` — Full Postgres schema with tables, constraints, indexes, and RLS policies
- `docs/decisions.md` — Architecture and design decisions (D-001 through D-012)
- `docs/how-to-run.md` — Local development setup guide
- `docs/how-to-deploy.md` — Vercel deployment guide
- `docs/how-to-update-schema.md` — Schema migration guide and RLS reference
- `docs/testing.md` — Manual test checklist for all 6 milestones
- `docs/assumptions.md` — 10 recorded assumptions where SPEC was ambiguous
- `CHANGELOG.md` — This file
- `README.md` — Project front door with links to all docs

### Schema highlights
- 6 tables: `groups`, `players`, `sessions`, `session_players`, `games`, `game_players`
- Deduplication via `unique(session_id, dedupe_key)` constraint — cross-device safe
- RLS: anon key has SELECT + INSERT only; no UPDATE/DELETE for anon
- Session `ended_at` update is service-role only (server-side)
- Indexes on all primary query paths (join_code lookup, leaderboard, game sequence)

### Documentation rule established
Every milestone must update `/docs` with: decisions, run guide, deploy guide, schema guide, testing checklist, and assumptions. `CHANGELOG.md` and `README.md` are maintained throughout.

---

## [Milestone 1] — Group Access & Dashboard Shell (2026-02-19)

### Added
- `package.json` — Next.js 15, React 19, Tailwind, TypeScript, `@supabase/supabase-js`
- `next.config.ts` — minimal Next.js config
- `tsconfig.json` — TypeScript config with `@/*` path alias
- `tailwind.config.ts` + `postcss.config.mjs` — Tailwind CSS setup
- `eslint.config.mjs` — ESLint with Next.js core-web-vitals rules
- `.gitignore` — ignores `.env.local`, `node_modules`, `.next/`
- `.env.example` — documents required env vars (no secrets)
- `src/app/globals.css` — Tailwind base styles
- `src/app/layout.tsx` — root layout with metadata
- `src/app/page.tsx` — `/` route: "Enter Group Code" form, lowercases input, redirects to `/g/{code}`
- `src/app/g/[join_code]/page.tsx` — `/g/[join_code]` route: Server Component that queries Supabase for the group; shows group name + disabled action buttons on success, "Group not found" on failure
- `src/lib/supabase/client.ts` — browser-safe Supabase client (anon key only)

### Decisions
- See `docs/decisions.md`: D-013, D-014, D-015, D-016, D-TODO-M2

### Assumptions
- See `docs/assumptions.md`: A-011

### Docs updated
- `docs/decisions.md` — D-013 through D-016 + D-TODO-M2
- `docs/testing.md` — Full M1 test matrix (Tests A–F) with local and Vercel steps
- `docs/assumptions.md` — A-011 added
- `CHANGELOG.md` — this entry
- `README.md` — milestone status updated

### Known limitations / deferred to M2
- "Who are you?" device identity screen not yet implemented
- Active session detection always shows "no active session" state
- "Start Session" and "Leaderboard" buttons are present but disabled

---

## [Milestone 2] — Sessions with RPC-Based End Session (2026-02-20)

### Added
- `supabase/migrations/m2_rpc_sessions.sql` — delta migration (apply to existing DB):
  - Block 1: normalize existing `join_code` rows to lowercase; add `groups_join_code_lowercase` CHECK constraint
  - Block 2: `create_session(group_join_code, player_ids)` SECURITY INVOKER RPC — atomically inserts session + session_players, validates group + player count ≥ 4, builds label, returns session UUID
  - Block 3: `end_session(p_session_id)` SECURITY DEFINER RPC — sets `ended_at = now(), closed_reason = 'manual'`; bypasses RLS without an anon UPDATE policy; search_path pinned
- `src/app/actions/sessions.ts` — Next.js Server Actions wrapping both RPCs (anon key only, no service role)
- `src/app/g/[join_code]/start/page.tsx` — Server Component: loads group + all active players
- `src/app/g/[join_code]/start/StartSessionForm.tsx` — Client Component: player search, toggle selection, 4-player minimum enforced, calls `createSessionAction`, redirects to session page
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — Server Component: loads session + attendees, shows Active/Ended badge, 4-hour active window check, disabled "Record Game" placeholder
- `src/app/g/[join_code]/session/[session_id]/EndSessionButton.tsx` — Client Component: two-tap confirmation, calls `endSessionAction`, redirects to dashboard

### Changed
- `supabase/schema.sql` — updated to canonical from-scratch state including new constraint, both RPCs, and updated notes
- `src/app/g/[join_code]/page.tsx` — replaced hardcoded "no active session" state with live query; now shows "Continue Session" or "Start Session" based on DB; resolves D-TODO-M2

### Decisions
- See `docs/decisions.md`: D-017, D-018, D-019, D-020, D-021, D-022

### Assumptions
- See `docs/assumptions.md`: A-012, A-013

### Docs updated
- `docs/decisions.md` — D-017 through D-022; D-TODO-M2 resolved
- `docs/testing.md` — Full M2 test matrix (Tests G–L): join_code canonicalization, dashboard state detection, Start Session UI, Active Session UI, End Session UX, RLS enforcement, Vercel
- `docs/assumptions.md` — A-012, A-013 added
- `docs/how-to-update-schema.md` — RPC Functions section added; RLS table updated
- `CHANGELOG.md` — this entry
- `README.md` — milestone status updated

### Known limitations / deferred to later milestones
- "Who are you?" device identity — descoped from MVP core; players seeded via SQL
- Add Player UI — Milestone 3
- Game recording ("Record Game" button disabled) — Milestone 4
- Leaderboard — Milestone 5

---

## [Milestone 3] — Add Player & Session History (2026-02-20)

### Added
- `src/app/actions/players.ts` — `addPlayerAction` Server Action: validates display_name + code format, inserts into `players`, handles `23505` unique-constraint collision with user-friendly message; `suggestCode()` pure utility (initials algorithm)
- `src/app/g/[join_code]/players/new/page.tsx` — Server Component: loads group, resolves `?from=start` redirect target
- `src/app/g/[join_code]/players/new/AddPlayerForm.tsx` — Client Component: name input, auto-suggested code (overrideable), live preview card, real-time uppercase/char enforcement, collision error display
- `src/app/g/[join_code]/sessions/page.tsx` — Session History Server Component: all sessions ordered newest-first, active/ended badges, tappable rows → session detail page

### Changed
- `src/app/g/[join_code]/start/page.tsx` — Added **"+ Add New Player"** link (`?from=start`); updated empty-state message
- `src/app/g/[join_code]/page.tsx` — Added **"Session history →"** link in footer nav
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — Added **"View all sessions →"** link

### No schema changes
- No migration file for M3. All operations use existing `players` INSERT RLS policy and `sessions` SELECT RLS policy.

### Decisions
- See `docs/decisions.md`: D-023, D-024, D-025, D-026, D-027

### Assumptions
- See `docs/assumptions.md`: A-014

### Docs updated
- `docs/decisions.md` — D-023 through D-027
- `docs/testing.md` — M3 test matrix (Tests M, N, O): Add Player, Session History, Navigation Flows
- `docs/assumptions.md` — A-014
- `CHANGELOG.md` — this entry
- `README.md` — milestone status + project structure updated

### Known limitations / deferred
- Game recording — Milestone 4
- Leaderboard — Milestone 5

---

## [Milestone 4] — Record Game (2026-02-20)

### Added
- `supabase/migrations/m4_record_game.sql` — `record_game` SECURITY DEFINER RPC:
  - Validates session exists and is active (ended_at IS NULL, started_at within 4 hours)
  - Validates team sizes (exactly 2 per team), no player overlap, all players are session attendees
  - Validates scores (winner ≥ 11, winner − loser ≥ 2)
  - Computes deterministic dedupe_key: sort UUIDs within each team → sort teams lexicographically → min:max scores → 10-min epoch bucket → SHA-256 hex
  - Derives `sequence_num` atomically
  - Inserts `games` + 4 `game_players` rows in one implicit transaction
  - Returns new game UUID; raises 23505 on duplicate (caught by Server Action)
- `src/app/actions/games.ts` — `recordGameAction` Server Action: pre-flight validation, calls `record_game` RPC, handles 23505 with `{ error, duplicate: true }`, redirects on success
- `src/app/g/[join_code]/session/[session_id]/RecordGameForm.tsx` — Client Component, 3-step state machine:
  - Step 1 "select": attendee list with A/B assignment buttons (blue=A, orange=B), max 2 per team
  - Step 2 "scores": large numeric inputs, live winner preview, score validation
  - Step 3 "confirm": summary card with winner highlighted, "✅ Save Game" + "Start Over"

### Changed
- `supabase/schema.sql` — canonical schema updated with `record_game` RPC and revised NOTES
- `src/app/g/[join_code]/session/[session_id]/page.tsx`:
  - Disabled "🏓 Record Game" button replaced with live `RecordGameForm`
  - Now fetches and renders game list for the session (newest first)
  - Attendees sorted by code before being passed as props

### No new tables or RLS policy changes
- Existing `games_select` + `games_insert` anon policies unchanged
- No anon UPDATE or DELETE policies added

### Decisions
- See `docs/decisions.md`: D-028 through D-034

### Docs updated
- `docs/decisions.md` — D-028 through D-034
- `docs/testing.md` — M4 test matrix (Tests P–V)
- `CHANGELOG.md` — this entry
- `README.md` — milestone status + project structure updated

### Known limitations / deferred
- Leaderboard / stats — Milestone 5

---

## [Milestone 4.1] — Duplicate Warn-and-Confirm (2026-02-20)

### Changed
- `supabase/migrations/m4.1_duplicate_warn.sql` — delta migration:
  - Drops `games_dedupe_key_unique` constraint; the same scoreline played legitimately
    a second time would be permanently blocked without a time bucket in the fingerprint
  - Replaces `record_game` RPC with updated signature: adds `p_force boolean DEFAULT false`,
    returns `jsonb` instead of `uuid`
  - New fingerprint: SHA-256 of `lo|hi|score_part` with **no time bucket** — purely
    teams + scores, order-insensitive within and across teams
  - Recency check (only when `p_force = false`): if a game with the same fingerprint
    exists in the same session within the last 15 minutes, returns
    `{ status: "possible_duplicate", existing_game_id, existing_created_at }` (no insert)
  - When `p_force = true` (or no recent match): inserts `games` + `game_players`
    atomically, returns `{ status: "inserted", game_id }`
  - All other validations (session active, team sizes, no overlap, attendees, scores)
    still enforced regardless of `p_force`
- `src/app/actions/games.ts`:
  - `RecordGameResult` union type gains `{ possibleDuplicate: true; existingGameId; existingCreatedAt }`
  - `recordGameAction` gains optional `force` parameter (7th arg, default `false`)
  - Parses jsonb response; routes `possible_duplicate` to structured return, `inserted` to redirect
  - No longer catches `23505` (unique constraint removed)
- `src/app/g/[join_code]/session/[session_id]/RecordGameForm.tsx`:
  - `possibleDup` state (`PossibleDuplicate | null`) tracks duplicate signal
  - `relativeTime(isoString)` pure helper converts ISO timestamp to "X seconds/minutes ago"
  - `submit(force: boolean)` replaces `handleSubmit`; passes force to Server Action
  - Confirm step: amber warning banner appears when `possibleDup !== null`, showing
    relative timestamp, Cancel and "Record anyway" buttons
  - Primary "✅ Save Game" button hidden while warning is active
  - `handleBack` and `handleReset` both clear `possibleDup`
- `supabase/schema.sql` — canonical schema updated: constraint removed (with explanatory
  comment), `record_game` replaced with new signature, NOTES section updated

### No new tables or RLS policy changes
- `games` and `game_players` remain SELECT + INSERT only for anon
- No anon UPDATE or DELETE policies added

### Decisions
- See `docs/decisions.md`: D-032 (rewritten), D-035, D-036, D-037

### Docs updated
- `docs/decisions.md` — D-032 rewritten; D-035, D-036, D-037 added
- `docs/testing.md` — Test U replaced with 10-step warn-and-confirm test matrix
- `CHANGELOG.md` — this entry

## [Milestone 4.2] — Live Leaderboards & DB Hardening (2026-02-21)

### Added
- `supabase/migrations/m4.2_leaderboards.sql` — Leaderboard logic layer:
  - `public.vw_player_game_stats` — View: Normalizes game results into a per-player perspective (is_win, points_for, points_against).
  - `get_session_stats(p_session_id)` RPC — Aggregates the view to return live standings (wins, games played, point differential).
- `src/app/g/[join_code]/session/[session_id]/Leaderboard.tsx` — Client Component:
  - Displays a ranked table of attendees.
  - Shows Win/Loss records and Point Differential (e.g., "+12").
  - Auto-updates as new games are recorded.

### Changed
- `supabase/schema.sql` — **Hardened & Canonicalized**:
  - Replaced generic `$$` with `$BODY$` / `$func$` tags to prevent Supabase SQL Editor parsing errors ("unterminated dollar-quoted string").
  - Fixed `record_game` fingerprinting: Added explicit `::text` casting for UUIDs and strings to satisfy the `digest` function requirements.
  - Atomic Insert fix: Verified `RETURNING id INTO v_game_id` placement for PL/pgSQL stability.
  - Implemented `DROP FUNCTION` logic to handle Postgres return-type signature conflicts during schema updates.
- `src/app/g/[join_code]/session/[session_id]/page.tsx`:
  - Integrated `get_session_stats` call to fetch live rankings alongside the game history list.
  - Improved layout to balance the "Live Standings" vs "Recent Games" views.

### Fixed
- Resolved `42601` syntax errors in Supabase SQL Editor by standardizing on named dollar-quotes.
- Fixed `42P13` "cannot change return type" error by adding explicit drops for modified RPC signatures.
- Corrected team-sorting logic in the game fingerprint to ensure it is truly order-invariant (Team A vs Team B is the same as Team B vs Team A).

### Decisions
- See `docs/decisions.md`: D-038 (Leaderboard ranking ties), D-039 (RPC vs Client-side aggregation).

### Docs updated
- `docs/decisions.md` — D-038, D-039 added.
- `docs/testing.md` — M4.2 test matrix (Tests W–Z): Win calculation, Point Diff accuracy, Tie-breaking verification.
- `CHANGELOG.md` — this entry.
---

## [Milestone 5] — Group Leaderboards & Stats (2026-02-21)

### Added
- `supabase/migrations/m5_group_leaderboards.sql` — codifies all leaderboard DB artifacts:
  - `CREATE OR REPLACE VIEW vw_player_game_stats` — normalises games into per-player rows
    (was applied directly in Supabase during M4.2; now in version control);
    adds `is_valid` boolean to flag garbage rows (NULL scores, ties, 0-0)
  - `CREATE OR REPLACE FUNCTION get_session_stats(p_session_id)` — session leaderboard RPC
    (was applied directly in Supabase during M4.2; now in version control);
    updated with `FILTER (WHERE is_valid)` aggregates and `HAVING` clause
  - `CREATE FUNCTION get_group_stats(p_join_code text, p_days integer DEFAULT NULL)` — new
    group-wide leaderboard RPC with optional time-range filter (NULL = all-time, 30 = last 30 days)
  - Returns: player_id, display_name, code, games_played, games_won, win_pct, points_for,
    points_against, point_diff, avg_point_diff
  - Sorted: win_pct DESC, games_won DESC, point_diff DESC, display_name ASC
  - SECURITY INVOKER — reads only data accessible via anon SELECT RLS
  - Grants to both `anon` and `authenticated` roles
  - Robustness: all aggregates use `FILTER (WHERE is_valid)` to skip invalid rows;
    day-anchored cutoff `(CURRENT_DATE - p_days)::timestamptz` for stable UX;
    `NULLIF` for divide-by-zero protection; explicit `::bigint`/`::numeric(5,1)` casting;
    `HAVING COUNT(*) FILTER (WHERE is_valid) > 0` to exclude zero-game players;
    INNER JOIN `players` after aggregation subquery
- `src/app/g/[join_code]/leaderboard/page.tsx` — Server Component:
  - Mobile-first ranked player list with code badges, W-L records, win%, point diff
  - Detail row: games played, PF/PA, avg point diff
  - Toggle via `?range=30d` query param (no Client Component needed — pure `<Link>` elements)
  - Empty state with "Start a Session" link
  - Input sanitisation: `decodeURIComponent` + trim + lowercase + regex validation;
    only `"30d"` accepted as valid range value

### Changed
- `supabase/schema.sql` — rewritten as complete source of truth for all views, functions, and grants
  through M5; now includes view definition with `is_valid`, `get_session_stats` with FILTER/HAVING,
  `get_group_stats` with all robustness patterns, and structured drop/create/grant sections
- `src/app/g/[join_code]/page.tsx`:
  - Replaced disabled "📊 Leaderboard" placeholder button with live `<Link>` to leaderboard page
  - Leaderboard link now appears in BOTH states (active session and no active session),
    per SPEC §8.1

### No new tables or RLS policy changes
- All stats derived from existing `games`, `game_players`, `sessions`, `players` tables
- No anon UPDATE or DELETE policies added

### Decisions
- See `docs/decisions.md`: D-038 through D-045

### Docs updated
- `docs/decisions.md` — D-038 through D-045 (includes robustness decisions: is_valid flag,
  day-anchored cutoff, explicit type casting, frontend input sanitisation)
- `docs/testing.md` — M5 test matrix (Tests W–Z): All-time math, 30-day filter, sorting/tie-breaking, dashboard link
- `CHANGELOG.md` — this entry
- `README.md` — milestone status + project structure updated

---

## [Milestone 5.1] — Last Session Leaderboard + Session Standings (2026-02-21)

### Added
- `supabase/migrations/m5.1_last_session_standings.sql`:
  - Extended `get_session_stats` from 4 to 10 columns (matching `get_group_stats` shape);
    now returns display_name, code, win_pct, points_for, points_against, avg_point_diff
    using aggregate-then-JOIN pattern with FILTER/HAVING/NULLIF/explicit casting
  - New `get_last_session_id(p_join_code text)` RPC — returns most recently ended session
    UUID for a group (or NULL if none)
  - Grants to both `anon` and `authenticated` roles
- `src/app/g/[join_code]/session/[session_id]/SessionStandings.tsx` — Client Component:
  - Collapsible ranked player list with code badges, W-L, win%, point diff, PF/PA, avg
  - Chevron toggle (▼/▶); expanded by default
  - Reuses same card layout as group leaderboard

### Changed
- `supabase/schema.sql` — updated with extended `get_session_stats` (10 cols),
  `get_last_session_id`, and corresponding drop/grant entries
- `src/app/g/[join_code]/leaderboard/page.tsx`:
  - 3-pill toggle: "All-time" | "30 Days" | "Last Session" (`?range=last`)
  - "Last Session" calls `get_last_session_id` then `get_session_stats`
  - Contextual empty state messages per range mode
- `src/app/g/[join_code]/session/[session_id]/page.tsx`:
  - Added `get_session_stats` RPC call to data fetching
  - Inserted `<SessionStandings>` section above attendees, actions, and game list

### Decisions
- See `docs/decisions.md`: D-046 through D-049

### Docs updated
- `docs/decisions.md` — D-046 through D-049 (extended RPC shape, last-session RPC,
  standings placement, collapsible component)
- `docs/testing.md` — Tests AA–AB: Last Session toggle, Session Standings
- `CHANGELOG.md` — this entry

---

## [Milestone 5.2] — Pairing Balance + Session Page Layout Cleanup (2026-02-21)

### Added
- `supabase/migrations/m5.2_pairing_balance.sql`:
  - New `get_session_pair_counts(p_session_id uuid)` RPC — returns every attendee pair
    with same-team game count; includes 0-count pairs for all combinations from
    session_players; sorted fewest-first, then by name
  - SECURITY INVOKER; grants to anon + authenticated
- `src/app/g/[join_code]/session/[session_id]/PairingBalance.tsx` — Server Component:
  - Displays "Pairing Balance" section with header and "Fewest games together first" subtext
  - Each row: "Player A · Player B — N game(s)" with correct pluralisation
  - Hidden when no pairs (0 attendees)

### Changed
- `supabase/schema.sql` — updated with `get_session_pair_counts` function definition,
  drop entry, and grant; version comment updated to M5.2
- `src/app/g/[join_code]/session/[session_id]/page.tsx`:
  - **Removed** redundant Attendees section (RecordGameForm team selector already shows all players)
  - **Removed** "This session has ended" message block (status badge in header is sufficient)
  - **Moved** EndSessionButton into session header (inline next to session name)
  - **Added** PairingBalance section between Session Standings and Record Game form
  - **Added** `get_session_pair_counts` RPC call to data fetching
  - New layout order: Header (with EndSession) → Standings → Pairing Balance → Record Game → Games
- `src/app/g/[join_code]/session/[session_id]/EndSessionButton.tsx`:
  - Restyled as compact inline pill ("End" / "Confirm?" / "Cancel") for header placement

### Decisions
- See `docs/decisions.md`: D-050 through D-052

### Docs updated
- `docs/decisions.md` — D-050 (Pairing Balance replaces Attendees), D-051 (0-count pairs),
  D-052 (EndSessionButton in header)
- `docs/testing.md` — Test AC: Pairing Balance (10 test cases)
- `CHANGELOG.md` — this entry
- `README.md` — PairingBalance.tsx added to project structure

---

## [Milestone 5.3] — Maintainability + Performance Hardening (2026-02-21)

No functional changes (refactor + docs only).

### Added
- `src/lib/env.ts` — Environment variable validation with descriptive error messages
- `src/lib/types.ts` — Shared TypeScript interfaces: `PlayerStats`, `PairCount`, `Player`, `Group`, `Session`
- `src/lib/formatting.ts` — Shared display helpers (`formatDiff`)
- `src/lib/components/PlayerStatsRow.tsx` — Shared player stats card (deduplicates leaderboard + session standings)
- `src/lib/supabase/server.ts` — Centralized server Supabase client factory (`getServerClient()`)
- `src/lib/supabase/rpc.ts` — RPC function name constants (all 7 RPCs)
- `src/lib/supabase/helpers.ts` — FK join shape normalizer (`one<T>()`)
- `docs/indexes.md` — Expected database index documentation
- `supabase/migrations/m5.3_indexes.sql` — Idempotent `CREATE INDEX IF NOT EXISTS` for 4 FK columns

### Changed
- `src/lib/supabase/client.ts` — uses `env` instead of raw `process.env!`
- `src/app/actions/sessions.ts` — `getServerClient()` + `RPC` constants
- `src/app/actions/players.ts` — `getServerClient()`
- `src/app/actions/games.ts` — `getServerClient()` + `RPC` constants
- `src/app/g/[join_code]/page.tsx` — `getServerClient()`
- `src/app/g/[join_code]/start/page.tsx` — `getServerClient()`
- `src/app/g/[join_code]/start/StartSessionForm.tsx` — imports shared `Player` type
- `src/app/g/[join_code]/players/new/page.tsx` — `getServerClient()`
- `src/app/g/[join_code]/sessions/page.tsx` — `getServerClient()` + shared `Session` type
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — `getServerClient()`, `RPC`, shared types, `one()`, `teamCodes()`
- `src/app/g/[join_code]/session/[session_id]/SessionStandings.tsx` — `PlayerStatsRow` + shared `PlayerStats` type
- `src/app/g/[join_code]/session/[session_id]/PairingBalance.tsx` — shared `PairCount` type
- `src/app/g/[join_code]/session/[session_id]/RecordGameForm.tsx` — imports shared `Player` type
- `src/app/g/[join_code]/leaderboard/page.tsx` — `getServerClient()`, `RPC`, `PlayerStatsRow`, shared types
- `supabase/schema.sql` — appended 4 FK indexes; version comment updated to M5.3

### Decisions
- See `docs/decisions.md`: D-053

### Docs updated
- `docs/decisions.md` — D-053
- `docs/indexes.md` — new file
- `CHANGELOG.md` — this entry
- `README.md` — project structure + quick links updated

---

## [Milestone 6] — Elo v1 + Trust UX + Version/Changelog (2026-02-21)

### Added
- `src/app/changelog/page.tsx` — `/changelog` route: Server Component reads `CHANGELOG.md`,
  renders as HTML via `marked`. Pre-escapes `<` and `>` before parsing to prevent raw HTML injection.
- `supabase/migrations/m6_elo_v1.sql`:
  - `player_ratings` table (PK `group_id + player_id`, rating default 1200, provisional flag)
  - `rating_events` table (audit log, `UNIQUE(game_id, player_id, algo_version)`)
  - `apply_ratings_for_game(p_game_id)` RPC — SECURITY DEFINER, idempotent Elo calculation:
    team average rating, K = 40 if provisional (`games_rated < 5`), K = 20 otherwise,
    standard logistic expected score formula, no margin-of-victory
  - RLS: anon SELECT on both tables; no INSERT/UPDATE for anon (RPC is SECURITY DEFINER)
  - Indexes on `rating_events(game_id)`, `rating_events(player_id)`, `player_ratings(group_id)`

### Changed
- `next.config.ts` — injects `NEXT_PUBLIC_APP_VERSION` from `package.json` at build time
- `package.json` — version bumped from `0.1.0` to `0.2.0`; added `marked` dependency
- `src/app/page.tsx` — version footer: `v0.2.0 · Changes` linking to `/changelog`
- `src/app/g/[join_code]/session/[session_id]/RecordGameForm.tsx` — shutout two-tap guard:
  - Detects shutout (one team scored 0, other scored ≥ 11) on first Save tap
  - Shows inline red warning: "Score includes a 0. Tap Save again to confirm."
  - Button changes to "Confirm Shutout ✅"; 8-second armed window auto-disarms
  - Non-shutout games: zero added friction (same one-tap save)
  - Disarms on any state change (score edit, player toggle, back, reset)
- `src/app/actions/games.ts` — fire-and-forget Elo trigger: after `record_game` returns
  `inserted`, spawns `apply_ratings_for_game` RPC via `void .then().catch()` pattern;
  if Elo fails, game still records and redirect proceeds normally
- `src/lib/supabase/rpc.ts` — added `APPLY_RATINGS_FOR_GAME` constant
- `src/lib/types.ts` — added `PlayerRating` interface
- `src/lib/components/PlayerStatsRow.tsx` — optional `rating` and `provisional` props;
  displays Elo rating below point diff (`1200* Elo` for provisional, `1200 Elo` for established)
- `src/app/g/[join_code]/leaderboard/page.tsx` — fetches `player_ratings` for group,
  passes rating/provisional to `PlayerStatsRow`
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — fetches `player_ratings`,
  builds ratings record, passes to `SessionStandings`
- `src/app/g/[join_code]/session/[session_id]/SessionStandings.tsx` — optional `ratings` prop,
  passes through to `PlayerStatsRow`
- `supabase/schema.sql` — updated to M6: added `apply_ratings_for_game` RPC definition,
  `player_ratings` and `rating_events` table notes, drop/grant entries

### Decisions
- See `docs/decisions.md`: D-054 through D-058

### Docs updated
- `docs/decisions.md` — D-054 through D-058
- `CHANGELOG.md` — this entry
- `README.md` — project structure + milestone status updated

---

## [Milestone 7] — Void Last Game, Courts Mode v1, Help Page, Data Integrity (2026-02-22)

### Added
- `supabase/migrations/m7.0_record_game_for_update.sql` — `FOR UPDATE` lock on session row
  in `record_game` to serialize concurrent game recordings; `SET search_path = public, extensions`
  for pgcrypto compatibility on Supabase
- `supabase/migrations/m7.1_elo_reconciliation.sql` — `vw_games_missing_ratings` view +
  updated `reconcile_missing_ratings` RPC for backfilling missed Elo calculations
- `supabase/migrations/m7.2_one_active_session.sql` — partial unique index
  `idx_one_active_session_per_group` (one active session per group); idempotent `create_session`
- `supabase/migrations/m7.3_void_game.sql`:
  - `void_last_game(p_session_id, p_reason)` RPC — soft-deletes most recent non-voided game
    via `voided_at` timestamp (immutable game model preserved)
  - `recompute_session_ratings(p_session_id)` RPC — forward-replays Elo from earliest affected
    game across ALL group sessions (not just the voided session) to ensure correct deltas
  - Updated `vw_player_game_stats` and `get_session_pair_counts` to exclude voided games
- `supabase/migrations/m0_base_tables.sql` — base DDL extracted for reproducible fresh DB setup
- `src/app/g/[join_code]/session/[session_id]/VoidLastGameButton.tsx` — Client Component:
  2-tap confirmation (amber), calls `voidLastGameAction`, awaits Elo recompute (non-fatal)
- `src/app/g/[join_code]/session/[session_id]/courts/page.tsx` — Courts Mode page wrapper
- `src/app/g/[join_code]/session/[session_id]/courts/CourtsManager.tsx` — Courts Mode v1
  (680 lines): auto-suggest algorithm, slot assignment, per-court score entry
- `src/lib/autoSuggest.ts` — `suggestForCourts()` algorithm: sort by games played then
  recency, select top N×4 players, enumerate 2v2 splits, minimize repeat-partner penalty
- `src/app/help/page.tsx` — Static Help/FAQ page
- `src/app/actions/games.ts` — `voidLastGameAction` with awaited `recompute_session_ratings`
- `src/app/actions/players.ts` — `safeRedirect()` to prevent open redirects in `addPlayerAction`

### Changed
- `src/app/layout.tsx` — global footer with version number + "Changes" link + "Learn more" link
- `src/app/page.tsx` — version footer moved to global layout
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — added VoidLastGameButton, Courts
  Mode navigation link
- `src/lib/supabase/rpc.ts` — added `VOID_LAST_GAME`, `RECOMPUTE_SESSION_RATINGS`,
  `RECONCILE_MISSING_RATINGS` constants

### No docs/decisions.md updates for M7
- Architecture decisions were not formally recorded for M7. Key rationales are captured in
  MEMORY.md (Logic Guardrails section and Resolved Regressions section).

---

## [Milestone 8+9] — Courts Mode V2 + Remove Session Expiry (2026-02-23)

### Added
- `supabase/migrations/m8.0_courts_mode.sql` — Courts Mode V2:
  - `session_courts` table (id, session_id, court_number, status OPEN/IN_PROGRESS, team_a_ids,
    team_b_ids)
  - `status` column on `session_players` (ACTIVE/INACTIVE) with `inactive_effective_after_game`
  - 9 new RPCs: `init_courts`, `assign_courts`, `start_court_game`, `record_court_game`,
    `update_court_assignment`, `clear_court_slot`, `mark_player_out`, `make_player_active`,
    `update_court_count`
  - RLS policies on `session_courts` (SELECT + INSERT for anon)
- `supabase/migrations/m9.0_remove_session_expiry.sql`:
  - Removes 4-hour session expiry from `record_game`, `create_session`, and related functions
  - Sessions now stay active indefinitely until manually ended
- `src/app/actions/courts.ts` — 9 server actions wrapping Courts Mode RPCs
- `src/app/actions/sessions.ts` — `endAndCreateSessionAction` for atomic end + create flow
- `src/app/g/[join_code]/session/[session_id]/StaleBanner.tsx` — Client Component: amber
  banner when session has no games for 24+ hours (UI-only, does not auto-end). Offers
  Resume / Start New / End options
- `src/app/g/[join_code]/session/[session_id]/courts/CourtsSetup.tsx` — initial court count
  selection when no courts exist yet
- `src/lib/types.ts` — added `CourtData`, `AttendeeWithStatus`, `RpcResult<T>` interfaces

### Changed
- `src/app/g/[join_code]/session/[session_id]/courts/CourtsManager.tsx` — complete V2 rewrite
  (680 → 1073 lines): server-persisted court state, horizontal-scroll waiting pool chips with
  slot picker bottom sheet, on-court list, inactive list, fairness summary, inline pairing
  feedback in court cards
- `src/app/g/[join_code]/session/[session_id]/courts/page.tsx` — loads court data + attendees
  from Supabase, renders CourtsSetup or CourtsManager
- `src/app/g/[join_code]/start/StartSessionForm.tsx` — confirmation dialog when starting new
  session while another is active
- `src/app/g/[join_code]/page.tsx` — active session detection improvements
- `src/app/help/page.tsx` — updated text for Courts Mode V2
- `src/lib/autoSuggest.ts` — added helper types and exports for V2 integration
- `src/lib/supabase/rpc.ts` — added 9 Courts Mode RPC constants

---

## [v0.3.0] — Courts Mode + Game Voids (2026-02-22)

### Added
- `CHANGELOG_PUBLIC.md` — user-facing changelog (rendered at `/changelog_public`)
- Inline pairing feedback in `RecordGameForm` team summary panels: "Partners N× this session"
- Inline partner count display in `CourtsManager` court cards

### Changed
- `package.json` — version bumped to `0.3.0`
- `src/app/changelog/page.tsx` → `src/app/changelog_public/page.tsx` — renamed route to fix
  footer 404 (footer links to `/changelog_public`)

### Fixed
- ESLint errors blocking Vercel build (unused variables after refactoring)
- `recompute_session_ratings` scope corrected: replays from `t0` across ALL group sessions,
  not just the voided session
- `search_path = public, extensions` added to `m7.0` record_game for pgcrypto `DIGEST()`
- Global footer visible without scrolling on short pages
- Footer "Changes" link corrected to `/changelog_public`

---

## [v0.3.1] — Live Referee Console (2026-02-23)

### Added
- `src/lib/pairingFeedback.ts` — shared module: `matchupKey()` for canonical team-vs-team
  matchup key, `getMatchupCount()` for exact pairing occurrence count, `severityDotClass()`
  for dot-indicator color (emerald=fresh, gray=normal, amber=caution)
- `src/app/g/[join_code]/session/[session_id]/games/page.tsx` — session game log page:
  first-name display, winner highlighting (emerald-600), voided games (rose badge, muted opacity)
- `src/app/g/[join_code]/session/[session_id]/ModeToggle.tsx` — segmented Manual/Courts
  toggle. Stateless: `mode` prop from server component is source of truth, uses `<Link>` for
  navigation. Contextual subtitle ("Select teams directly" / "Manage multi-court rotation")
- Last-game ticker on live session page: emerald dot + LAST pill + score + team codes + time

### Changed
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — restructured as Live Referee
  Console: LIVE header, ModeToggle, StaleBanner, RecordGameForm, VoidLastGame, last-game
  ticker, "All games →" / "Standings →" footer nav. Ended sessions show simple game log
  instead of full analytics
- `src/app/g/[join_code]/session/[session_id]/RecordGameForm.tsx` — replaced active-team
  targeting with explicit per-row A/B buttons. Each player row has dedicated A and B buttons;
  no active-team concept. Team panels are read-only summaries. Internal scroll
  (`max-h-[45vh]`), sticky Record button with gradient fade, `pb-20` padding guardrail.
  Inline pairing feedback via dot indicators
- `src/app/g/[join_code]/session/[session_id]/courts/CourtsManager.tsx` — global controls
  (Courts ±count, Suggest All, Void) moved above court cards. Inline pairing feedback in
  court cards via dot indicators
- `src/app/g/[join_code]/session/[session_id]/courts/page.tsx` — added ModeToggle with
  `mode="courts"`
- `src/app/g/[join_code]/session/[session_id]/ModeToggle.tsx` — rewritten to be fully
  stateless (no localStorage, no useState); route is single source of truth

### Design changes
- Only the Record Game button uses filled green style; all other buttons are outline-only
- SessionStandings and PairingBalance removed from live session view (accessible via
  "Standings →" link)
- Ended sessions show a simple game log instead of analytics
- `package.json` — version bumped to `0.3.1`
- `CHANGELOG_PUBLIC.md` — added v0.3.1 entry

### Fixed
- ModeToggle localStorage mismatch: eliminated client state entirely; route is now the
  single source of truth, preventing flash of wrong state on navigation

---

## [v0.4.0] — Red Dog Rating (RDR) + Session Rules (2026-02-23)

### Added
- `supabase/migrations/m10.0_rdr_v1.sql` — Full migration: session rule columns, game rule
  columns, `game_rdr_deltas` table, `set_session_rules` RPC, `record_game` with inline RDR
  math, `record_court_game` with rule pass-through, `void_last_game` with LIFO delta reversal,
  `get_group_stats` with server-side RDR sort
- `src/lib/rdr.ts` — Tier utility: `getTier(rdr)` returns Observer/Practitioner/Strategist/Authority/Architect;
  `tierColor(tier)` returns Tailwind classes for tier badge styling
- `src/app/actions/sessions.ts` — `setSessionRulesAction()` for updating session-level game
  rules (target_points + win_by) via `set_session_rules` RPC
- `src/lib/types.ts` — `RdrDelta`, `SessionRules` interfaces; `rdr` field on `PlayerStats`;
  `target_points_default`, `win_by_default` on `Session`
- Rules Chip UI in `RecordGameForm` and `CourtsManager`: tappable chip showing current session
  rules (e.g. "15 · win by 1"), inline picker with presets (11/W2, 15/W1, 21/W2)
- Delta flash in `RecordGameForm`: after successful game record, briefly shows each player's
  RDR change before resetting the form
- `sessions.target_points_default` + `sessions.win_by_default` columns (session-level defaults)
- `games.target_points` + `games.win_by` columns (immutable per-game resolved rules)
- `game_rdr_deltas` table: stores per-player deltas per game for reversible voids (v1.5)
- Tier badges on `PlayerStatsRow`: colored pills showing cosmetic rank tier

### Changed
- `record_game` RPC: inline RDR math (MOV, partner gap dampener, per-player K, clamped deltas),
  resolves rules from session defaults when `p_target_points IS NULL`, fingerprint includes
  target_points and win_by
- `record_court_game` RPC: passes `p_target_points` through to `record_game`
- `void_last_game` RPC: FOR UPDATE lock on session, reads stored deltas from `game_rdr_deltas`,
  reverses ratings atomically, marks game + deltas as voided
- `get_group_stats` RPC: added `p_sort_by` parameter (`'rdr'` or `'win_pct'`), LEFT JOINs
  `player_ratings`, `rdr` column appended to return table
- `src/app/actions/games.ts` — `recordGameAction` no longer redirects; returns
  `{ success, gameId, deltas, targetPoints, winBy }`. Pre-flight validation uses session rules.
  Removed fire-and-forget `apply_ratings_for_game` call
- `src/app/actions/games.ts` — `voidLastGameAction` simplified: no `recompute_session_ratings`;
  void_last_game handles rating reversal atomically
- `src/app/actions/courts.ts` — `recordCourtGameAction` validates against session rules,
  removed fire-and-forget Elo call
- `src/lib/supabase/rpc.ts` — Removed `APPLY_RATINGS_FOR_GAME`, `RECOMPUTE_SESSION_RATINGS`,
  `RECONCILE_MISSING_RATINGS`; added `SET_SESSION_RULES`
- `src/lib/components/PlayerStatsRow.tsx` — "Elo" → "RDR" label + cosmetic tier badge
- `src/app/g/[join_code]/leaderboard/page.tsx` — All-time and 30-day modes call
  `get_group_stats` with `p_sort_by: 'rdr'` for server-side sorting
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — Fetches session rules, passes to
  RecordGameForm as `sessionRules` prop
- `src/app/g/[join_code]/session/[session_id]/courts/page.tsx` — Fetches session rules, passes
  to CourtsManager
- Cold start: all `player_ratings` reset to 1200/0 games/provisional (no replay/backfill)
- `package.json` — version bumped to `0.4.0`

### Fixed
- `get_session_stats` RPC: added `rdr` column (LEFT JOIN `player_ratings`), fixed ORDER BY to
  `win_pct DESC, point_diff DESC, pr.rating DESC NULLS LAST, display_name ASC` — resolves
  tie-breaking bug where same win% + same point diff players were not sorted by RDR
- `get_group_stats` RPC: fixed ORDER BY for `p_sort_by='rdr'` mode — CASE WHEN logic was
  producing NULL for secondary/tertiary sorts. Now properly cascades:
  rdr mode → `rdr DESC, win_pct DESC, point_diff DESC, name ASC`;
  win_pct mode → `win_pct DESC, point_diff DESC, rdr DESC, name ASC`
- Leaderboard page: all three modes now use `rdr` from their respective RPCs (removed
  `useRdrFromStats` flag); no client-side re-sorting

### Branding
- Product renamed: "RedDog Pickle" → "Red Dog" across all visible surfaces
- Home screen: paddle emoji replaced with Red Dog logo (623px source rendered at 160px for
  retina crispness), tagline "Keep score. Keep bragging rights."
- Favicon suite: `icon.svg` (modern browsers), `favicon.ico` (fallback), `apple-icon.png` (iOS),
  configured via App Router `metadata.icons`
- Root layout metadata: title "Red Dog", description "Keep score. Keep bragging rights."
- Group dashboard header: "Red Dog / Play. Track. Repeat." brand block with GROUP eyebrow +
  join_code as secondary metadata (group.name line removed)
- Help page: full rewrite — RDR explainer (who you beat, MOV, doubles balance, new player ramp),
  Manual vs Courts guide, Voids & Rating Integrity section, updated FAQ, Red Dog mark icon above
  heading

### New files
- `supabase/migrations/m10.1_fix_leaderboard_sorting.sql` — DROP+CREATE `get_session_stats`
  (adds rdr column + fixed ORDER BY), CREATE OR REPLACE `get_group_stats` (fixed ORDER BY)
- `src/lib/rdr.ts` — Tier utility (getTier, tierColor)
- `public/PlayRedDog_Logo_Transparent_623px.png` — High-res logo for home screen
- `public/PlayRedDog_Logo_Transparent_160px.png` — Original logo (kept, not referenced)
- `public/PlayRedDog_Logo_Transparent_MarkOnly.png` — Small mark for help page
- `public/favicon.ico` — ICO favicon (renamed from favicon.ico.png)
- `public/icon.svg` — SVG icon for modern browsers
- `public/apple-icon.png` — Apple touch icon

---

## [v0.4.1] — Polish (2026-02-24)

### Changed
- Group dashboard: "Red Dog" text replaced with horizontal logo image (125px)
- Homepage tagline: "A proper record for a plastic ball."
- Group dashboard subtitle: "Statistically unnecessary. Socially unavoidable."
- `layout.tsx` OG metadata: `siteUrl` now reads from `NEXT_PUBLIC_SITE_URL` env var, OG image
  URLs are explicitly absolute via `new URL()`, added `alternates.canonical`
- Tier names: Pup→Observer, Scrapper→Practitioner, Tracker→Strategist, Top Dog→Authority,
  Alpha→Architect
- `package.json` — version bumped to `0.4.1`

### Added
- `NEXT_PUBLIC_SITE_URL` environment variable for per-environment OG URL resolution
- `public/PlayRedDog_Logo_Horizontal_Transparent_125px.png` — horizontal logo for group dashboard
- `public/PlayRedDog_ProperRecord_1200x630px.png` — 1200×630 OG share image

---

## [M10.2] — Fast Error Recovery & Entry Verification (2026-02-25)

### Added
- `supabase/migrations/m10.2_undo_window.sql`:
  - `undo_expires_at timestamptz` column on `games` table
  - `record_game` updated: returns `undo_expires_at` (now + 8 seconds) in success payload
  - `undo_game(p_game_id uuid)` RPC — SECURITY DEFINER, FOR UPDATE row lock, validates not
    voided + undo window not expired + session not ended, reverses ALL non-voided deltas from
    `game_rdr_deltas` (no hardcoded count), marks game + deltas voided with `void_reason = 'undo'`,
    returns `{ status: 'undone', game_id }`
- `src/app/g/[join_code]/session/[session_id]/games/GamesList.tsx` — Client component: session
  game log with `showVoided` toggle (default OFF), client-side voided filtering, voided games
  shown with reduced opacity + "Voided" badge
- `src/app/g/[join_code]/session/[session_id]/EndedSessionGames.tsx` — Client component: ended
  session game list with voided toggle, 3-column grid layout (Team A / vs / Team B)

### Changed
- `src/lib/supabase/rpc.ts` — added `UNDO_GAME` constant
- `src/app/actions/games.ts` — `RecordGameResult` success shape gains `undoExpiresAt: string`;
  new `undoGameAction(gameId: string)` server action calling `undo_game` RPC
- `src/app/g/[join_code]/session/[session_id]/RecordGameForm.tsx`:
  - Removed old 2-second delta flash (deltaTimerRef + deltas state)
  - Added undo queue: `Array<{ gameId, expiresAt }>` with timestamp-based countdown (drift-
    resilient for backgrounded tabs)
  - Debounced `router.refresh()` at 1000ms via `scheduleRefresh()` — never blocks scoring flow
  - Fixed-bottom dark snackbar: "Game recorded." + "Undo (N)" countdown button
  - Pre-submit confirmation summary: "WinnerNames Score def. LoserNames Score" format
  - `playerFirstName()` helper for display names
- `src/app/g/[join_code]/session/[session_id]/games/page.tsx` — replaced inline game list with
  `<GamesList>` component for voided toggle support
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — replaced inline ended session game
  list with `<EndedSessionGames>` component for voided toggle support

---

## [v0.4.2] — Scoring Preview + Timezone Fix (2026-02-25)

### Added
- `src/lib/datetime.ts` — Central timezone formatter pinned to `America/Chicago` (Dallas).
  Exports `formatTime`, `formatDate`, `formatDateTime`, `formatDateString`. Uses
  `Intl.DateTimeFormat` with explicit `timeZone: APP_TIME_ZONE`, locale `"en-US"`, `Number.isNaN`
  guard on all inputs. `formatDateString` handles plain "YYYY-MM-DD" strings via noon
  construction to prevent UTC day-shift

### Changed
- `src/app/g/[join_code]/session/[session_id]/RecordGameForm.tsx` — Replaced single-line "def."
  confirmation summary with two stacked team chips: emerald (winner) + amber (loser) with
  "Winner"/"Loser" labels, neutral gray when tied/incomplete. Layout: `flex items-center
  justify-between`, `min-w-0 flex-1 truncate` for names, `shrink-0` for scores. No "def."
  text anywhere
- `src/app/g/[join_code]/session/[session_id]/page.tsx` — `formatTime()` for started_at and
  last-game timestamps (replaced `toLocaleTimeString`)
- `src/app/g/[join_code]/start/StartSessionForm.tsx` — `formatTime()` + `formatDate()` for
  active session modal (replaced `toLocaleTimeString` / `toLocaleDateString`)
- `src/app/g/[join_code]/session/[session_id]/EndedSessionGames.tsx` — `formatTime()` for
  game played_at (replaced `toLocaleTimeString`)
- `src/app/g/[join_code]/session/[session_id]/games/GamesList.tsx` — `formatTime()` for
  game played_at (replaced `toLocaleTimeString`)
- `src/app/g/[join_code]/session/[session_id]/games/page.tsx` — `formatDate()` for session
  date header (replaced `toLocaleDateString`)
- `src/app/g/[join_code]/sessions/page.tsx` — `formatDateString()` for session_date display
  (replaced local `formatDate()` helper using `toLocaleDateString`); deleted local function
- `package.json` — version bumped to `0.4.2`
- `CHANGELOG_PUBLIC.md` — added v0.4.2 entry

### Removed
- All `toLocaleTimeString` / `toLocaleDateString` calls outside `src/lib/datetime.ts`

---

## [v0.4.3] — View-Only Sharing + Analytics (2026-02-25)

### Added
- `supabase/migrations/m11.0_view_only_codes.sql`:
  - `view_code` + `view_code_created_at` columns on `groups` table
  - Unique index `idx_groups_view_code` (NULLs allowed)
  - Format constraint: `view_code ~ '^[a-z0-9\-]+$'` (idempotent via DO block)
  - `ensure_view_code(p_join_code text)` RPC — SECURITY DEFINER, `SET search_path = public`.
    Normalizes input via `lower()`. If `view_code` already set, returns immediately. Otherwise
    generates `{join_code}-view`, with collision handling via `substr(md5(random()::text), 1, 4)`
    suffix (max 5 attempts). Persists `view_code` + `view_code_created_at = now()`. Grants to
    `anon` + `authenticated`
- `src/app/actions/access.ts` — `AccessMode = "full" | "view"` type + `requireFullAccess(mode)`
  guard function. All write server actions take `mode` as first parameter and call this at the
  top. Safety net against accidental write component reuse in `/v/` routes
- `src/app/g/[join_code]/CopyViewLink.tsx` — Client component: copies
  `{NEXT_PUBLIC_SITE_URL}/v/{viewCode}` to clipboard. Shows "📋 Copy view-only link" with
  brief "Copied!" feedback (1.5s timeout)
- `src/app/v/[view_code]/page.tsx` — View-only dashboard: Red Dog logo, GROUP eyebrow +
  join_code (read-only display), "This is a view-only link" badge, active session banner,
  View Session + Leaderboard links, Session history link. No write CTAs
- `src/app/v/[view_code]/leaderboard/page.tsx` — View-only leaderboard: same data as `/g/`
  version (all 3 range modes via `?range=`), `PlayerStatsRow`, player ratings. No "Start a
  Session" CTA in empty state
- `src/app/v/[view_code]/sessions/page.tsx` — View-only session history: session list with
  active/ended badges, links to `/v/` session detail. No "Start First Session" CTA
- `src/app/v/[view_code]/session/[session_id]/page.tsx` — View-only session detail: active
  sessions show LIVE badge + "View-only" label + last-game ticker + `EndedSessionGames`;
  ended sessions show "Ended" badge + game log. Mismatch protection: verifies
  `session.group_id === group.id`. No write components (RecordGameForm, EndSessionButton,
  VoidLastGameButton, StaleBanner, ModeToggle, Rules Chip, Courts links)
- `src/app/v/[view_code]/session/[session_id]/games/page.tsx` — View-only games list: wraps
  `<GamesList>` component (already read-only). Back link to `/v/` session

### Changed
- `src/app/layout.tsx` — Added `<Analytics />` from `@vercel/analytics/next` inside `<body>`
  for page view and web vitals tracking
- `src/app/g/[join_code]/page.tsx`:
  - Now selects `view_code` from groups; auto-generates via `ensure_view_code` RPC on first
    load if `view_code` is null (idempotent — skips RPC when already set)
  - Not-found fallback checks if entered code is a `view_code` and redirects to `/v/{code}`
  - Secondary nav includes `<CopyViewLink viewCode={group.view_code} />` when view_code exists
- `src/app/actions/games.ts` — All 3 write actions (`recordGameAction`, `voidLastGameAction`,
  `undoGameAction`) now take `mode: AccessMode` as first param + `requireFullAccess()` guard
- `src/app/actions/sessions.ts` — All 4 write actions (`createSessionAction`,
  `endSessionAction`, `endAndCreateSessionAction`, `setSessionRulesAction`) now take
  `mode: AccessMode` as first param + `requireFullAccess()` guard
- `src/app/actions/courts.ts` — All 9 write actions now take `mode: AccessMode` as first
  param + `requireFullAccess()` guard
- All write components updated to pass `"full"` as first arg to action calls:
  `RecordGameForm.tsx`, `EndSessionButton.tsx`, `VoidLastGameButton.tsx`, `StaleBanner.tsx`,
  `StartSessionForm.tsx`, `CourtsManager.tsx`, `CourtsSetup.tsx`
- `src/lib/supabase/rpc.ts` — added `ENSURE_VIEW_CODE` constant
- `package.json` — version bumped to `0.4.3`
- `CHANGELOG_PUBLIC.md` — added v0.4.3 entry

### Security fix — `join_code` removed from view-only pages
- `src/app/v/[view_code]/page.tsx` — Removed `join_code` from `.select()` query. Replaced
  header block ("GROUP" eyebrow + `{group.join_code}` + "This is a view-only link") with
  `{group.name || "Red Dog Group"}` + "View-only link" label. Prevents spectators from
  copying join_code to gain write access via `/g/{join_code}`
- `src/app/v/[view_code]/sessions/page.tsx` — Removed `join_code` from `.select()`
- `src/app/v/[view_code]/session/[session_id]/page.tsx` — Removed `join_code` from `.select()`
- `src/app/v/[view_code]/session/[session_id]/games/page.tsx` — Removed `join_code` from `.select()`
- `src/app/v/[view_code]/leaderboard/page.tsx` — `join_code` kept in `.select()` (required
  for `GET_GROUP_STATS` and `GET_LAST_SESSION_ID` RPCs). Added inline comment:
  `// join_code used server-side only for RPC params; must never be rendered in /v`
- Verified via grep: zero `/g/` link leaks in `/v/` files; `join_code` only in leaderboard
  RPC params + comments

### Route hygiene (verified via grep)
- Zero action imports in any `/v/` file
- Zero write component imports in any `/v/` file
- Zero `/g/` string literals in `/v/` Link hrefs
- All `/v/` routes confirmed as `ƒ` (dynamic) in build output

---

## [v0.5.0] — Session Browsing + Scoring Improvements (2026-03-16)

### Added
- **Suspicious score warning** in `RecordGameForm.tsx` and `CourtsManager.tsx`:
  - `scoreWarningArmed` state (manual) / `courtScoreWarnings` per-court state (courts)
  - `isSuspiciousOvertimeScore()`: fires when winner > target_points AND margin > 2
  - Amber inline confirmation ("Cancel" / "Record anyway") matches existing duplicate warning pattern
  - Auto-clears on score input change; no extra taps for normal scores
- **End Session button in Courts Mode** (`courts/page.tsx`):
  - `EndSessionButton` added to courts header — same position as manual mode
- **Courts Mode footer nav** (`courts/page.tsx`):
  - "All games →" and "Standings →" links at bottom, matching manual mode
  - Standings link includes `from` query param for context-aware back navigation
- **Session standings tab** on ended session detail (`session/[session_id]/page.tsx`):
  - Games / Standings pill toggle (same style as leaderboard range pills)
  - `tab` query param (`games` default, `standings`)
  - Standings tab fetches `get_session_stats` RPC + `player_ratings`, renders `PlayerStatsRow` list
  - Mirrored in `/v/` view-only route
- **Leaderboard session browsing** (`leaderboard/page.tsx`):
  - `session_id` query param for "Last Session" range mode
  - Previous / Next navigation arrows to step through ended sessions
  - Fetches all ended sessions, finds adjacent by index
  - `sessionNavHref()` helper preserves `from` param across navigation
  - Session name displayed below range pills when viewing specific session
  - Mirrored in `/v/` view-only leaderboard
- **Context-aware leaderboard back link** (`leaderboard/page.tsx`):
  - `from` query param: when present, back arrow uses decoded URL instead of group dashboard
  - "Standings →" links from session pages pass `from` param encoding the session URL
  - Mirrored in `/v/` view-only leaderboard

### Changed
- `EndedSessionGames.tsx` — Fully rewritten to match `GamesList.tsx` card layout:
  - Replaced 3-column grid (Team A / vs / Team B with trophy emoji) with score-dash-score + team names layout
  - Winning score highlighted in emerald, losing in neutral gray
  - `GamePlayer` interface updated: `players` now includes `display_name` field
  - Added `shortName()` and `teamNames()` functions for name formatting
- `GamesList.tsx` — `firstName()` renamed to `shortName()`, now produces "Joe S." format (first name + last initial) instead of first name only
- `EndedSessionGames.tsx` — Same `shortName()` formatting: "Joe S." instead of player codes
- `leaderboard/page.tsx` — Standalone `getLastSessionStats()` function removed, logic inlined for session nav support. `group!.join_code` non-null assertion added.
- `v/[view_code]/leaderboard/page.tsx` — Same changes as `/g/` leaderboard with `group!.view_code` assertion
- `package.json` — Version bumped to `0.5.0`
- `CHANGELOG_PUBLIC.md` — Added v0.5.0 entry
- `supabase/migrations/m12.0_simplify_win_by.sql` — Recreates `record_game` and `record_court_game` RPCs with relaxed score validation (win-by constraint removed from DB layer)

### Migration required
- `m12.0_simplify_win_by.sql` must be applied to Supabase before deploy — updated `record_game` and `record_court_game` RPCs remove server-side win-by validation

---

<!-- Template for future entries:

## [Milestone N] — Title (YYYY-MM-DD)

### Added
-

### Changed
-

### Fixed
-

### Decisions
- See docs/decisions.md: D-XXX

### Assumptions
- See docs/assumptions.md: A-XXX

-->
