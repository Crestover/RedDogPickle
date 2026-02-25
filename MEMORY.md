# MEMORY.md — Red Dog

> Last updated: 2026-02-25 — v0.4.2

---

## Current Project DNA

### App Purpose
Red Dog is a **mobile-first pickleball stats tracker** for live courtside scoring.
- Record doubles games in <12 seconds
- No login required (trust-based group access via join_code)
- Immutable game history (soft-delete only via voided_at)
- Cross-device duplicate prevention (SHA-256 fingerprint, 15-min window)
- Session + group leaderboards with RDR (Red Dog Rating) — MOV + partner gap dampener
- Courts Mode for multi-court auto-assignment with fairness algorithm
- Live Referee Console — zero-scroll scoring with explicit A/B team buttons
- Inline pairing feedback shows partner/matchup history during team selection

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
**v0.4.2 — Scoring preview chips + global timezone fix deployed to dev.**

v0.4.0 base: Red Dog Rating (RDR) replaces Elo. Session-level game rules (11/15/21, win-by 1/2). Rating-correct LIFO void. Cosmetic tier badges. Server-side leaderboard sorting by RDR (all 3 views). Full rebrand: product renamed to "Red Dog", logo + favicon + help page rewrite.
v0.4.1 patch: Group dashboard horizontal logo, env-based OG URLs (`NEXT_PUBLIC_SITE_URL`), tier rename (Observer/Practitioner/Strategist/Authority/Architect), homepage + group subtitle copy updates.
M10.2: 8-second undo window (server-enforced via `undo_expires_at`), hide voided games by default (client-side toggle), undo snackbar with countdown, debounced refresh.
v0.4.2: Winner/loser preview chips replace "def." sentence summary. Central timezone formatter (`src/lib/datetime.ts`) pins all displayed times to America/Chicago.

---

## The "Source of Truth" (State of Code)

### Git State
- **Branch:** `dev` is ahead of `main` (v0.4.2 changes); `main` at v0.3.1
- **Tag:** `v0.4.0-rc1` on dev as rollback point
- **Version:** `0.4.2` (package.json, footer, changelog)
- **Remote:** `origin` → `https://github.com/Crestover/RedDogPickle.git`
- **Vercel prod:** deploys from `main`
- **Vercel preview:** deploys from `dev`

### Environments
| Environment | Vercel Branch | Supabase Instance | Status |
|-------------|---------------|-------------------|--------|
| Production  | `main`        | Production        | v0.3.1 (live, migrations run, pending merge) |
| Dev/Preview | `dev`         | Dev               | v0.4.2 (deployed) |

### Complete File Map

#### Root Config
| File | Role |
|------|------|
| `package.json` | v0.4.2, deps: next 15.1.11, react 19, @supabase/supabase-js 2.49.1, marked 17.0.3, @vercel/analytics. Scripts: dev/build/start/lint/type-check |
| `next.config.ts` | Injects `NEXT_PUBLIC_APP_VERSION` from package.json version at build time |
| `tsconfig.json` | Strict mode, ES2017 target, `@/*` → `./src/*` |
| `tailwind.config.ts` | Standard Next.js config |
| `postcss.config.mjs` | Tailwind + Autoprefixer |
| `.env.example` | Template: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL |
| `.env.local` | Actual env vars (git-ignored) |

#### Documentation
| File | Role |
|------|------|
| `SPEC.md` | Functional specification v1.3 |
| `BUILD_PLAN.md` | 7-milestone roadmap (complete) |
| `README.md` | Project overview, quick links, getting started |
| `CHANGELOG_PUBLIC.md` | User-facing changelog (rendered at /changelog_public) |
| `MEMORY.md` | This file — session migration document |
| `docs/decisions.md` | Architecture decisions (D-001 through D-058) |
| `docs/how-to-run.md` | Local dev setup |
| `docs/how-to-deploy.md` | Vercel deployment |
| `docs/how-to-update-schema.md` | Supabase SQL migration guide |
| `docs/testing.md` | Manual test checklist |
| `docs/assumptions.md` | Recorded ambiguities |
| `docs/indexes.md` | Database indexes + rationale |

