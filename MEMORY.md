# MEMORY.md — Red Dog

> Last updated: 2026-03-19 — v0.7.0

---

## Current Project DNA

### App Purpose
Red Dog is a **mobile-first pickleball stats tracker** for live courtside scoring.
- Record doubles games in <12 seconds
- No login required (trust-based group access via join_code)
- Immutable game history (soft-delete only via voided_at)
- Cross-device duplicate prevention (SHA-256 fingerprint, 15-min window)
- Session + group leaderboards with RDR v2 (Red Dog Rating) — confidence-based system with rating deviation, inactivity inflation, volatility multipliers, reacclimation buffer, and partner gap dampener
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
**v0.7.0 — RDR v2: Confidence-Based Rating System.**

v0.7.0: RDR v2 replaces binary K-factor with confidence-based volatility. Rating deviation (RD) tracks uncertainty per player. Continuous inactivity inflation via logarithmic curve (14-day grace, capped at 50). Volatility multiplier `clamp(eff_rd/80, 0.85, 1.60)` replaces K=60/22. Reacclimation buffer (3 games, 60-day trigger, 5-game minimum) dampens first-game whiplash on return. Informative RD recovery based on opponent confidence and game closeness. Tiered margin factor (0.95/1.00/1.08/1.10) replaces ln-based MOV. Uniform ±32 clamping. Confidence labels in UI: Locked In / Active / Rusty / Returning. Delta logging extended with `rd_before/after`, `effective_rd_before`, `vol_multiplier`, `reacclimation_before/after`, `last_played_before/after`. Migration `m15.0_rdr_v2.sql`. All leaderboard and session pages updated.

v0.6.0: GOAT badge system — Reigning GOAT (👑 highest current RDR, 20+ games, Elite tier) and All-Time GOAT (highest peak RDR, 50+ games). Badges shown on All-time leaderboard tab only. Gold gradient pill with glow for Reigning GOAT, outlined gold pill for All-Time. GOAT row gets gold-tinted border + background. Deterministic tiebreaker chains (no ties). Peak rating tracked atomically in `record_game`, targeted peak repair on void/undo. Pure logic module `src/lib/goat.ts` (22 tests). Tier renames: Walk-On/Challenger/Contender/All-Star/Elite. Migration `m14.0_goat_peak_rating.sql`. Both `/g/` and `/v/` leaderboards updated.

v0.5.1 (Phase 1): Sport abstraction layer (`SportConfig` interface, `getSportConfig()` registry). All pickleball-specific logic centralized in `src/lib/sports/pickleball.ts` — target presets, team sizes, court limits, validation, outcome derivation, rating inputs. Shared pure validators (`validators.ts`) used by both server actions and client components. DB migration adds `sport` column to `groups` table. Server actions fetch `group.sport` via joined query and validate through `sportConfig`. UI components receive serializable sport props (no function serialization). Deprecated `scoring.ts` removed — all callers migrated. Shared utilities: `pairKey()` deduplicated, `transformGameRecords()` centralized, `handleServerError()` structured logging, `constants/shared.ts` for app-wide timing constants. Vitest test infrastructure: 160 tests across 15 files covering scoring parity, server action validation, UI component behavior, and transformation backward compatibility. `robots.txt` blocks all crawling.

v0.5.0: Suspicious score warning (overtime margin > 2 triggers amber confirmation in both Manual and Courts mode). End Session button + footer nav (All Games, Standings) added to Courts Mode for parity with Manual. Context-aware leaderboard back nav via `from` query param. Leaderboard "Last Session" mode gains Previous/Next session browsing via `session_id` param. Ended session detail has Games/Standings tab toggle (reuses `get_session_stats` RPC + `PlayerStatsRow`). Game cards unified: `EndedSessionGames` rewritten to match `GamesList` layout. Player names now "first name + last initial" format. Win-by removed from UI (m12.0 migration relaxes DB validation). All changes mirrored in `/v/` view-only routes.

v0.4.3: View-only access codes — `/v/[view_code]` read-only route tree (5 pages), `ensure_view_code` RPC, auto-generate on dashboard load, "Copy view-only link" button. Defense-in-depth `AccessMode` guard on all write actions. Vercel Analytics `<Analytics />` in root layout. Security fix: removed `join_code` exposure from all `/v/` pages.
v0.4.2: Winner/loser preview chips replace "def." sentence summary. Central timezone formatter (`src/lib/datetime.ts`) pins all displayed times to America/Chicago.
M10.2: 8-second undo window (server-enforced via `undo_expires_at`), hide voided games by default (client-side toggle), undo snackbar with countdown, debounced refresh.
v0.4.1 patch: Group dashboard horizontal logo, env-based OG URLs (`NEXT_PUBLIC_SITE_URL`), tier rename (Observer/Practitioner/Strategist/Authority/Architect), homepage + group subtitle copy updates.
v0.4.0 base: Red Dog Rating (RDR) replaces Elo. Session-level game rules (11/15/21). Rating-correct LIFO void. Cosmetic tier badges. Server-side leaderboard sorting by RDR (all 3 views). Full rebrand: product renamed to "Red Dog", logo + favicon + help page rewrite.

---

## The "Source of Truth" (State of Code)

### Git State
- **Branch:** `dev` is 4 commits ahead of `main` (Phase 1 work)
- **Tag:** `v0.4.0-rc1` on dev as rollback point
- **Version:** `0.7.0` (package.json → footer via next.config.ts, changelog)
- **Remote:** `origin` → `https://github.com/Crestover/RedDogPickle.git`
- **Vercel prod:** deploys from `main`
- **Vercel preview:** deploys from `dev`
- **Pending migration:** `m15.0_rdr_v2.sql` (RD columns, backfill, RPC updates for confidence-based rating system) must be applied to Supabase before deploy

### Environments
| Environment | Vercel Branch | Supabase Instance | Status |
|-------------|---------------|-------------------|--------|
| Production  | `main`        | Production        | v0.5.0 (pushed, pending m12.0 migration) |
| Dev/Preview | `dev`         | Dev               | v0.7.0 (RDR v2 confidence system, pending m15.0 migration) |

