# MEMORY.md — RedDog Pickle

> Last updated: 2026-02-22 (post-M7, all patches on `dev` branch)

---

## Current Project DNA

### App Purpose
RedDog Pickle is a **mobile-first pickleball stats tracker** for live courtside scoring.
- Record doubles games in <12 seconds
- No login required (trust-based group access via join_code)
- Immutable game history (soft-delete only via voided_at)
- Cross-device duplicate prevention (SHA-256 fingerprint, 15-min window)
- Session + group leaderboards with Elo ratings
- Courts Mode for multi-court auto-assignment
- Inline pairing feedback shows partner history during team selection

### Core Tech Stack
| Layer       | Technology                         |
|-------------|-------------------------------------|
| Framework   | Next.js 15.1.11 (App Router)        |
| React       | React 19                            |
| Language    | TypeScript (strict)                 |
| Database    | Supabase PostgreSQL + RPC functions |
| Styling     | Tailwind CSS 3.4                    |
| Hosting     | Vercel (Next.js preset)             |
| Extensions  | pgcrypto (in `extensions` schema)   |

### Active Sprint Goal
**M7 complete + patches on `dev` branch.** Production (`main`) is still on M6.

Remaining before merge to main:
- Manual QA of Void Last Game, Courts Mode, Help page, pairing feedback on dev
- Verify Elo recompute correctness after void
- Run M7 SQL migrations on production Supabase (m7.0 → m7.3)
- Merge `dev` → `main`

---

## The "Source of Truth" (State of Code)

### Git State
- **Branch:** `dev` (ahead of `main` by M7+ commits)
- **Latest commit:** `4749ea6` — feat: changelog route fix, version bump 0.3.0, inline pairing feedback
- **Remote:** `origin` → `https://github.com/Crestover/RedDogPickle.git`
- **Vercel prod:** deploys from `main`
- **Vercel preview:** deploys from `dev` at `red-dog-pickle-git-dev-mamdanis-projects.vercel.app`

### Environments
| Environment | Vercel Branch | Supabase Instance | Status |
|-------------|---------------|-------------------|--------|
| Production  | `main`        | Production        | M6 (stable) |
| Dev/Preview | `dev`         | Dev               | M7 + patches (testing) |

### Complete File Map

#### Root Config
| File | Role |
|------|------|
| `package.json` | v0.3.0, deps: next 15.1.11, react 19, @supabase/supabase-js, marked. Scripts: dev/build/start/lint/type-check |
| `next.config.ts` | Injects `NEXT_PUBLIC_APP_VERSION` from package.json version |
| `tsconfig.json` | Strict mode, ES2017 target, `@/*` → `./src/*` |
| `tailwind.config.ts` | Standard Next.js config |
| `postcss.config.mjs` | Tailwind + Autoprefixer |
| `.env.example` | Template for env vars |
| `.env.local` | Actual env vars (git-ignored) |

#### Documentation
| File | Role |
|------|------|
| `SPEC.md` | Functional specification v1.3 |
| `BUILD_PLAN.md` | 7-milestone roadmap |
| `README.md` | Project overview, quick links, getting started |
| `CHANGELOG_PUBLIC.md` | User-facing changelog (rendered at /changelog_public) |
| `MEMORY.md` | This file |
| `docs/decisions.md` | Architecture decisions |
| `docs/how-to-run.md` | Local dev setup |
| `docs/how-to-deploy.md` | Vercel deployment |
| `docs/how-to-update-schema.md` | Supabase SQL migration guide |
| `docs/testing.md` | Manual test checklist |
| `docs/assumptions.md` | Recorded ambiguities |
| `docs/indexes.md` | Database indexes + rationale |