#### `src/app/` — Pages & Layouts
| File | Type | Role |
|------|------|------|
| `layout.tsx` | Server | Root layout: `min-h-dvh` body, `<main className="flex-1">`, global footer. Metadata: title "Red Dog", icons (SVG + ICO + Apple). `siteUrl` from `NEXT_PUBLIC_SITE_URL` env var. OG/Twitter with explicitly absolute image URLs via `new URL()`. `alternates.canonical`. |
| `page.tsx` | Client | Home: Red Dog logo (623px source at 160px), tagline "A proper record for a plastic ball.", group code entry form |
| `help/page.tsx` | Server | Help page: Red Dog mark, RDR explainer, Manual vs Courts, Voids & Rating Integrity, FAQ |
| `changelog_public/page.tsx` | Server | Renders CHANGELOG_PUBLIC.md as styled HTML via `marked` |
| `g/[join_code]/page.tsx` | Server | Group dashboard: horizontal Red Dog logo (125px), subtitle "Statistically unnecessary. Socially unavoidable.", GROUP eyebrow + join_code, active session detection, Start/Continue/Leaderboard/Sessions links |
| `g/[join_code]/start/page.tsx` | Server | Start session page: wraps StartSessionForm |
| `g/[join_code]/start/StartSessionForm.tsx` | Client | Player selection with live search, min 4 required |
| `g/[join_code]/players/new/page.tsx` | Server | Add player page: wraps AddPlayerForm |
| `g/[join_code]/players/new/AddPlayerForm.tsx` | Client | Name + code input with auto-suggest code from name |
| `g/[join_code]/sessions/page.tsx` | Server | Session history list with active/ended badges |
| `g/[join_code]/leaderboard/page.tsx` | Server | Leaderboard: all-time / 30-day / last-session toggle via URL query params |
| `g/[join_code]/session/[session_id]/page.tsx` | Server | **Live Referee Console**: LIVE header, ModeToggle(manual), StaleBanner, RecordGameForm, VoidLastGame, last-game ticker, "All games →" / "Standings →" footer nav. Ended sessions show simple game log. |
| `g/[join_code]/session/[session_id]/ModeToggle.tsx` | Client | Segmented Manual/Courts toggle. **Stateless** — `mode` prop from route is source of truth, uses `<Link>`. Renders contextual subtitle ("Select teams directly" / "Manage multi-court rotation"). |
| `g/[join_code]/session/[session_id]/RecordGameForm.tsx` | Client | **Explicit per-row A/B buttons**. Each player row has dedicated A and B buttons. No active-team targeting. Team panels are read-only summaries. Internal scroll (`max-h-[45vh]`), sticky Record button with gradient fade, `pb-20` padding guardrail. Inline pairing feedback (dot severity). **M10.2**: Undo snackbar (8s countdown, LIFO queue), debounced refresh (1000ms). **v0.4.2**: Two-chip winner/loser preview (emerald/amber) replaces "def." sentence. |
| `g/[join_code]/session/[session_id]/EndSessionButton.tsx` | Client | 2-tap confirm (red) for ending session |
| `g/[join_code]/session/[session_id]/VoidLastGameButton.tsx` | Client | 2-tap confirm (amber) for voiding last game. Accepts `redirectPath` prop |
| `g/[join_code]/session/[session_id]/StaleBanner.tsx` | Client | Amber banner when session has no games for 24+ hours. Resume / Start New / End options |
| `g/[join_code]/session/[session_id]/SessionStandings.tsx` | Client | Collapsible standings table (NOT used on live session page — only via Standings → link) |
| `g/[join_code]/session/[session_id]/PairingBalance.tsx` | Server | Pair game counts sorted fewest first (NOT used on live session page) |
| `g/[join_code]/session/[session_id]/EndedSessionGames.tsx` | Client | Game list for ended sessions with voided toggle (default OFF). 3-column grid layout (Team A / vs / Team B). |
| `g/[join_code]/session/[session_id]/games/GamesList.tsx` | Client | Session game log with `showVoided` toggle (default OFF). Client-side voided filtering. Winner highlighting (emerald-600), voided games (reduced opacity + badge). |
| `g/[join_code]/session/[session_id]/games/page.tsx` | Server | **Session game log**: Wraps `<GamesList>` component. First-name display, winner highlighting. |
| `g/[join_code]/session/[session_id]/courts/page.tsx` | Server | Courts Mode wrapper: LIVE header with "Courts" label, ModeToggle(courts), CourtsManager or CourtsSetup |
| `g/[join_code]/session/[session_id]/courts/CourtsManager.tsx` | Client | Full courts UI (1073 lines). Global controls ABOVE court cards (Row 1: Courts ±count + Void; Row 2: Suggest All). Court cards, fairness summary, horizontal-scroll waiting chips with slot picker bottom sheet, On Court list, Inactive list. Inline pairing feedback in court cards. |
| `g/[join_code]/session/[session_id]/courts/CourtsSetup.tsx` | Client | Initial court count selection when no courts exist yet |

#### `src/app/actions/` — Server Actions
| File | Role |
|------|------|
| `sessions.ts` | `createSessionAction`, `endSessionAction`, `endAndCreateSessionAction` |
| `players.ts` | `addPlayerAction` with `safeRedirect()` open-redirect prevention |
| `games.ts` | `recordGameAction` (returns success+deltas+undoExpiresAt, no redirect), `voidLastGameAction` (atomic delta reversal), `undoGameAction` (8s undo window) |
| `courts.ts` | 9 actions: `initCourtsAction`, `suggestCourtsAction`, `startCourtGameAction`, `recordCourtGameAction`, `assignCourtSlotAction`, `clearCourtSlotAction`, `markPlayerOutAction`, `makePlayerActiveAction`, `updateCourtCountAction` |

#### `src/lib/` — Shared Utilities
| File | Role |
|------|------|
| `types.ts` | Interfaces: PlayerStats, PairCount, Player, Group, PlayerRating, Session, CourtData, AttendeeWithStatus, RpcResult<T> |
| `env.ts` | Environment variable validation (NEXT_PUBLIC_SUPABASE_URL, _ANON_KEY) |
| `datetime.ts` | Central timezone formatter: `APP_TIME_ZONE = "America/Chicago"`, `formatTime()`, `formatDate()`, `formatDateTime()`, `formatDateString()`. All UI time formatting must route through this file. Uses `Intl.DateTimeFormat` with explicit `timeZone`. |
| `formatting.ts` | `formatDiff()` — formats numeric with +/- sign |
| `suggestCode.ts` | `suggestCode()` — derive player code from display name (JD, BOB, etc.) |
| `autoSuggest.ts` | Court assignment algorithm: `suggestForCourts()`. Types: GameRecord, CourtAssignment, PairCountEntry. Helpers: `pairKey()`, `buildPairMap()`, `teamPenalty()` |
| `pairingFeedback.ts` | `matchupKey()`, `getMatchupCount()`, `severityDotClass()`. Shared by RecordGameForm + CourtsManager |
| `supabase/server.ts` | `getServerClient()` — server-side Supabase client (anon key) |
| `supabase/client.ts` | Browser-side Supabase singleton (anon key) |
| `supabase/helpers.ts` | `one()` — normalize FK join results (array or single object) |
| `supabase/rpc.ts` | RPC constant registry: 22 named constants (13 core + 9 courts) |
| `rdr.ts` | Tier utility: `getTier(rdr)` → Observer/Practitioner/Strategist/Authority/Architect; `tierColor(tier)` → Tailwind classes |
| `components/PlayerStatsRow.tsx` | Reusable ranked player row (rank, name, code, stats, RDR badge + tier) |