### Complete File Map

#### Root Config
| File | Role |
|------|------|
| `package.json` | v0.5.0, deps: next 15.1.11, react 19, @supabase/supabase-js 2.49.1, marked 17.0.3, @vercel/analytics. devDeps: vitest, @vitejs/plugin-react, @testing-library/react, @testing-library/jest-dom, jsdom. Scripts: dev/build/start/lint/type-check/test/test:watch |
| `vitest.config.ts` | Vitest config: `@vitejs/plugin-react`, jsdom environment, `@/` alias, setup file `src/test-setup.ts` |
| `public/robots.txt` | Blocks all crawling: `User-agent: * / Disallow: /` |
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
| `layout.tsx` | Server | Root layout: `min-h-dvh` body, `<Analytics />` from `@vercel/analytics/next`, `<main className="flex-1">`, global footer. Metadata: title "Red Dog", icons (SVG + ICO + Apple). `siteUrl` from `NEXT_PUBLIC_SITE_URL` env var. OG/Twitter with explicitly absolute image URLs via `new URL()`. `alternates.canonical`. |
| `page.tsx` | Client | Home: Red Dog logo (623px source at 160px), tagline "A proper record for a plastic ball.", group code entry form |
| `help/page.tsx` | Server | Help page: Red Dog mark, RDR explainer, Manual vs Courts, Voids & Rating Integrity, FAQ |
| `changelog_public/page.tsx` | Server | Renders CHANGELOG_PUBLIC.md as styled HTML via `marked` |
| `g/[join_code]/page.tsx` | Server | Group dashboard: horizontal Red Dog logo (125px), subtitle "Statistically unnecessary. Socially unavoidable.", group name + join_code display, active session detection, Start/Continue/Leaderboard/Sessions links. Auto-generates `view_code` via `ensure_view_code` RPC on first load. Falls back to view_code redirect if join_code not found. Includes `<CopyViewLink>` in secondary nav. |
| `g/[join_code]/CopyViewLink.tsx` | Client | Copies `{NEXT_PUBLIC_SITE_URL}/v/{viewCode}` to clipboard. Shows "📋 Copy view-only link" / "Copied!" with 1.5s timeout. |
| `g/[join_code]/start/page.tsx` | Server | Start session page: wraps StartSessionForm |
| `g/[join_code]/start/StartSessionForm.tsx` | Client | Player selection with live search, min 4 required |
| `g/[join_code]/players/new/page.tsx` | Server | Add player page: wraps AddPlayerForm |
| `g/[join_code]/players/new/AddPlayerForm.tsx` | Client | Name + code input with auto-suggest code from name |
| `g/[join_code]/sessions/page.tsx` | Server | Session history list with active/ended badges |
| `g/[join_code]/leaderboard/page.tsx` | Server | Leaderboard: all-time / 30-day / last-session toggle via URL query params. `from` param for context-aware back nav. `session_id` param for session browsing in Last Session mode with Previous/Next arrows. Computes GOAT designations on All-time view via `getGoatResult()`, passes `isReigningGoat`/`isAllTimeGoat` flags to `PlayerStatsRow`. |
| `g/[join_code]/session/[session_id]/page.tsx` | Server | **Live Referee Console**: LIVE header, ModeToggle(manual), StaleBanner, RecordGameForm, VoidLastGame, last-game ticker, "All games →" / "Standings →" footer nav. Ended sessions have Games/Standings tab toggle (`tab` query param); Standings tab fetches `get_session_stats` RPC + `player_ratings`, renders `PlayerStatsRow`. |
| `g/[join_code]/session/[session_id]/ModeToggle.tsx` | Client | Segmented Manual/Courts toggle. **Stateless** — `mode` prop from route is source of truth, uses `<Link>`. Renders contextual subtitle ("Select teams directly" / "Manage multi-court rotation"). |
| `g/[join_code]/session/[session_id]/RecordGameForm.tsx` | Client | **Explicit per-row A/B buttons**. Receives `sportConfig: { targetPresets, playersPerTeam }` prop — no hardcoded sport constants. Uses shared `validateScores()`, `isSuspiciousScore()`, `isShutout()`, `deriveOutcome()` from `@/lib/sports/validators`. Internal scroll (`max-h-[45vh]`), sticky Record button with gradient fade, `pb-20` padding guardrail. Inline pairing feedback (dot severity). **M10.2**: Undo snackbar (8s countdown, LIFO queue), debounced refresh (1000ms). **v0.4.2**: Two-chip winner/loser preview (emerald/amber). **v0.5.0**: Suspicious score warning (`scoreWarningArmed` state, amber "Cancel"/"Record anyway" confirmation). |
| `g/[join_code]/session/[session_id]/EndSessionButton.tsx` | Client | 2-tap confirm (red) for ending session |
| `g/[join_code]/session/[session_id]/VoidLastGameButton.tsx` | Client | 2-tap confirm (amber) for voiding last game. Accepts `redirectPath` prop |
| `g/[join_code]/session/[session_id]/StaleBanner.tsx` | Client | Amber banner when session has no games for 24+ hours. Resume / Start New / End options |
| `g/[join_code]/session/[session_id]/SessionStandings.tsx` | Client | Collapsible standings table (NOT used on live session page — only via Standings → link) |
| `g/[join_code]/session/[session_id]/PairingBalance.tsx` | Server | Pair game counts sorted fewest first (NOT used on live session page) |
| `g/[join_code]/session/[session_id]/EndedSessionGames.tsx` | Client | Game list for ended sessions with voided toggle (default OFF). Uses `deriveOutcome()` from `@/lib/sports/validators` for winner highlighting. Matches `GamesList.tsx` card layout: score-dash-score with emerald winner, team short names ("Joe S.") underneath. |
| `g/[join_code]/session/[session_id]/games/GamesList.tsx` | Client | Session game log with `showVoided` toggle (default OFF). Uses `deriveOutcome()` from `@/lib/sports/validators` for winner highlighting. Client-side voided filtering. Winner highlighting (emerald-600), voided games (reduced opacity + badge). Player names as "first name + last initial" via `shortName()`. |
| `g/[join_code]/session/[session_id]/games/page.tsx` | Server | **Session game log**: Wraps `<GamesList>` component. First-name display, winner highlighting. |
| `g/[join_code]/session/[session_id]/courts/page.tsx` | Server | Courts Mode wrapper: LIVE header with "Courts" label, ModeToggle(courts), EndSessionButton, CourtsManager or CourtsSetup. Footer nav: "All games →" + "Standings →" links (matching manual mode). |
| `g/[join_code]/session/[session_id]/courts/CourtsManager.tsx` | Client | Full courts UI (1073+ lines). Receives `sportConfig: { targetPresets, playersPerTeam, maxCourts }` prop. Uses shared `isSuspiciousScore()` from `@/lib/sports/validators`. Global controls ABOVE court cards (Row 1: Courts ±count + Void; Row 2: Suggest All). Court cards, fairness summary, horizontal-scroll waiting chips with slot picker bottom sheet, On Court list, Inactive list. Inline pairing feedback in court cards. **v0.5.0**: Per-court suspicious score warning (`courtScoreWarnings` state). |
| `g/[join_code]/session/[session_id]/courts/CourtsSetup.tsx` | Client | Initial court count selection. Receives `sportConfig: { playersPerCourt, maxCourts }` prop — no hardcoded 4/8 constants |
| `v/[view_code]/page.tsx` | Server | **View-only dashboard**: Red Dog logo, group name display (with "Red Dog Group" fallback), "View-only link" label, active session banner, View Session + Leaderboard links, Session history link. No write CTAs. `join_code` pruned from `.select()` — never fetched or rendered. |
| `v/[view_code]/leaderboard/page.tsx` | Server | **View-only leaderboard**: Same data as `/g/` (3 range modes via `?range=`), `PlayerStatsRow`, ratings. Session browsing via `session_id` param with Previous/Next arrows. No "Start a Session" CTA. `join_code` kept in `.select()` for server-only RPC params (never rendered in JSX). Computes GOAT designations on All-time view. |
| `v/[view_code]/sessions/page.tsx` | Server | **View-only session history**: Session list with active/ended badges. Links to `/v/` session detail. No "Start First Session" CTA. `join_code` pruned from `.select()`. |
| `v/[view_code]/session/[session_id]/page.tsx` | Server | **View-only session detail**: Active (LIVE badge + "View-only" + last-game ticker + `EndedSessionGames`) and ended layouts with Games/Standings tab toggle. Mismatch protection: verifies session belongs to group. No write components. `join_code` pruned from `.select()`. |
| `v/[view_code]/session/[session_id]/games/page.tsx` | Server | **View-only games list**: Wraps `<GamesList>` (already read-only). Back link to `/v/` session. `join_code` pruned from `.select()`. |