#### `src/app/` — Pages & Layouts
| File | Type | Role |
|------|------|------|
| `layout.tsx` | Server | Root layout: `min-h-dvh` body, `<main className="flex-1">` wrapper, global footer (version + /help + /changelog_public) |
| `page.tsx` | Client | Home: group code entry form (no account needed) |
| `help/page.tsx` | Server | Static Help/FAQ page (sessions, recording, leaderboards, Elo, no-accounts) |
| `changelog_public/page.tsx` | Server | Renders CHANGELOG_PUBLIC.md as styled HTML via `marked` with XSS escaping |
| `g/[join_code]/page.tsx` | Server | Group dashboard: active session detection, Start/Continue/Leaderboard buttons |
| `g/[join_code]/start/page.tsx` | Server | Start session page: wraps StartSessionForm |
| `g/[join_code]/start/StartSessionForm.tsx` | Client | Player selection with live search, min 4 required |
| `g/[join_code]/players/new/page.tsx` | Server | Add player page: wraps AddPlayerForm |
| `g/[join_code]/players/new/AddPlayerForm.tsx` | Client | Name + code input with auto-suggest code from name |
| `g/[join_code]/sessions/page.tsx` | Server | Session history list with active/ended badges |
| `g/[join_code]/leaderboard/page.tsx` | Server | Leaderboard: all-time / 30-day / last-session toggle via URL query params |
| `g/[join_code]/session/[session_id]/page.tsx` | Server | Session page: standings, pairing balance, record game form, void button, courts link, game list with voided rendering |
| `g/[join_code]/session/[session_id]/RecordGameForm.tsx` | Client | 3-step wizard: select → scores → confirm. Shutout guard (8s timer), duplicate detection, **inline pairing feedback** in team summary panels |
| `g/[join_code]/session/[session_id]/EndSessionButton.tsx` | Client | 2-tap confirm (red) for ending session |
| `g/[join_code]/session/[session_id]/VoidLastGameButton.tsx` | Client | 2-tap confirm (amber) for voiding last game. Accepts `redirectPath` prop |
| `g/[join_code]/session/[session_id]/SessionStandings.tsx` | Client | Collapsible standings table with Elo ratings |
| `g/[join_code]/session/[session_id]/PairingBalance.tsx` | Server | Pair game counts sorted fewest first |
| `g/[join_code]/session/[session_id]/courts/page.tsx` | Server | Courts Mode server wrapper (active session guard). Fetches games, pairCounts, ratings, gamesPlayedMap |
| `g/[join_code]/session/[session_id]/courts/CourtsManager.tsx` | Client | Full courts UI: auto-suggest/reshuffle/reselect, slot swap modal, per-court score entry, waiting pool, inactive toggle, court locking, **inline pairing feedback** in court cards |

#### `src/app/actions/` — Server Actions
| File | Role |
|------|------|
| `sessions.ts` | `createSessionAction`, `endSessionAction` |
| `players.ts` | `addPlayerAction` with `safeRedirect()` open-redirect prevention |
| `games.ts` | `recordGameAction` (fire-and-forget Elo), `voidLastGameAction` (awaited recompute, non-fatal) |

#### `src/lib/` — Shared Utilities
| File | Role |
|------|------|
| `types.ts` | Interfaces: PlayerStats, PairCount, Player, Group, PlayerRating, Session |
| `env.ts` | Environment variable validation (NEXT_PUBLIC_SUPABASE_URL, _ANON_KEY) |
| `formatting.ts` | `formatDiff()` — formats numeric with +/- sign |
| `suggestCode.ts` | `suggestCode()` — derive player code from display name (JD, BOB, etc.) |
| `autoSuggest.ts` | Court assignment: `autoSuggest()`, `reshuffleTeams()`, `reselectPlayers()`. Types: GameRecord, CourtAssignment, PairCountEntry. Helpers: `pairKey()`, `buildPairMap()`, `teamPenalty()` |
| `supabase/server.ts` | `getServerClient()` — server-side Supabase client (anon key) |
| `supabase/client.ts` | Browser-side Supabase singleton (anon key) |
| `supabase/helpers.ts` | `one()` — normalize FK join results (array or single object) |
| `supabase/rpc.ts` | RPC constant registry: 11 named constants |
| `components/PlayerStatsRow.tsx` | Reusable ranked player row (rank, name, code, stats, Elo badge) |

#### `src/app/globals.css`
- Tailwind directives only (`@tailwind base/components/utilities`)
- No custom CSS