#### `src/app/globals.css`
- Tailwind directives only (`@tailwind base/components/utilities`)
- No custom CSS

#### `supabase/` — Database
| File | Role |
|------|------|
| `schema.sql` | Canonical reference (**stale at ~M6 for most functions** — M7+ function bodies live only in migration files; `get_session_stats` and `get_group_stats` updated to match m10.1) |
| `migrations/m0_base_tables.sql` | Base DDL: groups, players, sessions, session_players, games, game_players + RLS + void columns |
| `migrations/m2_rpc_sessions.sql` | create_session, end_session RPCs |
| `migrations/m4_record_game.sql` | Original record_game RPC |
| `migrations/m4.1_duplicate_warn.sql` | Enhanced duplicate detection (fingerprint + 15-min window, jsonb return) |
| `migrations/m5_group_leaderboards.sql` | vw_player_game_stats view, get_group_stats RPC |
| `migrations/m5.1_last_session_standings.sql` | get_last_session_id, get_session_stats (10-column shape) |
| `migrations/m5.2_pairing_balance.sql` | get_session_pair_counts |
| `migrations/m5.3_indexes.sql` | FK indexes: games_session_id, game_players_game_id, session_players_session_id, game_players_player_id |
| `migrations/m6_elo_v1.sql` | player_ratings + rating_events tables + RLS, apply_ratings_for_game, reconcile_missing_ratings RPCs |
| `migrations/m7.0_record_game_for_update.sql` | FOR UPDATE lock, `search_path = public, extensions` |
| `migrations/m7.1_elo_reconciliation.sql` | vw_games_missing_ratings view, reconcile_missing_ratings update |
| `migrations/m7.2_one_active_session.sql` | Partial unique index `idx_one_active_session_per_group`, idempotent create_session |
| `migrations/m7.3_void_game.sql` | void_last_game RPC, recompute_session_ratings RPC, updated views to exclude voided games |
| `migrations/m8.0_courts_mode.sql` | Courts Mode V2: session_courts table, session_players status column, 9 RPCs (init/assign/start/record/update/clear/mark_out/make_active/update_count) |
| `migrations/m9.0_remove_session_expiry.sql` | Removes 4-hour session expiry from record_game, create_session, and related functions. Sessions no longer auto-expire. |
| `migrations/m10.0_rdr_v1.sql` | RDR v1 + session rules: session rule columns, game rule columns, game_rdr_deltas table, set_session_rules, record_game with inline RDR math, record_court_game with rule pass-through, void_last_game with LIFO delta reversal, get_group_stats with p_sort_by + rdr column. Cold start resets player_ratings to 1200. |
| `migrations/m10.1_fix_leaderboard_sorting.sql` | Fix leaderboard sorting: get_session_stats gains rdr column + correct ORDER BY (win_pct → point_diff → rdr → name). get_group_stats fixed ORDER BY for rdr mode (rdr → win_pct → point_diff → name). |
| `migrations/m10.2_undo_window.sql` | 8-second undo window: adds `undo_expires_at` column, updates `record_game` to return it, creates `undo_game` RPC (FOR UPDATE lock, validates not voided + not expired + session not ended, reverses ALL non-voided deltas, marks voided with `void_reason = 'undo'`). |

### Fresh Dev DB Setup Order
1. Run `m0_base_tables.sql` (creates all 6 base tables + RLS + void columns)
2. Run `schema.sql` (creates views, base functions)
3. Run `m6_elo_v1.sql` (creates player_ratings, rating_events, apply_ratings_for_game)
4. Run `m7.0`, `m7.1`, `m7.2`, `m7.3` in order
5. Run `m8.0_courts_mode.sql` (session_courts table, Courts Mode RPCs)
6. Run `m9.0_remove_session_expiry.sql` (removes 4-hour expiry from RPCs)
7. Run `m10.0_rdr_v1.sql` (RDR v1 + session rules, cold start reset)
8. Run `m10.1_fix_leaderboard_sorting.sql` (leaderboard sorting fix)
9. Run `m10.2_undo_window.sql` (8-second undo window + undo_game RPC)

---

## Core Logic (Most Complex Functions)