#### `src/app/actions/` — Server Actions
| File | Role |
|------|------|
| `access.ts` | `AccessMode = "full" \| "view"` type + `requireFullAccess(mode)` guard. All write actions take `mode` as first param and call this at the top. Safety net against accidental write component reuse in `/v/`. |
| `sessions.ts` | `createSessionAction`, `endSessionAction`, `endAndCreateSessionAction`, `setSessionRulesAction` — all take `mode: AccessMode` as first param |
| `players.ts` | `addPlayerAction` with `safeRedirect()` open-redirect prevention |
| `games.ts` | `recordGameAction` (fetches `group.sport` via joined query, validates through `sportConfig.validateScores()`, returns success+deltas+undoExpiresAt), `voidLastGameAction` (atomic delta reversal), `undoGameAction` (8s undo window) — all take `mode: AccessMode` as first param. Uses `handleServerError` for structured logging |
| `courts.ts` | 9 actions: `initCourtsAction`, `suggestCourtsAction`, `startCourtGameAction`, `recordCourtGameAction` (validates through `sportConfig`), `assignCourtSlotAction`, `clearCourtSlotAction`, `markPlayerOutAction`, `makePlayerActiveAction`, `updateCourtCountAction` — all take `mode: AccessMode` as first param. Uses `transformGameRecords` for game data normalization |