#### `supabase/` — Database
| File | Role |
|------|------|
| `schema.sql` | Canonical reference (stale at ~M6, M7 functions live in migration files) |
| `migrations/m0_base_tables.sql` | Base DDL: groups, players, sessions, session_players, games, game_players + RLS + void columns |
| `migrations/m2_rpc_sessions.sql` | create_session, end_session RPCs |
| `migrations/m4_record_game.sql` | Original record_game RPC |
| `migrations/m4.1_duplicate_warn.sql` | Enhanced duplicate detection (fingerprint + 15-min window, jsonb return) |
| `migrations/m5_group_leaderboards.sql` | vw_player_game_stats view, get_group_stats RPC |
| `migrations/m5.1_last_session_standings.sql` | get_last_session_id, get_session_stats (10-column shape) |
| `migrations/m5.2_pairing_balance.sql` | get_session_pair_counts |
| `migrations/m5.3_indexes.sql` | FK indexes: games_session_id, game_players_game_id, session_players_session_id, game_players_player_id |
| `migrations/m6_elo_v1.sql` | player_ratings + rating_events tables + RLS, apply_ratings_for_game, reconcile_missing_ratings RPCs |
| `migrations/m7.0_record_game_for_update.sql` | FOR UPDATE lock (C-1/M-2 race fix), `search_path = public, extensions` |
| `migrations/m7.1_elo_reconciliation.sql` | vw_games_missing_ratings view, reconcile_missing_ratings RPC update |
| `migrations/m7.2_one_active_session.sql` | Partial unique index `idx_one_active_session_per_group`, idempotent create_session |
| `migrations/m7.3_void_game.sql` | void_last_game RPC, recompute_session_ratings RPC, updated vw_player_game_stats + vw_games_missing_ratings to exclude voided games |

### Fresh Dev DB Setup Order
1. Run `m0_base_tables.sql` (creates all 6 tables + RLS + void columns)
2. Run `schema.sql` (creates views, functions 1-6)
3. Run `m6_elo_v1.sql` (creates player_ratings, rating_events, apply_ratings_for_game)
4. Run `m7.0`, `m7.1`, `m7.2`, `m7.3` in order

---

## Core Logic (Most Complex Functions)

### record_game RPC (m7.0)
1. `FOR UPDATE` lock on session row (serializes concurrent calls)
2. Validates: session active (4-hour rule), 2+2 players, no overlap, all attendees, scores valid (winner >= 11, margin >= 2)
3. SHA-256 fingerprint: sorted teams + min:max score (order-invariant, no time bucket)
4. Duplicate check: same fingerprint within 15 min → returns `{ status: 'possible_duplicate', existing_game_id, existing_created_at }`
5. Atomic sequence_num increment + INSERT games + 4 game_players
6. `search_path = public, extensions` (pgcrypto DIGEST lives in `extensions` schema on Supabase)

### apply_ratings_for_game (m6)
1. Idempotency check: existing rating_events for `(game_id, 'elo_v1')` → early return
2. Upsert default 1200 rating for new players
3. Team avg = (p1_rating + p2_rating) / 2
4. Expected = 1 / (1 + 10^((opponent_avg - team_avg) / 400))
5. K = 40 if provisional (games_rated < 5), else 20 — per-player independent
6. delta = round(K * (actual - expected)), actual = 1 for win, 0 for loss
7. Same delta for both teammates; no margin-of-victory factor
8. Update player_ratings + insert rating_events (UNIQUE constraint = idempotency)

### recompute_session_ratings (m7.3)
1. Find Elo introduction boundary: `MIN(played_at)` of any rated game in group
2. Find rewind point `t0`: earliest game in affected session within rated era
3. **Reverse** ALL rating_events for the GROUP from `t0` onward (undo deltas)
4. **Delete** those rating_events
5. **Replay** ALL non-voided games from `t0` onward across ALL group sessions (ordered by played_at, sequence_num)
6. Return count of replayed games
7. **Critical**: replays beyond just the voided session because later games' deltas depend on prior ratings

### autoSuggest algorithm (autoSuggest.ts)
1. Sort players by (games_played ASC, lastPlayedAt ASC)
2. Select first `courtCount * 4` players
3. For each court's 4 players, enumerate 3 possible 2v2 splits
4. Pick split minimizing repeat-partner penalty (from pairCounts, using canonical pair key)
5. Assign to courts sequentially

### Pairing Feedback (RecordGameForm + CourtsManager)
- `getPairCount(a, b)`: Uses canonical key `a < b ? "${a}:${b}" : "${b}:${a}"` to look up pair in pairCounts array
- Displays "Partners N× this session" when both team slots are filled
- RecordGameForm: shown in team summary panels (blue/orange)
- CourtsManager: shown under each court's team slots (blue/orange)

---

## The Design Back-Burner (Deferred / V2)