### record_game RPC (m7.0, updated m9.0)
1. `FOR UPDATE` lock on session row (serializes concurrent calls)
2. Validates: session active (no ended_at — **no time-based expiry**), 2+2 players, no overlap, all attendees, scores valid (winner >= target_points, margin >= win_by)
3. Resolves rules from session defaults when `p_target_points IS NULL`: `v_target_points := COALESCE(p_target_points, session.target_points_default)`, `v_win_by := session.win_by_default`
4. SHA-256 fingerprint: sorted teams + min:max score + target_points + win_by (order-invariant, no time bucket)
5. Duplicate check: same fingerprint within 15 min → returns `{ status: 'possible_duplicate', existing_game_id, existing_created_at }`
6. Atomic sequence_num increment + INSERT games (with target_points, win_by) + 4 game_players
7. **RDR math** (inline, atomic):
   - Team avg = (p1_rating + p2_rating) / 2
   - Expected = 1 / (1 + 10^((opponent_avg - team_avg) / 400))
   - MOV: d_norm = LEAST(abs_diff / target_points, 0.75), mov = LN(d_norm * 10 + 1)
   - Partner gap dampener: <50→1.00, <100→0.85, <200→0.70, ≥200→0.55
   - K = 60 provisional (<20 games), 22 established
   - raw_delta = K * (actual - expected) * (1 + mov) * gap_mult
   - Clamped: ±40 provisional, ±25 established
8. Persist to `game_rdr_deltas` (4 rows: game_id, player_id, delta, rdr_before, rdr_after, games_before, games_after)
9. `search_path = public, extensions` (pgcrypto DIGEST lives in `extensions` schema on Supabase)
10. Returns `{ status, game_id, target_points, win_by, undo_expires_at, deltas: [{player_id, delta, rdr_after}] }`

### void_last_game (m10.0 — rating-correct LIFO)
1. Lock session row FOR UPDATE (concurrency safety)
2. Find most recent non-voided game
3. Verify exactly 4 un-voided delta rows in `game_rdr_deltas`
4. Reverse ratings per player: `rating -= delta`, `games_rated = games_before`, `provisional = (games_before < 20)`
5. Mark game `voided_at = now()` + mark delta rows `voided_at = now()`
6. Return `{ status: 'voided', voided_game_id }`

### undo_game (m10.2 — 8-second undo window)
1. Lock game row FOR UPDATE (concurrency safety)
2. Validate: not voided, `undo_expires_at IS NOT NULL`, `undo_expires_at >= now()`, session not ended
3. Resolve group_id from session
4. Reverse ALL non-voided deltas: loop `game_rdr_deltas WHERE voided_at IS NULL`, subtract delta from player rating, restore games_before
5. Mark game `voided_at = now(), void_reason = 'undo'` + mark delta rows `voided_at = now()`
6. Return `{ status: 'undone', game_id }`
7. Idempotent: second concurrent caller finds voided_at set → rejects cleanly

### Session Rules
- **Session-level defaults**: `sessions.target_points_default` (11/15/21), `sessions.win_by_default` (1/2)
- **Per-game resolved rules**: `games.target_points`, `games.win_by` — immutable truth for each game
- **set_session_rules RPC**: Hardened SECURITY DEFINER. Validates session exists + active + real group. Updates session defaults.
- **UI**: Rules Chip (tappable, shows "15 · win by 1") with inline picker presets. Shared in RecordGameForm + CourtsManager.
- **Rule override semantics (v1)**: `p_target_points` override uses `session.win_by_default` for win_by. Future v2 can add `p_win_by`.

### RDR Tier System (cosmetic, UI-only)
- <1100: Observer (gray)
- 1100-1199: Practitioner (blue)
- 1200-1299: Strategist (green)
- 1300-1399: Authority (yellow)
- ≥1400: Architect (red)
- Thresholds based on `Math.round(rating)` to avoid edge-case confusion

### Rating Storage
- `player_ratings.rating` is `numeric(7,2)` — stored with full precision
- UI displays `Math.round(rating)` everywhere (leaderboard, PlayerStatsRow, tier input)
- Deltas stored in `game_rdr_deltas` with full precision

### Legacy Rating System (m6, superseded by RDR in m10.0)
- `apply_ratings_for_game` still exists but is no longer called (fire-and-forget removed)
- `recompute_session_ratings` still exists but is no longer called (void uses LIFO reversal)
- `rating_events` table still exists (not modified, no DELETE); cold start reset player_ratings only
- K=40/20, no MOV, no partner gap — replaced by K=60/22 + MOV + gap dampener

### autoSuggest algorithm (autoSuggest.ts)
1. Sort players by (games_played ASC, lastPlayedAt ASC)
2. Select first `courtCount * 4` players
3. For each court's 4 players, enumerate 3 possible 2v2 splits
4. Pick split minimizing repeat-partner penalty (from pairCounts, using canonical pair key)
5. Assign to courts sequentially

### Pairing Feedback (pairingFeedback.ts)
- `matchupKey(teamA, teamB)`: Canonical key for exact team-vs-team matchup (bidirectional, order-insensitive)
- `getMatchupCount(teamA, teamB, games)`: Count occurrences of this exact pairing in game history
- `severityDotClass(count)`: N=0 → emerald (fresh), N=1 → gray (normal), N>=2 → amber (caution)
- Used in RecordGameForm (team summary) and CourtsManager (court cards)

### RecordGameForm A/B Button Logic
- `handleAssign(playerId, "A" | "B")`: Toggle player on/off team. If already on opposite team, moves them.
- `teamAFull` / `teamBFull` derived booleans (length >= 2) disable corresponding buttons
- Player picker uses internal scroll (`max-h-[45vh] overflow-y-auto`) to maintain zero-scroll console
- Sticky Record button at bottom with `bg-gradient-to-t from-white` fade

### Courts Mode suggestCourtsAction (courts.ts)
- Hybrid: Fetches data server-side (courts, active players, games, pair counts)
- Excludes players on IN_PROGRESS courts from available pool
- Runs `suggestForCourts()` algorithm in TypeScript
- Persists result via `assign_courts` RPC
- Returns error if not enough players or no open courts

---

## The Design Back-Burner (Deferred / V2)