#### `src/lib/` — Shared Utilities
| File | Role |
|------|------|
| `types.ts` | Interfaces: PlayerStats, PairCount, Player, Group (includes `sport: Sport`), PlayerRating (includes `peak_rating`, `peak_rating_achieved_at`, `updated_at`), Session, CourtData, AttendeeWithStatus, RpcResult<T>. Type: `Sport = "pickleball" \| "padel"` |
| `env.ts` | Environment variable validation (NEXT_PUBLIC_SUPABASE_URL, _ANON_KEY, optional NEXT_PUBLIC_SITE_URL) |
| `datetime.ts` | Central timezone formatter: `APP_TIME_ZONE = "America/Chicago"`, `formatTime()`, `formatDate()`, `formatDateTime()`, `formatDateString()`. All UI time formatting must route through this file. Uses `Intl.DateTimeFormat` with explicit `timeZone`. |
| `formatting.ts` | `formatDiff()` — formats numeric with +/- sign. `shortName()` — "first name + last initial" format |
| `suggestCode.ts` | `suggestCode()` — derive player code from display name (JD, BOB, etc.) |
| `autoSuggest.ts` | Court assignment algorithm: `suggestForCourts()`. Types: GameRecord, CourtAssignment, PairCountEntry. Helpers: `buildPairMap()`, `teamPenalty()`. Imports `pairKey` from `@/lib/pairing` |
| `pairing.ts` | `pairKey(a, b)` — canonical player pair key (sorted, joined). Shared by autoSuggest + pairingFeedback |
| `pairingFeedback.ts` | `matchupKey()`, `getMatchupCount()`, `severityDotClass()`. Shared by RecordGameForm + CourtsManager. Imports `pairKey` from `@/lib/pairing` |
| `errors.ts` | `handleServerError(context, error)` — structured error logging with prefix, returns user-friendly message. Used by server actions |
| `constants/shared.ts` | Sport-agnostic timing constants: `STALE_SESSION_MS` (24h), `UNDO_CONFIRMATION_DISPLAY_MS` (2s), `DEBOUNCED_REFRESH_MS` (1s) |
| `sports/types.ts` | `SportConfig` interface: sport constants, validation methods, outcome derivation, rating inputs. `ValidationResult` type |
| `sports/pickleball.ts` | Pickleball `SportConfig` implementation. Delegates validation/outcome to shared `validators.ts`. Constants: targetPresets=[11,15,21], playersPerTeam=2, playersPerCourt=4, maxCourts=8 |
| `sports/validators.ts` | Shared pure client-safe validators: `validateScores()`, `isSuspiciousScore()`, `isShutout()`, `deriveOutcome()`. Single source of truth for scoring rules — imported by both SportConfig and UI components |
| `sports/index.ts` | Sport registry: `getSportConfig(sport)` → SportConfig. Padel temporarily maps to pickleball config |
| `results/transformGameRecord.ts` | `transformGameRecords(rawGames)` — centralized transformation from raw Supabase rows to `GameRecord[]`. Filters voided games, normalizes game_players to teamAIds/teamBIds |
| `supabase/server.ts` | `getServerClient()` — server-side Supabase client (anon key) |
| `supabase/client.ts` | Browser-side Supabase singleton (anon key) |
| `supabase/helpers.ts` | `one()` — normalize FK join results (array or single object) |
| `supabase/rpc.ts` | RPC constant registry: 23 named constants (14 core incl `ENSURE_VIEW_CODE` + 9 courts) |
| `rdr.ts` | Tier + confidence utilities: `getTier(rdr)` → Walk-On/Challenger/Contender/All-Star/Elite; `tierColor(tier)` → Tailwind classes; `getConfidence(rd)` → 0–1 score; `getConfidenceLabel(conf)` → Locked In/Active/Rusty/Returning; `confidenceColor(label)` → Tailwind text classes |
| `goat.ts` | GOAT logic: `GoatCandidate` interface, `isEligibleForReigningGoat()`, `isEligibleForAllTimeGoat()`, `getReigningGoat()`, `getAllTimeGoat()`, `getGoatResult()`. Pure functions with deterministic tiebreaker chains |
| `components/PlayerStatsRow.tsx` | Reusable ranked player row (rank, name, code, stats, RDR badge + tier + confidence label). Optional `ratingDeviation` prop for confidence display, `isReigningGoat`/`isAllTimeGoat` props for GOAT badge rendering (gold gradient pill + row highlight) |

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
| `migrations/m11.0_view_only_codes.sql` | View-only access codes: adds `view_code` + `view_code_created_at` columns to `groups`, unique index `idx_groups_view_code`, format constraint (`^[a-z0-9\-]+$`), `ensure_view_code(p_join_code)` SECURITY DEFINER RPC (generates `{join_code}-view` with collision handling, max 5 attempts). |
| `migrations/m12.0_simplify_win_by.sql` | Simplify scoring: recreates `record_game` and `record_court_game` RPCs with relaxed validation — removes server-side win-by constraint. Target points still enforced. |
| `migrations/m13.0_sport_column.sql` | Multi-sport foundation: adds `sport TEXT NOT NULL DEFAULT 'pickleball'` column to `groups` table with CHECK constraint `(sport IN ('pickleball', 'padel'))`. |
| `migrations/m14.0_goat_peak_rating.sql` | GOAT badge system: adds `peak_rating` + `peak_rating_achieved_at` columns to `player_ratings`, backfills from `game_rdr_deltas`. Updates `record_game` with atomic peak tracking (`GREATEST`), `void_last_game` and `undo_game` with targeted peak repair, `get_group_stats` returns peak columns. Recreates `record_court_game` (unchanged, required due to DROP cascade). |
| `migrations/m15.0_rdr_v2.sql` | RDR v2 confidence system: adds `rating_deviation`, `last_played_at`, `reacclimation_games_remaining` to `player_ratings`. Adds `rd_before/after`, `effective_rd_before`, `vol_multiplier`, `reacclimation_before/after`, `last_played_before/after` to `game_rdr_deltas`. Backfills last_played_at from game history, initializes RD from inactivity formula. Replaces `record_game` (v2 algorithm: continuous RD inflation, volatility multiplier, reacclimation buffer, informative RD recovery, tiered margin factor, ±32 clamping), `void_last_game` + `undo_game` (restore RD state via COALESCE for v1 compat), `get_group_stats` (returns RD columns), `record_court_game` (unchanged, DROP cascade). |

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
10. Run `m11.0_view_only_codes.sql` (view_code column + ensure_view_code RPC)
11. Run `m12.0_simplify_win_by.sql` (relaxed score validation — removes win-by constraint from RPCs)
12. Run `m13.0_sport_column.sql` (adds sport column to groups table)
13. Run `m14.0_goat_peak_rating.sql` (peak_rating columns + GOAT RPC updates)
14. Run `m15.0_rdr_v2.sql` (RD columns, backfill, v2 rating algorithm)

---

## Core Logic (Most Complex Functions)