### UX Enhancements
- Animated leaderboard row reordering / rank change arrows
- Player avatar colors
- Session summary card (MVP, highlights)
- Shareable leaderboard link
- Dark mode (night court)
- Loading skeleton states / Suspense boundaries
- Real-time updates (currently requires page refresh)
- Optimistic UI after recording a game

### Intelligence Features
- Elo delta display per game in game history
- Matchup stats (head-to-head record)
- Best teammate stats
- Streak tracking (win/loss streaks)
- Rating history graph over time
- Opponent pairing feedback (not just partners)

### Structural Extensions
- Player join/leave mid-session tracking
- Player deactivation/archival UI
- Admin role (currently anyone can do everything)
- Group creation UI (currently manual in Supabase)
- PWA / install prompt for courtside use

---

## The Technical Debt Confession

### Database
- **schema.sql is stale**: Only reflects ~M6 state. M7 function bodies live only in migration files. Should be rewritten to be fully self-contained. (File: `supabase/schema.sql`)
- **No automated SQL tests**: RPC correctness relies on manual QA only
- **Hardcoded 4-player-per-game**: record_game assumes exactly 2v2 (files: `m7.0_record_game_for_update.sql`, `games.ts`)
- **No player_ratings cleanup on void**: If a void causes games_rated to go to 0, the player_ratings row still exists at whatever rating it landed on (file: `m7.3_void_game.sql`)
- **vw_games_missing_ratings uses `created_at`**: The reconciliation view still uses `rating_events.created_at` for the Elo boundary, while `recompute_session_ratings` correctly uses `played_at`. Minor inconsistency. (File: `supabase/migrations/m7.3_void_game.sql`)

### Frontend
- **No global error boundary**: RPC failures show raw error strings (all page.tsx files)
- **No centralized design tokens**: Colors/spacing are ad-hoc Tailwind classes
- **Range query param parsing**: Simplistic string match on leaderboard (file: `leaderboard/page.tsx`)
- **Courts Mode force=true**: Courts Mode skips duplicate detection entirely by passing `force: true` (file: `CourtsManager.tsx`)
- **No loading states**: Server Components block render; no Suspense boundaries or skeletons
- **localStorage for court count only**: No persistence of court assignments or inactive players across page refreshes (file: `CourtsManager.tsx`)
- **Pair lookup is linear scan**: `getPairCount()` / `getPairGames()` use `.find()` on the pairCounts array. Fine for <=20 players (190 pairs) but could be optimized with a Map for very large groups. (Files: `RecordGameForm.tsx`, `CourtsManager.tsx`)

### Server Actions
- **No rate limiting**: Any client can spam recordGameAction (files: `games.ts`, `sessions.ts`)
- **Fire-and-forget Elo has no client-side retry**: If apply_ratings_for_game fails, user sees no indication. Reconciliation is the safety net but must be called manually. (File: `games.ts` lines ~99-101)

---

## Resolved Regressions (Critical Bugs & Gotchas)

### 1. `function digest(bytea, text) does not exist`
**Cause:** pgcrypto extension lives in `extensions` schema on Supabase, not `public`.
**Fix:** `SET search_path = public, extensions` on record_game function.
**Gotcha:** Every SECURITY DEFINER function that calls pgcrypto must include `extensions` in search_path. Currently only record_game uses it.
**Files:** `supabase/schema.sql`, `supabase/migrations/m7.0_record_game_for_update.sql`

### 2. Supabase `.rpc()` returns PromiseLike (not Promise)
**Cause:** Supabase JS client returns a PromiseLike that doesn't have `.catch()`.
**Fix:** Wrap in `Promise.resolve()` before calling `.catch()`.
**File:** `src/app/actions/games.ts` (line ~99: `void Promise.resolve(supabase.rpc(...))`)

### 3. FK join returns single object OR array depending on Supabase version
**Cause:** Supabase PostgREST can return `{code: "X"}` or `[{code: "X"}]` for FK joins.
**Fix:** `one()` helper in `src/lib/supabase/helpers.ts` normalizes both shapes.
**Gotcha:** Always use `one()` when accessing FK join results, never assume shape.

### 4. ESLint blocks Vercel build on unused variables
**Cause:** Next.js build runs ESLint in CI; unused vars = build failure.
**Fix:** Remove unused imports/variables before pushing.
**Gotcha:** Always run `npm run build` locally before pushing (or at minimum `npm run lint`).

