# MEMORY.md — RedDog Pickle

> Last updated: 2026-02-22 (post-M7 on `dev` branch)

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
**M7 is deployed to `dev` branch / dev Supabase.** Production (`main`) is still on M6.

Remaining before merge to main:
- Manual QA of Void Last Game, Courts Mode, Help page on dev
- Verify Elo recompute correctness after void
- Update NEXT_PUBLIC_APP_VERSION for release
- Merge `dev` → `main`

---

## The "Source of Truth" (State of Code)

### Git State
- **Branch:** `dev` (ahead of `main` by M7 commits)
- **Latest commit:** `0f5e56b` — fix: footer links to /changelog_public
- **Remote:** `origin` → `https://github.com/Crestover/RedDogPickle.git`
- **Vercel prod:** deploys from `main`
- **Vercel preview:** deploys from `dev` at `red-dog-pickle-git-dev-mamdanis-projects.vercel.app`

### Environments
| Environment | Vercel Branch | Supabase Instance | Status |
|-------------|---------------|-------------------|--------|
| Production  | `main`        | Production        | M6 (stable) |
| Dev/Preview | `dev`         | Dev               | M7 (testing) |

### File Map

#### Root
| File | Role |
|------|------|
| `package.json` | v0.2.0, scripts: dev/build/start/lint/type-check |
| `SPEC.md` | Functional specification |
| `BUILD_PLAN.md` | Milestone roadmap |
| `CHANGELOG_PUBLIC.md` | User-facing changelog (rendered at /changelog_public) |
| `MEMORY.md` | This file |
| `.env.example` | Template for env vars |
| `.env.local` | Actual env vars (git-ignored) |

#### `src/app/` — Pages & Layouts
| File | Role |
|------|------|
| `layout.tsx` | Root layout: flex-col body, global footer (version + /changelog_public link) |
| `page.tsx` | Home: group code entry form + "Learn more" link |
| `help/page.tsx` | Static Help/FAQ page (Server Component) |
| `changelog/page.tsx` | Renders CHANGELOG_PUBLIC.md as HTML via `marked` |
| `g/[join_code]/page.tsx` | Group dashboard: active session detection, Start/Continue buttons |
| `g/[join_code]/start/page.tsx` | Start session: select attendees (min 4) |
| `g/[join_code]/players/new/page.tsx` | Add player form |
| `g/[join_code]/sessions/page.tsx` | Session history list |
| `g/[join_code]/leaderboard/page.tsx` | Leaderboard: all-time / 30-day / last-session toggle |
| `g/[join_code]/session/[session_id]/page.tsx` | Session page: standings, pairing balance, record game, void, courts link, game list |
| `g/[join_code]/session/[session_id]/courts/page.tsx` | Courts Mode server wrapper (active session only) |

#### `src/app/` — Client Components
| File | Role |
|------|------|
| `g/[join_code]/start/StartSessionForm.tsx` | Player selection checkboxes + create session |
| `g/[join_code]/players/new/AddPlayerForm.tsx` | Name + code input with auto-suggest |
| `g/[join_code]/session/[session_id]/RecordGameForm.tsx` | 3-step wizard: select → scores → confirm. Shutout guard (8s), duplicate detection |
| `g/[join_code]/session/[session_id]/EndSessionButton.tsx` | 2-tap confirm (red) |
| `g/[join_code]/session/[session_id]/VoidLastGameButton.tsx` | 2-tap confirm (amber), accepts redirectPath prop for Courts Mode |
| `g/[join_code]/session/[session_id]/SessionStandings.tsx` | Collapsible standings with Elo ratings |
| `g/[join_code]/session/[session_id]/PairingBalance.tsx` | Pair game counts (fewest first) |
| `g/[join_code]/session/[session_id]/courts/CourtsManager.tsx` | Full courts UI: suggest/reshuffle/reselect, slot swap, per-court score entry, waiting pool, inactive toggle, court locking |