### record_game RPC (m7.0, updated m9.0)
1. `FOR UPDATE` lock on session row (serializes concurrent calls)
2. Validates: session active (no ended_at — **no time-based expiry**), 2+2 players, no overlap, all attendees, scores valid (winner >= target_points, margin >= win_by)
3. Resolves rules from session defaults when `p_target_points IS NULL`: `v_target_points := COALESCE(p_target_points, session.target_points_default)`, `v_win_by := session.win_by_default`
4. SHA-256 fingerprint: sorted teams + min:max score + target_points + win_by (order-invariant, no time bucket)
5. Duplicate check: same fingerprint within 15 min → returns `{ status: 'possible_duplicate', existing_game_id, existing_created_at }`
6. Atomic sequence_num increment + INSERT games (with target_points, win_by) + 4 game_players
7. **RDR v2 math** (inline, atomic):
   - Read `rating`, `games_rated`, `rating_deviation`, `last_played_at`, `reacclimation_games_remaining` for all 4 players
   - Compute effective RD for ALL 4 players first (inactivity inflation): `eff_rd = min(140, rd + min(50, 18 * ln(1 + max(0, days_inactive - 14) / 10)))`
   - Team avg = (p1_rating + p2_rating) / 2
   - Expected = 1 / (1 + 10^((opponent_avg - team_avg) / 400))
   - Margin factor (replaces MOV): ≤2→0.95, 3-5→1.00, 6-8→1.08, ≥9→1.10
   - Partner gap dampener (unchanged): <50→1.00, <100→0.85, <200→0.70, ≥200→0.55
   - Volatility: `raw_vol = clamp(eff_rd / 80, 0.85, 1.60)`. Reacclimation dampening for returning players (60+ days, 5+ games): factor = 0.70/0.85/1.00 for games remaining 3/2/1+. `eff_vol = 1 + ((raw_vol - 1) * factor)`
   - raw_delta = 20 * eff_vol * (actual - expected) * margin_factor * gap_mult
   - Clamped: ±32 (uniform)
   - RD recovery: `clamp(6 * opp_confidence * closeness, 4, 10)`, guarded by `<= eff_rd - 50`. `opp_confidence = clamp(80 / avg_opp_eff_rd, 0.75, 1.25)`, `closeness = 1.10/1.00/0.90`
   - Update: `rating_deviation = new_rd`, `last_played_at = now()`, decrement reacclimation counter
8. **Peak tracking**: `peak_rating = GREATEST(peak_rating, new_rating)`, `peak_rating_achieved_at = CASE WHEN new > old THEN now() ELSE unchanged END`
9. Persist to `game_rdr_deltas` (4 rows: game_id, player_id, delta, rdr_before, rdr_after, games_before, games_after, algo_version='rdr_v2', rd_before, rd_after, effective_rd_before, vol_multiplier, reacclimation_before/after, last_played_before/after)
10. `search_path = public, extensions` (pgcrypto DIGEST lives in `extensions` schema on Supabase)
11. Returns `{ status, game_id, target_points, win_by, undo_expires_at, deltas: [{player_id, delta, rdr_after}] }`

### void_last_game (m10.0, updated m14.0 — rating-correct LIFO + peak repair)
1. Lock session row FOR UPDATE (concurrency safety)
2. Find most recent non-voided game
3. Verify exactly 4 un-voided delta rows in `game_rdr_deltas`
4. **Peak repair**: For each player, if voided game's `rdr_after >= peak_rating`, recompute peak from surviving non-voided deltas via `DISTINCT ON` query. If no surviving deltas, reset to 1200.
5. Reverse ratings + RD state per player: `rating -= delta`, `games_rated = games_before`, `provisional = (games_before < 20)`, `rating_deviation = COALESCE(rd_before, current)`, `reacclimation = COALESCE(reacclimation_before, current)`, `last_played_at = last_played_before`
6. Mark game `voided_at = now()` + mark delta rows `voided_at = now()`
7. Return `{ status: 'voided', voided_game_id }`

### undo_game (m10.2, updated m14.0 — 8-second undo window + peak repair)
1. Lock game row FOR UPDATE (concurrency safety)
2. Validate: not voided, `undo_expires_at IS NOT NULL`, `undo_expires_at >= now()`, session not ended
3. Resolve group_id from session
4. **Peak repair**: Same logic as void_last_game — recompute peak from surviving deltas if voided game matched peak
5. Reverse ALL non-voided deltas + RD state: loop `game_rdr_deltas WHERE voided_at IS NULL`, subtract delta from player rating, restore games_before, restore RD/reacclimation/last_played via COALESCE (v1 backward compat)
6. Mark game `voided_at = now(), void_reason = 'undo'` + mark delta rows `voided_at = now()`
7. Return `{ status: 'undone', game_id }`
8. Idempotent: second concurrent caller finds voided_at set → rejects cleanly

### Session Rules
- **Session-level defaults**: `sessions.target_points_default` (11/15/21), `sessions.win_by_default` (columns still exist but win-by removed from UI in v0.5.0)
- **Per-game resolved rules**: `games.target_points`, `games.win_by` — immutable truth for each game
- **set_session_rules RPC**: Hardened SECURITY DEFINER. Validates session exists + active + real group. Updates session defaults.
- **UI**: Rules Chip (tappable, shows target points only). Shared in RecordGameForm + CourtsManager. Win-by picker removed in v0.5.0.
- **DB validation (m12.0)**: `record_game` and `record_court_game` RPCs no longer enforce win-by margin — only validates winner >= target_points.

### RDR Tier System (cosmetic, UI-only)
- <1100: Walk-On (gray)
- 1100-1199: Challenger (blue)
- 1200-1299: Contender (green)
- 1300-1399: All-Star (yellow)
- ≥1400: Elite (red)
- Thresholds based on `Math.round(rating)` to avoid edge-case confusion

### GOAT Badge System (v0.6.0)
- **Reigning GOAT** (👑 GOAT): Highest current RDR. Eligibility: `games_rated >= 20` AND `Math.round(current_rdr) >= 1400` (Elite). Tiebreakers: current_rdr → games_rated → win_pct → point_diff → rating_achieved_at → player_id.
- **All-Time GOAT** (ALL-TIME): Highest peak RDR ever. Eligibility: `games_rated >= 50`. Tiebreakers: peak_rdr → games_rated → current_rdr → win_pct → peak_rating_achieved_at → player_id.
- Shown on All-time leaderboard tab only (not 30 Days or Last Session)
- One player can hold both titles. Exactly one holder per title (deterministic, no ties)
- Logic in `src/lib/goat.ts` — pure functions, no DB calls