### 5. Open redirect in addPlayerAction
**Cause:** `redirectTo` param was passed directly to `redirect()` without validation.
**Fix:** `safeRedirect()` helper that only allows paths starting with `/` (not `//`).
**File:** `src/app/actions/players.ts`

### 6. Elo recompute was session-scoped (incorrect)
**Cause:** Original recompute_session_ratings only reversed/replayed within the voided session. Games in later sessions had stale deltas.
**Fix:** Forward-replay from `t0` across ALL group sessions. Use `played_at` not `created_at` as boundary.
**File:** `supabase/migrations/m7.3_void_game.sql`
**Gotcha:** Recompute is group-wide, not session-scoped. This is intentional.

### 7. `/changelog_public` 404
**Cause:** Footer linked to `/changelog_public` but route directory was named `changelog`.
**Fix:** `git mv src/app/changelog src/app/changelog_public`
**Commit:** `4749ea6`

---

## Claude Code Execution Plan (Next 3 Steps)

1. **Manual QA on dev preview** — Test all M7 features on `red-dog-pickle-git-dev-mamdanis-projects.vercel.app`:
   - Create session → record games → void last game → verify standings update
   - Verify inline pairing feedback shows "Partners N× this session" in team summary panels
   - Open Courts Mode → suggest → verify pairing feedback in court cards → swap → record
   - Check /help page renders correctly
   - Verify footer shows `v0.3.0` + "Changes" link goes to /changelog_public (no 404)
   - Verify voided games show with opacity + VOIDED badge

2. **Rewrite `supabase/schema.sql` to be fully self-contained** — Currently stale at ~M6. Should include all M7 function bodies, void columns, updated views, new indexes. This is the canonical reference for fresh DB setup.

3. **Merge `dev` → `main` and deploy to production** — After QA passes:
   - Run M7 SQL migrations on production Supabase (m7.0 → m7.3)
   - `git checkout main && git merge dev && git push`
   - Verify production deployment at the Vercel domain

---

## Coding Standards & Patterns

### Database
- RPC names: `snake_case` (e.g., `record_game`, `get_session_stats`)
- View names: `vw_` prefix (e.g., `vw_player_game_stats`)
- All table/schema references fully qualified: `public.table_name`
- SECURITY DEFINER for write RPCs; SECURITY INVOKER for read RPCs
- Explicit type casting in all aggregates (`::numeric`, `::bigint`)
- `NULLIF` for divide-by-zero protection
- `CREATE OR REPLACE` preferred; `DROP FUNCTION` only when changing signature
- Immutable game history: soft-delete via `voided_at`, never physical DELETE
- All DEFINER functions: `SET search_path = public` (add `, extensions` if using pgcrypto)

### Frontend
- Server Components by default; `"use client"` only when needed (forms, state, effects)
- Tailwind CSS only — no inline styles, no CSS modules
- Mobile-first layout: `max-w-sm mx-auto`, large tap targets (`min-h-[48px]+`)
- RPC for all derived stats — no client-side aggregation
- 2-tap confirmation pattern for destructive actions (End Session, Void Game)
- Color scheme: green (primary), blue (Team A), orange (Team B), red/amber (destructive), gray (neutral)
- Root layout owns `<main>` element; pages use `<div>` to avoid nested `<main>` tags
- Centered pages use `flex-1` for vertical centering; content pages use plain flow
- `min-h-dvh` on body (not `min-h-screen`) for proper mobile viewport handling

### TypeScript
- `camelCase` for variables/functions, `PascalCase` for types/components
- Centralized types in `src/lib/types.ts`
- RPC names in `src/lib/supabase/rpc.ts` as `const` object
- Server actions in `src/app/actions/` with `"use server"` directive
- Path alias: `@/` maps to `src/`