### UX Enhancements
- Animated leaderboard row reordering / rank change arrows
- Player avatar colors
- Session summary card (MVP, highlights)
- Shareable leaderboard link
- Dark mode (night court)
- Loading skeleton states / Suspense boundaries
- Real-time updates via Supabase Realtime (currently requires page refresh)
- Optimistic UI after recording a game (currently relies on `redirect()` and re-render)

### Intelligence Features
- Elo delta display per game in game history
- Matchup stats (head-to-head record)
- Best teammate stats
- Streak tracking (win/loss streaks)
- Rating history graph over time
- Opponent pairing feedback (currently only partner counts)

### Structural Extensions
- Player join/leave mid-session tracking
- Player deactivation/archival UI
- Admin role (currently anyone can do everything)
- Group creation UI (currently manual via Supabase dashboard)
- PWA / install prompt for courtside use
- Offline score entry with sync

---

## The Technical Debt Confession

### Database
- **schema.sql is stale**: Only reflects ~M6 state. M7-M9 function bodies live only in migration files. Should be rewritten to be fully self-contained. (File: `supabase/schema.sql`)
- **No automated SQL tests**: RPC correctness relies on manual QA only
- **Hardcoded 4-player-per-game**: record_game assumes exactly 2v2 (files: `m7.0_record_game_for_update.sql`, `games.ts`, `courts.ts`)
- **No player_ratings cleanup on void**: If a void causes games_rated to go to 0, the player_ratings row still exists at whatever rating it landed on (file: `m7.3_void_game.sql`)
- **vw_games_missing_ratings uses `created_at`**: The reconciliation view uses `rating_events.created_at` for the Elo boundary, while `recompute_session_ratings` correctly uses `played_at`. Minor inconsistency. (File: `m7.3_void_game.sql`)

### Frontend
- **No global error boundary**: RPC failures show raw error strings (all page.tsx files)
- **No centralized design tokens**: Colors/spacing are ad-hoc Tailwind classes scattered across files
- **Range query param parsing**: Simplistic string match on leaderboard (file: `leaderboard/page.tsx`)
- **Courts Mode force=true**: Courts Mode skips duplicate detection entirely by passing `force: true` (file: `CourtsManager.tsx`)
- **No loading states**: Server Components block render; no Suspense boundaries or skeletons
- **Pair lookup is linear scan**: `getMatchupCount()` iterates all games. `getPairCount()` uses `.find()` on pairCounts array. Fine for ≤20 players but could be Map-based. (Files: `pairingFeedback.ts`, `RecordGameForm.tsx`, `CourtsManager.tsx`)
- **SessionStandings.tsx and PairingBalance.tsx are orphaned on the live session page**: Still in the codebase but not rendered on the active session view (removed during Live Referee Console refactor). They're only reachable via the Standings → link. Consider cleaning up or explicitly wiring to a /standings route.
- **CourtsManager.tsx is 1073 lines**: Largest single file. Would benefit from decomposition (court cards, waiting pool, controls as separate components).
- **Client-side voided game filtering**: GamesList and EndedSessionGames filter voided games client-side from already-fetched data. Server-side optimization (exclude voided rows from query when toggle is OFF) is planned tech debt for large sessions.

### Server Actions
- **No rate limiting**: Any client can spam recordGameAction (files: `games.ts`, `sessions.ts`, `courts.ts`)

### Hardcoded Magic Numbers
| Value | Where | What |
|-------|-------|------|
| `11` | `games.ts:58`, `courts.ts:214`, `RecordGameForm.tsx` | Minimum winning score |
| `2` | `games.ts:61`, `courts.ts:220` | Minimum winning margin |
| `4` | `autoSuggest.ts:132,151`, `courts.ts:133` | Players per court |
| `3` | `autoSuggest.ts:65` | Possible 2v2 splits per court |
| `24 * 60 * 60 * 1000` | `page.tsx:123` (session) | Stale session threshold (24h) |
| `15` minutes | `games.ts:16,128` | Duplicate detection window |
| `1200` | `m6_elo_v1.sql` | Default Elo rating |
| `40` / `20` | `m6_elo_v1.sql` | K-factor (provisional / established) |
| `5` | `m6_elo_v1.sql` | Provisional threshold (games_rated) |

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
**Files:** `src/app/actions/games.ts`, `src/app/actions/courts.ts`

### 3. FK join returns single object OR array depending on Supabase version
**Cause:** Supabase PostgREST can return `{code: "X"}` or `[{code: "X"}]` for FK joins.
**Fix:** `one()` helper in `src/lib/supabase/helpers.ts` normalizes both shapes.
**Gotcha:** Always use `one()` when accessing FK join results, never assume shape.

### 4. ESLint blocks Vercel build on unused variables
**Cause:** Next.js build runs ESLint in CI; unused vars = build failure.
**Fix:** Remove unused imports/variables before pushing. Always run `npm run build` locally.
**Recurring:** This happened multiple times — after removing `ratings` prop from CourtsManager, after removing `playerName` from RecordGameForm.

### 5. Elo recompute was session-scoped (incorrect)
**Cause:** Original recompute_session_ratings only reversed/replayed within the voided session. Games in later sessions had stale deltas.
**Fix:** Forward-replay from `t0` across ALL group sessions. Use `played_at` not `created_at` as boundary.
**File:** `supabase/migrations/m7.3_void_game.sql`
**Gotcha:** Recompute is group-wide, not session-scoped. This is intentional.