### RDR v2 Confidence System (v0.7.0)
- **Rating deviation (RD)**: Hidden uncertainty per player. Range: 50 (Locked In) → 140 (max uncertainty). Stored in `player_ratings.rating_deviation`.
- **Inactivity inflation**: After 14-day grace, `rd_bump = min(50, 18 * ln(1 + (days_inactive - 14) / 10))`. Logarithmic = fast rise early, slow later, capped.
- **Volatility**: `raw_vol = clamp(eff_rd / 80, 0.85, 1.60)`. Replaces binary K=60/22. BASE_K = 20.
- **Reacclimation**: 60+ days inactive AND games_rated >= 5 → 3-game buffer. Factor = 0.70 → 0.85 → 1.00. Applied as `eff_vol = 1 + ((raw_vol - 1) * factor)`.
- **RD recovery**: `clamp(6 * opp_conf * closeness, 4, 10)` per game. `opp_conf = clamp(80 / avg_opp_eff_rd, 0.75, 1.25)`. `closeness = 1.10 (≤2) / 1.00 (3-5) / 0.90 (6+)`. Guard: `recovery <= eff_rd - 50`.
- **Margin factor**: 0.95 (≤2 pts) / 1.00 (3-5) / 1.08 (6-8) / 1.10 (≥9). Replaces ln-based MOV.
- **Confidence labels** (UI): Locked In (≥0.85) / Active (≥0.65) / Rusty (≥0.40) / Returning (<0.40). Computed as `1 - (rd - 50) / 90`.
- **New player RD**: 120 (column default). Settles in ~5-8 games.
- **Void/undo**: Restores RD, reacclimation, last_played_at from delta row's "before" values. COALESCE for v1 backward compat (NULL → keep current).

### Rating Storage
- `player_ratings.rating` is `numeric(7,2)` — stored with full precision
- UI displays `Math.round(rating)` everywhere (leaderboard, PlayerStatsRow, tier input)
- Deltas stored in `game_rdr_deltas` with full precision

### Legacy Rating System (m6, superseded by RDR in m10.0)
- `apply_ratings_for_game` still exists but is no longer called (fire-and-forget removed)
- `recompute_session_ratings` still exists but is no longer called (void uses LIFO reversal)
- `rating_events` table still exists (not modified, no DELETE); cold start reset player_ratings only
- K=40/20, no MOV, no partner gap — replaced by K=60/22 + MOV + gap dampener in v1, then by BASE_K=20 + volatility + margin factor in v2

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
- ~~Shareable leaderboard link~~ *(done: view-only links cover this)*
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
- Form 30 / Form 90 (recent performance metrics): minimum 3/5 games, "Who's Hot" leaderboard — deferred to v2+ after confidence system stabilizes
- Per-player expectation vs opposing team (instead of team average) — accepted as v2 limitation, revisit if rating noise in mixed-skill pairings becomes a real product problem

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

1. **Apply m15.0 migration** — Run `m15.0_rdr_v2.sql` on Dev Supabase instance. Required for RDR v2 confidence system (RD columns, backfill, v2 RPCs). Verify backfill: active players should have RD ~80, inactive players higher RD proportional to days since last game.

2. **Rewrite `supabase/schema.sql` to be fully self-contained** — Currently stale at ~M6. Should include all tables (including session_courts, session_players with status, games.undo_expires_at, groups.view_code, player_ratings.peak_rating/rating_deviation/last_played_at/reacclimation_games_remaining), all RPC function bodies (M7-M15.0), updated views, indexes.

3. **Decompose CourtsManager.tsx** — At 1073+ lines it's the largest file. Extract CourtCard, WaitingPool, SlotPickerSheet, and CourtsControlBar into separate client components. Keep shared state in CourtsManager as the orchestrator.

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
- Player names in game cards: `shortName()` → "Joe S." (first name + last initial). Leaderboard/standings still use full display_name.
- Winner highlighting: emerald-600 for winning team/score, neutral gray for losing (never red)
- All time formatting routed through `src/lib/datetime.ts` — no direct `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` calls in UI code

### TypeScript
- `camelCase` for variables/functions, `PascalCase` for types/components
- Centralized types in `src/lib/types.ts`
- RPC names in `src/lib/supabase/rpc.ts` as `const` object (23 constants)
- Server actions in `src/app/actions/` with `"use server"` directive
- Path alias: `@/` maps to `src/`

### Folder Structure
```
src/
  app/
    actions/          # Server actions (access.ts, sessions.ts, players.ts, games.ts, courts.ts)
    g/[join_code]/    # Group routes (dynamic, full access)
      session/[session_id]/
        courts/       # Courts Mode sub-route
        games/        # Session game log
      start/          # Start session
      players/new/    # Add player
      sessions/       # Session history
      leaderboard/    # Group leaderboard
    v/[view_code]/    # View-only routes (dynamic, read-only mirror of /g/)
      session/[session_id]/
        games/        # View-only game log
      sessions/       # View-only session history
      leaderboard/    # View-only leaderboard
    help/             # Static help page
    changelog_public/ # Rendered markdown changelog
  lib/
    supabase/         # Supabase clients + helpers + RPC constants
    components/       # Shared presentational components (PlayerStatsRow)
    *.ts              # Pure utility functions (types, env, formatting, suggestCode, autoSuggest, pairingFeedback)
supabase/
  schema.sql          # Canonical DB reference (STALE at ~M6)
  migrations/         # Ordered SQL migrations (m0 → m15.0)
docs/                 # Architecture docs, how-tos, decisions, testing checklist
```

---

## The Validation Suite

### Version Bump Checklist

> **Every time the version number changes, ALL of these must be updated together.**
> This includes new feature releases, patch releases, and any changelog updates.