### Folder Structure
```
src/
  app/
    actions/          # Server actions (sessions.ts, players.ts, games.ts)
    g/[join_code]/    # Group routes (dynamic)
      session/[session_id]/
        courts/       # Courts Mode sub-route
      start/          # Start session
      players/new/    # Add player
      sessions/       # Session history
      leaderboard/    # Group leaderboard
    help/             # Static help page
    changelog_public/ # Rendered markdown changelog
  lib/
    supabase/         # Supabase clients + helpers + RPC constants
    components/       # Shared presentational components (PlayerStatsRow)
    *.ts              # Pure utility functions (types, env, formatting, suggestCode, autoSuggest)
supabase/
  schema.sql          # Canonical DB reference (currently stale at ~M6)
  migrations/         # Ordered SQL migrations (m0, m2, m4, m4.1, m5, m5.1, m5.2, m5.3, m6, m7.0-m7.3)
docs/                 # Architecture docs, how-tos, decisions, testing checklist
```

---

## The Validation Suite

### Local Build Check
```bash
npm install
npm run type-check    # TypeScript compilation (no emit)
npm run lint          # ESLint
npm run build         # Full Next.js production build (catches all errors)
```

### Supabase Smoke Queries (run in SQL Editor)
```sql
-- Tables exist with void columns
SELECT column_name FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'voided_at';

-- All RPCs exist
SELECT proname FROM pg_proc WHERE proname IN ('record_game', 'void_last_game', 'recompute_session_ratings', 'reconcile_missing_ratings', 'create_session', 'end_session', 'apply_ratings_for_game', 'get_session_stats', 'get_group_stats', 'get_last_session_id', 'get_session_pair_counts');

-- Partial unique index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_one_active_session_per_group';

-- Elo reconciliation check (should be 0 if all healthy)
SELECT COUNT(*) FROM public.vw_games_missing_ratings;
```

### Manual QA Checklist
- [ ] Home page → enter group code → lands on dashboard
- [ ] Start session with 4+ players → session page renders
- [ ] Record game → standings update, game appears in list
- [ ] Team summary panels show "Partners N× this session" when 2 players selected
- [ ] Duplicate detection → record same game within 15 min → amber warning
- [ ] Void last game → game shows VOIDED badge at 40% opacity, standings update
- [ ] Courts Mode → suggest fills courts with partner count displayed
- [ ] Courts Mode → swap players → pairing feedback updates
- [ ] Courts Mode → record from court works
- [ ] End session → session shows "Ended" badge, form disappears
- [ ] Leaderboard → all-time / 30-day / last-session tabs work
- [ ] Help page → renders FAQ content
- [ ] Footer → shows v0.3.0, "Learn more →" links to /help, "Changes" links to /changelog_public

---

## Logic Guardrails (Do NOT Change)

1. **`dedupe_key` generation in record_game**: Order-invariant SHA-256 of sorted teams + min:max score. No time bucket. Changing this breaks duplicate detection for all existing games.

2. **`search_path = public, extensions`** on record_game: Required for pgcrypto's `DIGEST()` on Supabase. Removing `extensions` breaks game recording.

3. **`one()` helper for FK joins** (`src/lib/supabase/helpers.ts`): Supabase returns single objects or arrays depending on version. All FK join access must go through `one()`.

4. **`Promise.resolve()` wrapper around Supabase `.rpc()` for fire-and-forget**: Supabase returns PromiseLike without `.catch()`. The wrapper is required. (File: `games.ts`)

5. **4-hour active session window**: Checked in record_game RPC, session page, courts page, and group dashboard. All must agree. Changing the window requires updating all 4 locations.

6. **Immutable game model + soft-delete**: Games are NEVER physically deleted. `voided_at` is the only mechanism. `vw_player_game_stats` and `get_session_pair_counts` filter by `voided_at IS NULL`.

7. **Elo recompute replays from `t0` across ALL group sessions**: Not just the voided session. This is intentional — later games' deltas depend on prior ratings. Scoping to one session would leave stale deltas.

8. **Leaderboard deterministic ordering**: `win_pct DESC, games_won DESC, point_diff DESC, display_name ASC`. Changing order breaks user expectations.

9. **Root layout owns `<main>`, pages use `<div>`**: Prevents nested `<main>` elements. Pages that need vertical centering use `flex-1`. Content pages use plain `flex flex-col`.

10. **Pair key canonicalization**: `a < b ? "${a}:${b}" : "${b}:${a}"` — used in autoSuggest.ts, RecordGameForm.tsx, and CourtsManager.tsx. Must match for pair lookups to work.

---

## External Dependencies

### Supabase (PostgreSQL + REST)
- `NEXT_PUBLIC_SUPABASE_URL` — Project URL (browser-safe)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon/public key (browser-safe, subject to RLS)
- `NEXT_PUBLIC_APP_VERSION` — Auto-injected from package.json, displayed in global footer