### 6. ModeToggle localStorage mismatch
**Cause:** Original ModeToggle used localStorage to persist mode. Navigating to Courts page set localStorage to "courts", then navigating back to Manual page read "courts" on mount before hydration corrected it — causing a flash of wrong state.
**Fix:** Complete rewrite to be **stateless**: accepts `mode` prop from server component, uses `<Link>` for navigation. Route is the single source of truth. No localStorage, no useState.
**File:** `src/app/g/[join_code]/session/[session_id]/ModeToggle.tsx`
**Gotcha:** Never use localStorage for visual state that should be derived from the URL.

### 7. Uncommitted changes not showing on Vercel
**Cause:** RecordGameForm was rewritten with A/B buttons locally but never committed. Push to Vercel showed old code.
**Fix:** Always check `git status` before pushing. Files written by Claude Code are not auto-staged.

---

## Claude Code Execution Plan (Next 3 Steps)

1. **Deploy v0.4.2 to production** — Merge `dev` into `main`, push. Verify Vercel builds clean. Run m10.2 migration on production Supabase.

2. **Rewrite `supabase/schema.sql` to be fully self-contained** — Currently stale at ~M6. Should include all tables (including session_courts, session_players with status, games.undo_expires_at), all 22 RPC function bodies (M7-M10.2), updated views, indexes.

3. **Decompose CourtsManager.tsx** — At 1073 lines it's the largest file. Extract CourtCard, WaitingPool, SlotPickerSheet, and CourtsControlBar into separate client components. Keep shared state in CourtsManager as the orchestrator.

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
- Color scheme: emerald (primary/active), blue (Team A), orange (Team B), red/amber (destructive), gray (neutral)
- Root layout owns `<main>` element; pages use `<div>` to avoid nested `<main>` tags
- `min-h-dvh` on body (not `min-h-screen`) for proper mobile viewport handling
- Route as source of truth for visual state — never localStorage for UI mode
- Only Record Game button uses filled green style; all other buttons are outline-only
- Live session header pattern: back arrow → group name + End pill → LIVE dot indicator → ModeToggle → content
- First names derived via `displayName.substring(0, displayName.indexOf(" "))` with fallback to full name
- Winner highlighting: emerald-600 for winning team/score, neutral gray for losing (never red)
- All time formatting routed through `src/lib/datetime.ts` — no direct `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` calls in UI code

### TypeScript
- `camelCase` for variables/functions, `PascalCase` for types/components
- Centralized types in `src/lib/types.ts`
- RPC names in `src/lib/supabase/rpc.ts` as `const` object (20 constants)
- Server actions in `src/app/actions/` with `"use server"` directive
- Path alias: `@/` maps to `src/`

### Folder Structure
```
src/
  app/
    actions/          # Server actions (sessions.ts, players.ts, games.ts, courts.ts)
    g/[join_code]/    # Group routes (dynamic)
      session/[session_id]/
        courts/       # Courts Mode sub-route
        games/        # Session game log
      start/          # Start session
      players/new/    # Add player
      sessions/       # Session history
      leaderboard/    # Group leaderboard
    help/             # Static help page
    changelog_public/ # Rendered markdown changelog
  lib/
    supabase/         # Supabase clients + helpers + RPC constants
    components/       # Shared presentational components (PlayerStatsRow)
    *.ts              # Pure utility functions (types, env, formatting, suggestCode, autoSuggest, pairingFeedback)
supabase/
  schema.sql          # Canonical DB reference (STALE at ~M6)
  migrations/         # Ordered SQL migrations (m0 → m10.1)
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

-- Session courts table exists
SELECT column_name FROM information_schema.columns WHERE table_name = 'session_courts';

-- All 20 RPCs exist
SELECT proname FROM pg_proc WHERE proname IN (
  'record_game', 'void_last_game', 'recompute_session_ratings',
  'reconcile_missing_ratings', 'create_session', 'end_session',
  'apply_ratings_for_game', 'get_session_stats', 'get_group_stats',
  'get_last_session_id', 'get_session_pair_counts',
  'init_courts', 'assign_courts', 'start_court_game',
  'record_court_game', 'update_court_assignment', 'clear_court_slot',
  'mark_player_out', 'make_player_active', 'update_court_count'
);

-- Partial unique index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_one_active_session_per_group';

-- Elo reconciliation check (should be 0 if all healthy)
SELECT COUNT(*) FROM public.vw_games_missing_ratings;
```

### Manual QA Checklist
- [ ] Home page → enter group code → lands on dashboard
- [ ] Start session with 4+ players → session page renders
- [ ] Live session shows LIVE indicator, ModeToggle ("Select teams directly"), RecordGameForm
- [ ] Each player row has A and B buttons for direct team assignment
- [ ] Record game → last-game ticker updates (emerald dot + LAST pill + score + teams)
- [ ] "All games →" link opens game log with first names and winner highlighting
- [ ] Voided games show rose badge, muted opacity in game log
- [ ] Duplicate detection → record same game within 15 min → amber warning
- [ ] Void last game → ticker and standings update correctly
- [ ] ModeToggle → tap Courts → navigates to /courts, shows "Manage multi-court rotation"
- [ ] Courts Mode → Suggest All fills courts, controls above court cards
- [ ] Courts Mode → waiting pool chips → tap → slot picker bottom sheet
- [ ] Courts Mode → record from court → score validation works
- [ ] End session → session shows "Ended" badge, form disappears, game list shown
- [ ] Leaderboard → all-time / 30-day / last-session tabs work
- [ ] Footer shows `v0.4.2`, "Changes" link goes to /changelog_public
- [ ] Stale banner appears for sessions with no games in 24+ hours
- [ ] Record game → undo snackbar appears with 8s countdown, undo works
- [ ] Pre-submit preview shows winner chip (green) + loser chip (amber)
- [ ] Tied/incomplete scores → neutral gray chips, no Winner/Loser labels
- [ ] All timestamps display in Central Time (no UTC offset)
- [ ] Voided games hidden by default in session game list + All Games page