1. **`package.json`** — Update `"version"` field (this is the single source of truth)
2. **Footer auto-updates** — `next.config.ts` reads `package.json` version into `NEXT_PUBLIC_APP_VERSION`, which `layout.tsx` renders in the global footer. No manual footer edit needed, but **Vercel must rebuild** for the change to take effect.
3. **`CHANGELOG.md`** — Add version entry with technical details
4. **`CHANGELOG_PUBLIC.md`** — Add version entry in plain English (user-facing, rendered at `/changelog_public`)
5. **`MEMORY.md`** — Update the `Version` line under Git State, the Environments table, the Active Sprint Goal, and add a Milestone History entry
6. **New migrations?** — If any new `.sql` files were added under `supabase/migrations/`, note them in the Pending migration line under Git State and alert the user to apply them before deploying

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
- [ ] Footer shows `v0.7.0`, "Changes" link goes to /changelog_public
- [ ] Stale banner appears for sessions with no games in 24+ hours
- [ ] Record game → undo snackbar appears with 8s countdown, undo works
- [ ] Pre-submit preview shows winner chip (green) + loser chip (amber)
- [ ] Tied/incomplete scores → neutral gray chips, no Winner/Loser labels
- [ ] All timestamps display in Central Time (no UTC offset)
- [ ] Voided games hidden by default in session game list + All Games page
- [ ] Group dashboard shows "📋 Copy view-only link" in secondary nav
- [ ] Copy view-only link copies correct URL to clipboard
- [ ] Enter view_code on home page → redirects to `/v/{view_code}`
- [ ] `/v/` dashboard: logo, group name (not join_code), "View-only link", leaderboard + sessions links
- [ ] `/v/` leaderboard: all 3 range modes work, no write CTAs
- [ ] `/v/` sessions: list renders, links go to `/v/` session detail
- [ ] `/v/` session detail: active (LIVE + view-only badge) and ended layouts correct
- [ ] `/v/` games: game list with voided toggle, no write components
- [ ] Zero write buttons/forms visible on any `/v/` page
- [ ] Session from different group on `/v/` route returns 404
- [ ] Manual mode: enter overtime score with margin > 2 → amber warning appears; "Record anyway" proceeds
- [ ] Courts mode: enter overtime score with margin > 2 → per-court amber warning; "Record anyway" proceeds
- [ ] Suspicious score warning clears when score inputs change
- [ ] Courts mode: End Session button visible in header
- [ ] Courts mode: "All games →" and "Standings →" links in footer
- [ ] Ended session: Games/Standings tab toggle works, defaults to Games
- [ ] Ended session Standings tab shows player stats with RDR badges
- [ ] Leaderboard "Last Session": Previous/Next arrows navigate between sessions
- [ ] Leaderboard back arrow returns to originating session when accessed via "Standings →"
- [ ] Game cards in EndedSessionGames match GamesList layout (score + short names)
- [ ] Player names in game cards show "Joe S." format (first name + last initial)
- [ ] `/v/` routes mirror all new features (session tabs, leaderboard browsing) in read-only mode
- [ ] Leaderboard All-time tab shows 👑 GOAT badge on Reigning GOAT (if eligible player exists)
- [ ] Leaderboard All-time tab shows ALL-TIME badge (if eligible player exists)
- [ ] GOAT row has gold-tinted border and background
- [ ] GOAT badges do NOT appear on 30 Days or Last Session tabs
- [ ] Tier badges show new names: Walk-On, Challenger, Contender, All-Star, Elite
- [ ] Confidence labels (Locked In / Active / Rusty / Returning) appear below RDR on leaderboard cards
- [ ] Confidence labels appear on session standings pages
- [ ] Confidence labels appear on `/v/` view-only leaderboard and session pages
- [ ] Record a game: player `rating_deviation` decreases, `last_played_at` updates
- [ ] Void a game: `rating_deviation`, `reacclimation_games_remaining`, `last_played_at` all restored to pre-game values
- [ ] Undo a game (within 8s): same RD state restoration as void
- [ ] New player gets RD = 120 on first game (column default)
- [ ] Player inactive 60+ days with 5+ games: first game back shows dampened delta (reacclimation)
- [ ] Footer shows `v0.7.0`, "Changes" link shows v0.7.0 entry

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

13. **View-only route isolation**: `/v/` pages MUST NOT import any write components (RecordGameForm, EndSessionButton, VoidLastGameButton, StaleBanner, StartSessionForm, CourtsManager, CourtsSetup) or server actions from `@/app/actions`. They reuse read-only components (`EndedSessionGames`, `GamesList`, `PlayerStatsRow`) from `/g/`. All `<Link>` hrefs in `/v/` point to `/v/{view_code}/...` — never `/g/`. Defense-in-depth: all write actions require `AccessMode = "full"` as first param via `requireFullAccess()` guard.

14. **`ensure_view_code` RPC normalizes input**: Always calls `lower(p_join_code)` internally. Never trust caller casing. SECURITY DEFINER with `SET search_path = public`.

15. **RDR v2: Effective RD must be computed for ALL 4 players BEFORE any deltas or RD recovery**: If you compute them inline per-player, opponent RD values will be inconsistent. The `record_game` RPC computes `v_eff_rd_a1/a2/b1/b2` in a first pass, then uses those values for both volatility and opponent confidence calculations.

16. **RDR v2: COALESCE on void/undo for v1 backward compat**: `game_rdr_deltas` rows from v1 have NULL for `rd_before`, `reacclimation_before`, `last_played_before`. The void/undo RPCs use `COALESCE(rd_before, rating_deviation)` to preserve current state when voiding v1 games. Removing the COALESCE would corrupt RD state.

17. **RDR v2: Column default 120 on `rating_deviation`**: This is `NEW_PLAYER_RD`, not `RD_DEFAULT` (80). The upsert in `record_game` uses `ON CONFLICT DO NOTHING`, so new players automatically get RD=120 from the column default. Changing this default to 80 would make new players appear overly confident.

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

## RPC Function Reference (23 functions)