#### `src/app/actions/` — Server Actions
| File | Role |
|------|------|
| `sessions.ts` | `createSessionAction`, `endSessionAction` |
| `players.ts` | `addPlayerAction` with `safeRedirect()` (M7 open-redirect fix) |
| `games.ts` | `recordGameAction` (fire-and-forget Elo), `voidLastGameAction` (awaited recompute, non-fatal) |

#### `src/lib/` — Shared Utilities
| File | Role |
|------|------|
| `types.ts` | Shared interfaces: PlayerStats, PairCount, Player, Group, PlayerRating, Session |
| `env.ts` | Environment variable validation |
| `formatting.ts` | `formatDiff()` for numeric display |
| `suggestCode.ts` | Derive player code from display name |
| `autoSuggest.ts` | Court assignment algorithm: `autoSuggest()`, `reshuffleTeams()`, `reselectPlayers()` |
| `supabase/server.ts` | Server-side Supabase client (anon key) |
| `supabase/client.ts` | Browser-side Supabase client (anon key) |
| `supabase/helpers.ts` | `one()` — normalize FK join results (single object or array) |
| `supabase/rpc.ts` | RPC constant registry (11 constants) |
| `components/PlayerStatsRow.tsx` | Reusable ranked player row (name, stats, Elo badge) |

#### `supabase/` — Database
| File | Role |
|------|------|
| `schema.sql` | Canonical reference (views, abbreviated function signatures, grants). Currently M6 state + search_path fix only. M7 functions live in migration files. |
| `migrations/m0_base_tables.sql` | Base DDL: 6 tables + RLS + void columns. Fresh setup file #1. |
| `migrations/m2_rpc_sessions.sql` | create_session, end_session RPCs |
| `migrations/m4_record_game.sql` | Original record_game RPC |
| `migrations/m4.1_duplicate_warn.sql` | Enhanced duplicate detection (fingerprint + 15-min window) |
| `migrations/m5_group_leaderboards.sql` | vw_player_game_stats, get_group_stats |
| `migrations/m5.1_last_session_standings.sql` | get_last_session_id, get_session_stats |
| `migrations/m5.2_pairing_balance.sql` | get_session_pair_counts |
| `migrations/m5.3_indexes.sql` | FK indexes for performance |
| `migrations/m6_elo_v1.sql` | player_ratings + rating_events tables, apply_ratings_for_game RPC |
| `migrations/m7.0_record_game_for_update.sql` | FOR UPDATE lock (C-1/M-2 fix), `search_path = public, extensions` |
| `migrations/m7.1_elo_reconciliation.sql` | vw_games_missing_ratings view, reconcile_missing_ratings RPC |
| `migrations/m7.2_one_active_session.sql` | Partial unique index, idempotent create_session |
| `migrations/m7.3_void_game.sql` | Void columns, void_last_game RPC, recompute_session_ratings RPC, updated views |

### Fresh Dev DB Setup Order
1. Run `m0_base_tables.sql` (creates all 6 tables + RLS + void columns)
2. Run `schema.sql` (creates views, functions 1-6)
3. Run `m6_elo_v1.sql` (creates player_ratings, rating_events, apply_ratings_for_game)
4. Run `m7.0`, `m7.1`, `m7.2`, `m7.3` in order

---

## Core Logic (Most Complex Functions)

### record_game RPC (m7.0)
1. `FOR UPDATE` lock on session row (serializes concurrent calls)
2. Validates: session active (4-hour rule), 2+2 players, no overlap, all attendees, scores valid
3. SHA-256 fingerprint: sorted teams + min:max score (order-invariant, no time bucket)
4. Duplicate check: same fingerprint within 15 min → returns `possible_duplicate`
5. Atomic sequence_num increment + INSERT games + 4 game_players
6. `search_path = public, extensions` (pgcrypto DIGEST lives in `extensions` schema on Supabase)

### apply_ratings_for_game (m6)
1. Idempotency check (existing rating_events → early return)
2. Upsert default 1200 rating for new players
3. Team avg = (p1 + p2) / 2; Expected = 1/(1+10^(diff/400))
4. K-factor: 40 if provisional (<5 games), else 20
5. Same delta for both teammates; no margin-of-victory factor