### Vercel
- Hosting via Next.js preset
- Production: deploys from `main` branch
- Preview: deploys from all other branches (e.g., `dev`)
- No custom build commands — uses default `npm run build`

### pgcrypto Extension
- Required for `DIGEST()` / `ENCODE()` in record_game fingerprinting
- Lives in `extensions` schema on Supabase (not `public`)
- Must be enabled in Supabase dashboard (Extensions → pgcrypto)

### NPM Dependencies (Production)
- `next@15.1.11` — Framework
- `react@^19.0.0` / `react-dom@^19.0.0` — UI
- `@supabase/supabase-js@^2.49.1` — Database client
- `marked@^17.0.3` — Markdown parser for changelog

### No Other External APIs
- No auth providers
- No analytics
- No third-party APIs
- No CDNs for assets

---

## RPC Function Reference (11 functions)

| RPC Name | Security | Params | Returns | Purpose |
|----------|----------|--------|---------|---------|
| `create_session` | INVOKER | `(group_join_code text, player_ids uuid[])` | `uuid` | Create session + attendance. Idempotent on concurrent calls (M7.2) |
| `end_session` | DEFINER | `(p_session_id uuid)` | `void` | Sets ended_at + closed_reason='manual' |
| `record_game` | DEFINER | `(p_session_id, p_team_a_ids[], p_team_b_ids[], p_team_a_score, p_team_b_score, p_force)` | `jsonb` | Atomic game recording with dedup. FOR UPDATE lock |
| `get_session_stats` | INVOKER | `(p_session_id uuid)` | `TABLE(10 cols)` | Session leaderboard |
| `get_group_stats` | INVOKER | `(p_join_code text, p_days int?)` | `TABLE(10 cols)` | Group leaderboard with optional day filter |
| `get_last_session_id` | INVOKER | `(p_join_code text)` | `uuid` | Most recently ended session |
| `get_session_pair_counts` | INVOKER | `(p_session_id uuid)` | `TABLE(5 cols)` | All attendee pairs + partner count |
| `apply_ratings_for_game` | DEFINER | `(p_game_id uuid)` | `void` | Idempotent Elo update for one game |
| `reconcile_missing_ratings` | DEFINER | `()` | `integer` | Backfill missing Elo ratings across all groups |
| `void_last_game` | DEFINER | `(p_session_id uuid, p_reason text?)` | `jsonb` | Soft-delete most recent non-voided game |
| `recompute_session_ratings` | DEFINER | `(p_session_id uuid)` | `integer` | Forward-replay Elo from earliest affected game |

---

## Database Tables (7 tables)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `groups` | id, name, join_code | join_code: lowercase alphanumeric + hyphens, unique |
| `players` | id, group_id, display_name, code, is_active | code: uppercase, unique per group |
| `sessions` | id, group_id, name, started_at, ended_at, closed_reason | Partial unique: one active per group |
| `session_players` | session_id, player_id | Attendance junction |
| `games` | id, session_id, sequence_num, scores, dedupe_key, voided_at | Immutable, soft-delete only |
| `game_players` | game_id, player_id, team ('A'/'B') | 4 rows per game |
| `player_ratings` | group_id, player_id, rating, games_rated, provisional | Elo state |
| `rating_events` | game_id, player_id, pre/post_rating, delta, algo_version | Elo audit log, idempotent via UNIQUE |

---

## Milestone History

| Milestone | Commit | Description |
|-----------|--------|-------------|
| M0-M1 | (early) | Project setup, group access, dashboard shell |
| M2 | (early) | Sessions (RPC-based create + end) |
| M3 | (early) | Add player + session history |
| M4 | (early) | Record game with duplicate detection |
| M5 | `66cbf9e`→`70c9b28` | Leaderboards, pairing balance, indexes, maintainability |
| M6 | `bba8440` | Elo v1, shutout guard, version/changelog |
| M7 | `ab55473` | Void Last Game, Courts Mode, Help page, data integrity (FOR UPDATE, one-active-session) |
| Patches | `2b2caff`→`4749ea6` | ESLint fixes, Elo recompute correction, pgcrypto search_path, footer overhaul, changelog route fix, version bump 0.3.0, inline pairing feedback |

---

*End of MEMORY snapshot.*