---

## Logic Guardrails (Do NOT Change)

1. **`dedupe_key` generation in record_game**: Order-invariant SHA-256 of sorted teams + min:max score. No time bucket. Changing this breaks duplicate detection for all existing games.

2. **`search_path = public, extensions`** on record_game: Required for pgcrypto's `DIGEST()` on Supabase. Removing `extensions` breaks game recording.

3. **`one()` helper for FK joins** (`src/lib/supabase/helpers.ts`): Supabase returns single objects or arrays depending on version. All FK join access must go through `one()`.

4. **`Promise.resolve()` wrapper around Supabase `.rpc()` for fire-and-forget**: Supabase returns PromiseLike without `.catch()`. The wrapper is required. (Files: `games.ts`, `courts.ts`)

5. **Immutable game model + soft-delete**: Games are NEVER physically deleted. `voided_at` is the only mechanism. `vw_player_game_stats` and `get_session_pair_counts` filter by `voided_at IS NULL`.

6. **Elo recompute replays from `t0` across ALL group sessions**: Not just the voided session. This is intentional — later games' deltas depend on prior ratings. Scoping to one session would leave stale deltas.

7. **Leaderboard deterministic ordering**: Last Session: `win_pct DESC, point_diff DESC, rdr DESC NULLS LAST, display_name ASC`. All-Time/30-Day (rdr mode): `rdr DESC NULLS LAST, win_pct DESC, point_diff DESC, display_name ASC`. Server-side only — no client re-sorting.

8. **Root layout owns `<main>`, pages use `<div>`**: Prevents nested `<main>` elements. Pages that need vertical centering use `flex-1`. Content pages use plain `flex flex-col`.

9. **Pair key canonicalization**: `a < b ? "${a}:${b}" : "${b}:${a}"` — used in autoSuggest.ts, pairingFeedback.ts, RecordGameForm.tsx, and CourtsManager.tsx. Must match for pair lookups to work.

10. **ModeToggle is stateless — route is source of truth**: The `mode` prop comes from the server component based on which page is rendered. Never introduce client state or localStorage for this. Using `<Link>` for navigation is intentional — it avoids full-page reloads while keeping the URL as the single source of truth.

11. **Session stale detection is UI-only (24h threshold)**: The StaleBanner does NOT auto-end sessions or block scoring. It's a suggestion. The 4-hour server-side session expiry was removed in m9.0. Sessions now stay active indefinitely until manually ended.

12. **RecordGameForm `pb-20` padding**: The `pb-20` on the scroll container prevents the sticky Record button from covering the last player rows. Removing it breaks usability.

---

## External Dependencies

### Supabase (PostgreSQL + REST)
- `NEXT_PUBLIC_SUPABASE_URL` — Project URL (browser-safe)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon/public key (browser-safe, subject to RLS)
- `NEXT_PUBLIC_APP_VERSION` — Auto-injected from package.json at build time, displayed in global footer

### Vercel
- Hosting via Next.js preset
- Production: deploys from `main` branch
- Preview: deploys from all other branches (e.g., `dev`)
- No custom build commands — uses default `npm run build`
- Branch preview URLs are stable (e.g., `red-dog-pickle-git-dev-mamdanis-projects.vercel.app`)

### pgcrypto Extension
- Required for `DIGEST()` / `ENCODE()` in record_game fingerprinting
- Lives in `extensions` schema on Supabase (not `public`)
- Must be enabled in Supabase dashboard (Extensions → pgcrypto)

### NPM Dependencies (Production)
- `next@15.1.11` — Framework
- `react@^19.0.0` / `react-dom@^19.0.0` — UI
- `@supabase/supabase-js@^2.49.1` — Database client
- `marked@^17.0.3` — Markdown parser for changelog page

### No Other External APIs
- No auth providers
- No third-party APIs
- No CDNs for assets
- `@vercel/analytics` included for basic page-view analytics

---

## RPC Function Reference (22 functions)

### Core (13 functions)
| RPC Name | Security | Params | Returns | Purpose |
|----------|----------|--------|---------|---------|
| `create_session` | INVOKER | `(group_join_code text, player_ids uuid[])` | `uuid` | Create session + attendance. Idempotent on concurrent calls |
| `end_session` | DEFINER | `(p_session_id uuid)` | `void` | Sets ended_at + closed_reason='manual' |
| `record_game` | DEFINER | `(p_session_id, p_team_a_ids[], p_team_b_ids[], p_team_a_score, p_team_b_score, p_force)` | `jsonb` | Atomic game recording with dedup. FOR UPDATE lock |
| `get_session_stats` | INVOKER | `(p_session_id uuid)` | `TABLE(11 cols incl rdr)` | Session leaderboard. Sorted: win_pct → point_diff → rdr → name |
| `get_group_stats` | INVOKER | `(p_join_code text, p_days int?, p_sort_by text?)` | `TABLE(11 cols incl rdr)` | Group leaderboard. p_sort_by='rdr': rdr → win_pct → point_diff → name |
| `get_last_session_id` | INVOKER | `(p_join_code text)` | `uuid` | Most recently ended session |
| `get_session_pair_counts` | INVOKER | `(p_session_id uuid)` | `TABLE(5 cols)` | All attendee pairs + partner count |
| `apply_ratings_for_game` | DEFINER | `(p_game_id uuid)` | `void` | Idempotent Elo update for one game |
| `reconcile_missing_ratings` | DEFINER | `()` | `integer` | Backfill missing Elo ratings across all groups |
| `set_session_rules` | DEFINER | `(p_session_id uuid, p_target_points int, p_win_by int)` | `jsonb` | Update session-level game rule defaults |
| `void_last_game` | DEFINER | `(p_session_id uuid)` | `jsonb` | Soft-delete most recent game + LIFO rating reversal via game_rdr_deltas |
| `undo_game` | DEFINER | `(p_game_id uuid)` | `jsonb` | 8s undo window: FOR UPDATE lock, validates not voided + undo_expires_at >= now() + session not ended, reverses ALL deltas, marks voided with void_reason='undo' |
| `recompute_session_ratings` | DEFINER | `(p_session_id uuid)` | `integer` | Forward-replay Elo from earliest affected game (legacy, not called) |