### recompute_session_ratings (m7.3)
1. Find Elo introduction boundary: `MIN(played_at)` of any rated game in group
2. Find rewind point `t0`: earliest game in affected session within rated era
3. Reverse ALL rating_events for group from `t0` onward (undo deltas)
4. Delete those rating_events
5. Replay ALL non-voided games from `t0` onward across ALL group sessions
6. Correctness: replays beyond just the voided session because later games' deltas depend on prior ratings

### autoSuggest algorithm (autoSuggest.ts)
1. Sort players by (games_played ASC, lastPlayedAt ASC)
2. Select first `courtCount * 4` players
3. For each court's 4 players, enumerate 3 possible 2v2 splits
4. Pick split minimizing repeat-partner penalty (from pairCounts)
5. Assign to courts sequentially

---

## The Design Back-Burner (Deferred / V2)

### UX Enhancements
- Animated leaderboard row reordering / rank change arrows
- Player avatar colors
- Session summary card (MVP, highlights)
- Shareable leaderboard link
- Dark mode (night court)
- Loading skeleton states
- Real-time updates (currently requires page refresh)
- Optimistic UI after recording a game

### Intelligence Features
- Elo delta display per game in game history
- Matchup stats (head-to-head record)
- Best teammate stats
- Streak tracking (win/loss streaks)
- Rating history graph over time

### Structural Extensions
- Player join/leave mid-session tracking
- Player deactivation/archival UI
- Admin role (currently anyone can do everything)
- Group creation UI (currently manual in Supabase)

---

## The Technical Debt Confession

### Database
- **schema.sql is stale**: Only reflects M6 state. M7 function bodies live only in migration files. Schema should be rewritten to be fully self-contained. (File: `supabase/schema.sql`)
- **No automated SQL tests**: RPC correctness relies on manual QA only
- **Hardcoded 4-player-per-game**: record_game assumes exactly 2v2 (files: `m7.0_record_game_for_update.sql`, `games.ts`)
- **No player_ratings cleanup on void**: If a void causes games_rated to go to 0, the player_ratings row still exists at whatever rating it landed on (file: `m7.3_void_game.sql`)
- **vw_games_missing_ratings uses `created_at`**: The reconciliation view still uses `rating_events.created_at` for the Elo boundary (line 272 of m7.3), while `recompute_session_ratings` correctly uses `played_at`. Minor inconsistency. (File: `supabase/migrations/m7.3_void_game.sql`)

### Frontend
- **No global error boundary**: RPC failures show raw error strings (all page.tsx files)
- **No centralized design tokens**: Colors/spacing are ad-hoc Tailwind classes
- **Range query param parsing**: Simplistic string match on leaderboard (file: `leaderboard/page.tsx`)
- **Courts Mode force=true**: Courts Mode skips duplicate detection entirely by passing `force: true` (file: `CourtsManager.tsx`)
- **No loading states**: Server Components block render; no Suspense boundaries or skeletons
- **localStorage for court count only**: No persistence of court assignments or inactive players across page refreshes (file: `CourtsManager.tsx`)

### Server Actions
- **No rate limiting**: Any client can spam recordGameAction (files: `games.ts`, `sessions.ts`)
- **Fire-and-forget Elo has no client-side retry**: If apply_ratings_for_game fails, user sees no indication. Reconciliation is the safety net but must be called manually. (File: `games.ts` line 99-101)

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
**File:** `src/app/actions/games.ts` (line 99: `void Promise.resolve(supabase.rpc(...))`)

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

---

## Claude Code Execution Plan (Next 3 Steps)

1. **Manual QA on dev preview** — Test all M7 features on `red-dog-pickle-git-dev-mamdanis-projects.vercel.app`:
   - Create session → record games → void last game → verify standings update
   - Open Courts Mode → suggest → swap players → record from court → verify
   - Check /help page renders correctly
   - Verify footer shows version + "Changes" link goes to /changelog_public
   - Verify voided games show with opacity + VOIDED badge

2. **Rewrite `supabase/schema.sql` to be fully self-contained** — Currently stale at M6. Should include all M7 function bodies, void columns, updated views, new indexes. This is the canonical reference for fresh DB setup.