### Core (14 functions)
| RPC Name | Security | Params | Returns | Purpose |
|----------|----------|--------|---------|---------|
| `create_session` | INVOKER | `(group_join_code text, player_ids uuid[])` | `uuid` | Create session + attendance. Idempotent on concurrent calls |
| `end_session` | DEFINER | `(p_session_id uuid)` | `void` | Sets ended_at + closed_reason='manual' |
| `record_game` | DEFINER | `(p_session_id, p_team_a_ids[], p_team_b_ids[], p_team_a_score, p_team_b_score, p_force)` | `jsonb` | Atomic game recording with dedup. FOR UPDATE lock |
| `get_session_stats` | INVOKER | `(p_session_id uuid)` | `TABLE(11 cols incl rdr)` | Session leaderboard. Sorted: win_pct → point_diff → rdr → name |
| `get_group_stats` | INVOKER | `(p_join_code text, p_days int?, p_sort_by text?)` | `TABLE(13 cols incl rdr, peak_rating, peak_rating_achieved_at)` | Group leaderboard. p_sort_by='rdr': rdr → win_pct → point_diff → name |
| `get_last_session_id` | INVOKER | `(p_join_code text)` | `uuid` | Most recently ended session |
| `get_session_pair_counts` | INVOKER | `(p_session_id uuid)` | `TABLE(5 cols)` | All attendee pairs + partner count |
| `apply_ratings_for_game` | DEFINER | `(p_game_id uuid)` | `void` | Idempotent Elo update for one game |
| `reconcile_missing_ratings` | DEFINER | `()` | `integer` | Backfill missing Elo ratings across all groups |
| `set_session_rules` | DEFINER | `(p_session_id uuid, p_target_points int, p_win_by int)` | `jsonb` | Update session-level game rule defaults |
| `void_last_game` | DEFINER | `(p_session_id uuid)` | `jsonb` | Soft-delete most recent game + LIFO rating reversal via game_rdr_deltas |
| `undo_game` | DEFINER | `(p_game_id uuid)` | `jsonb` | 8s undo window: FOR UPDATE lock, validates not voided + undo_expires_at >= now() + session not ended, reverses ALL deltas, marks voided with void_reason='undo' |
| `recompute_session_ratings` | DEFINER | `(p_session_id uuid)` | `integer` | Forward-replay Elo from earliest affected game (legacy, not called) |
| `ensure_view_code` | DEFINER | `(p_join_code text)` | `text` | Auto-generate view_code for a group. Returns existing if set, else generates `{join_code}-view` with collision handling (appends `-{4 chars}`, max 5 attempts). Normalizes input to lowercase. |

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
| `groups` | id, name, join_code, view_code, view_code_created_at, sport | join_code: lowercase alphanumeric + hyphens, unique. view_code: nullable, unique, format `^[a-z0-9\-]+$`, auto-generated as `{join_code}-view`. sport: TEXT NOT NULL DEFAULT 'pickleball', CHECK IN ('pickleball', 'padel') |
| `players` | id, group_id, display_name, code, is_active | code: uppercase, unique per group |
| `sessions` | id, group_id, name, started_at, ended_at, closed_reason | Partial unique: one active per group |
| `session_players` | session_id, player_id, **status**, inactive_effective_after_game | Status: ACTIVE or INACTIVE. Added in m8.0 |
| `games` | id, session_id, sequence_num, scores, dedupe_key, voided_at, undo_expires_at | Immutable, soft-delete only. `undo_expires_at` for 8s undo window |
| `game_players` | game_id, player_id, team ('A'/'B') | 4 rows per game |
| `player_ratings` | group_id, player_id, rating, games_rated, provisional, peak_rating, peak_rating_achieved_at | Rating state + peak tracking for GOAT |
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
| v0.4.3 — View-Only Sharing | `3642fb7`→`2ec10b1` | View-only access codes (`/v/[view_code]` route tree, 5 pages), `ensure_view_code` RPC (m11.0), `AccessMode` guard on all write actions, "Copy view-only link" button, home page view_code redirect, Vercel Analytics `<Analytics />`. Security fix (`2ec10b1`): removed `join_code` from all `/v/` pages — dashboard shows `group.name`, `.select()` pruned in 4 files, leaderboard keeps `join_code` server-only for RPCs |
| v0.5.0 — Session Browsing | `8981bf3`→`09d3427` | Suspicious score warning (Manual + Courts), End Session + footer nav in Courts Mode, context-aware leaderboard back nav (`from` param), session browsing in Last Session mode (`session_id` param + Prev/Next), Games/Standings tabs on ended sessions, unified game card layout (EndedSessionGames rewritten), "first name + last initial" name format, win-by removed from UI (m12.0 migration). All changes mirrored in `/v/` routes. |
| v0.5.1 — Multi-Sport Phase 1 | `7233d8d`→`d98c410` | Sport abstraction layer (`SportConfig`, `getSportConfig()`, `validators.ts` shared pure validators), DB migration `m13.0` adds `sport` column, server actions use joined query for `group.sport`, UI components receive serializable sport props, deprecated `scoring.ts` removed, shared utilities (`pairKey`, `transformGameRecords`, `handleServerError`, `constants/shared.ts`), `robots.txt`, Vitest test infrastructure (160 tests/15 files). Zero UI/UX changes — internal refactor only. |
| v0.6.0 — GOAT Badges + Tier Renames | `1d254a3`→`3e91e8c` | GOAT badge system: Reigning GOAT (👑 highest current RDR, 20+ games, Elite) + All-Time GOAT (highest peak RDR, 50+ games). Gold gradient pill with glow + row highlight. Peak rating tracked atomically in `record_game`, targeted peak repair on void/undo. Pure logic module `src/lib/goat.ts` (22 tests). Tier renames: Walk-On/Challenger/Contender/All-Star/Elite. Migration `m14.0`. Both `/g/` and `/v/` leaderboards updated. |
| v0.7.0 — RDR v2 Confidence System | `ebeeb80`→`eba7a15` | Confidence-based rating system replacing binary K-factor. Rating deviation (RD) tracks uncertainty per player. Continuous inactivity inflation via logarithmic curve. Volatility multiplier `clamp(eff_rd/80, 0.85, 1.60)`. Reacclimation buffer (3 games) for 60-day returners. Informative RD recovery based on opponent confidence + game closeness. Tiered margin factor replaces ln-based MOV. Uniform ±32 clamping. Confidence labels: Locked In/Active/Rusty/Returning. Extended delta logging for observability. Migration `m15.0`. All leaderboard + session pages updated. |

---

*End of MEMORY snapshot.*