### Courts Mode V2 (9 functions)
| RPC Name | Security | Params | Returns | Purpose |
|----------|----------|--------|---------|---------|
| `init_courts` | DEFINER | `(p_session_id, p_join_code, p_court_count)` | `jsonb` | Create initial court slots for session |
| `assign_courts` | DEFINER | `(p_session_id, p_join_code, p_assignments jsonb)` | `jsonb` | Batch-assign players to courts (from algorithm) |
| `start_court_game` | DEFINER | `(p_session_id, p_join_code, p_court_number)` | `jsonb` | OPEN → IN_PROGRESS transition |
| `record_court_game` | DEFINER | `(p_session_id, p_join_code, p_court_number, scores, p_force)` | `jsonb` | Record game from court, reset to OPEN |
| `update_court_assignment` | DEFINER | `(p_session_id, p_join_code, p_court_number, p_team, p_slot, p_player_id)` | `jsonb` | Assign single player to specific slot |
| `clear_court_slot` | DEFINER | `(p_session_id, p_join_code, p_court_number, p_team, p_slot)` | `jsonb` | Clear one slot on OPEN court |
| `mark_player_out` | DEFINER | `(p_session_id, p_join_code, p_player_id, p_mode)` | `jsonb` | Mark inactive (immediate or after_game) |
| `make_player_active` | DEFINER | `(p_session_id, p_join_code, p_player_id)` | `jsonb` | Restore inactive player |
| `update_court_count` | DEFINER | `(p_session_id, p_join_code, p_court_count)` | `jsonb` | Add/remove empty courts |

---

## Database Tables (10 tables)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `groups` | id, name, join_code | join_code: lowercase alphanumeric + hyphens, unique |
| `players` | id, group_id, display_name, code, is_active | code: uppercase, unique per group |
| `sessions` | id, group_id, name, started_at, ended_at, closed_reason | Partial unique: one active per group |
| `session_players` | session_id, player_id, **status**, inactive_effective_after_game | Status: ACTIVE or INACTIVE. Added in m8.0 |
| `games` | id, session_id, sequence_num, scores, dedupe_key, voided_at, undo_expires_at | Immutable, soft-delete only. `undo_expires_at` for 8s undo window |
| `game_players` | game_id, player_id, team ('A'/'B') | 4 rows per game |
| `player_ratings` | group_id, player_id, rating, games_rated, provisional | Elo state |
| `rating_events` | game_id, player_id, pre/post_rating, delta, algo_version | Elo audit log, idempotent via UNIQUE |
| `session_courts` | id, session_id, court_number, status, team_a_ids, team_b_ids | Added in m8.0. Status: OPEN or IN_PROGRESS |
| `game_rdr_deltas` | game_id, player_id, group_id, delta, rdr_before, rdr_after, games_before, games_after, voided_at | Added in m10.0. Audit trail for rating-correct LIFO void |

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
| M7 | `ab55473` | Void Last Game, Courts Mode v1, Help page, data integrity |
| M8+M9 | `3dfb433` | Courts Mode V2 (full rewrite), remove 4-hour session expiry |
| v0.3.0 patches | `2b2caff`→`4749ea6` | ESLint fixes, Elo recompute, pgcrypto, footer, changelog route, inline pairing feedback |
| v0.3.1 — Live Referee Console | `3de91e4`→`a0d0c37` | Session page restructure, explicit A/B buttons, ModeToggle, last-game ticker, games page, courts controls reorder, minimalism audit, version bump |
| v0.4.0 — RDR + Rebrand | `70a1362`→`ba16970` | RDR v1 (atomic ratings, MOV, partner gap, LIFO void), session-level game rules, tier badges, leaderboard sorting fix (all 3 views), full rebrand (Red Dog, logo, favicon, help page rewrite) |
| v0.4.1 — Polish | `1ac8aeb`→`2807d75` | Horizontal logo on group dashboard, env-based absolute OG image URLs (`NEXT_PUBLIC_SITE_URL`), tier rename, homepage + group subtitle copy updates |
| M10.2 — Undo Window | `9d5b8ca` | 8-second server-enforced undo window, hide voided games toggle, undo snackbar with countdown, debounced refresh, pre-submit confirmation summary |
| v0.4.2 — Preview + TZ | `7d5060c`→`3cf44e8` | Winner/loser preview chips (emerald/amber), central timezone formatter (`datetime.ts`) pinned to America/Chicago, all `toLocale*` calls eliminated |

---

*End of MEMORY snapshot.*