3. **Merge `dev` → `main` and deploy to production** — After QA passes:
   - Bump version in `package.json` and `NEXT_PUBLIC_APP_VERSION`
   - Run M7 SQL migrations on production Supabase (m7.0 → m7.3)
   - `git checkout main && git merge dev && git push`

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
    actions/          # Server actions
    g/[join_code]/    # Group routes (dynamic)
      session/[session_id]/
        courts/       # Courts Mode sub-route
    help/             # Static help page
    changelog/        # Rendered markdown changelog
  lib/
    supabase/         # Supabase clients + helpers + RPC constants
    components/       # Shared presentational components
    *.ts              # Pure utility functions
supabase/
  schema.sql          # Canonical DB reference
  migrations/         # Ordered SQL migrations (m0, m2, m4, m5, m6, m7)
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

-- RPCs exist
SELECT proname FROM pg_proc WHERE proname IN ('record_game', 'void_last_game', 'recompute_session_ratings', 'reconcile_missing_ratings', 'create_session');

-- Partial unique index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_one_active_session_per_group';

-- Elo reconciliation view
SELECT COUNT(*) FROM public.vw_games_missing_ratings;
```

### Manual QA Checklist
- [ ] Home page → enter group code → lands on dashboard
- [ ] Start session with 4+ players → session page renders
- [ ] Record game → standings update, game appears in list
- [ ] Duplicate detection → record same game within 15 min → amber warning
- [ ] Void last game → game shows VOIDED badge at 40% opacity, standings update
- [ ] Courts Mode → suggest fills courts, swap works, record from court works
- [ ] End session → session shows "Ended" badge, form disappears
- [ ] Leaderboard → all-time / 30-day / last-session tabs work
- [ ] Help page → renders FAQ content
- [ ] Footer → shows version, "Changes" link goes to /changelog_public

---

## Logic Guardrails (Do NOT Change)

1. **`dedupe_key` generation in record_game**: Order-invariant SHA-256 of sorted teams + min:max score. No time bucket. Changing this breaks duplicate detection for all existing games.

2. **`search_path = public, extensions`** on record_game: Required for pgcrypto's `DIGEST()` on Supabase. Removing `extensions` breaks game recording.

3. **`one()` helper for FK joins** (`src/lib/supabase/helpers.ts`): Supabase returns single objects or arrays depending on version. All FK join access must go through `one()`.

4. **`Promise.resolve()` wrapper around Supabase `.rpc()` for fire-and-forget**: Supabase returns PromiseLike without `.catch()`. The wrapper is required.

5. **4-hour active session window**: Checked in record_game RPC, session page, courts page, and group dashboard. All must agree. Changing the window requires updating all 4 locations.

6. **Immutable game model + soft-delete**: Games are NEVER physically deleted. `voided_at` is the only mechanism. `vw_player_game_stats` and `get_session_pair_counts` filter by `voided_at IS NULL`.

7. **Elo recompute replays from `t0` across ALL group sessions**: Not just the voided session. This is intentional — later games' deltas depend on prior ratings. Scoping to one session would leave stale deltas.

8. **Leaderboard deterministic ordering**: `win_pct DESC, games_won DESC, point_diff DESC, display_name ASC`. Changing order breaks user expectations.

---

## External Dependencies

### Supabase (PostgreSQL + REST)
- `NEXT_PUBLIC_SUPABASE_URL` — Project URL (browser-safe)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon/public key (browser-safe, subject to RLS)
- `NEXT_PUBLIC_APP_VERSION` — Displayed in global footer

### Vercel
- Hosting via Next.js preset
- Production: deploys from `main` branch
- Preview: deploys from all other branches (e.g., `dev`)
- No custom build commands — uses default `npm run build`

### pgcrypto Extension
- Required for `DIGEST()` / `ENCODE()` in record_game fingerprinting
- Lives in `extensions` schema on Supabase (not `public`)
- Must be enabled in Supabase dashboard (Extensions → pgcrypto)

### No Other External APIs
- No auth providers
- No analytics
- No third-party APIs

---

*End of MEMORY snapshot.*
