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
