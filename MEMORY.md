# MEMORY.md

---

# Current Project DNA

## App Purpose
RedDog Pickle is a **mobile-first pickleball stats tracker** optimized for live, courtside scoring.  
Core goals:
- Record doubles games in <12 seconds
- No login required (trust-based group access)
- Immutable game history
- Cross-device duplicate prevention
- Session-level and group-level leaderboards
- Future-ready for Elo rating

## Core Tech Stack
- **Frontend:** Next.js (App Router)
- **Backend:** Supabase (Postgres + RPC functions)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS
- **Architecture Principle:** Immutable event log (games + game_players) with derived read models

## Active Sprint Goal (Post-M5)
Milestone 6 — Polish & Intelligence Layer:
- Add session pairing counts
- Finalize session standings placement
- Harden UX
- Prepare architecture for Elo expansion
- Clean DB state and remove test data

---

# The "Source of Truth" (State of Code)

## Root
- `README.md` — Project overview + milestone status
- `BUILD_PLAN.md` — Milestone roadmap
- `CHANGELOG.md` — Version history
- `MEMORY.md` — This file
- `SPEC.md` — Functional spec
- `.env.local` — Supabase keys

## /src/app
- `layout.tsx` — Root layout
- `page.tsx` — Enter Group Code
- `/actions`
  - `sessions.ts` — createSessionAction, endSessionAction
  - `players.ts` — addPlayerAction
  - `games.ts` — recordGameAction (calls record_game RPC)
- `/g/[join_code]/page.tsx`
  - Dashboard (active session detection logic)
- `/g/[join_code]/leaderboard/page.tsx`
  - All-time / 30-day / Last session leaderboard
- `/g/[join_code]/session/[session_id]/page.tsx`
  - Active session screen
  - Session standings
  - Pairing balance (in-progress)
  - Game list
- `/g/[join_code]/session/[session_id]/RecordGameForm.tsx`
  - 3-step team + score entry
- `/g/[join_code]/session/[session_id]/EndSessionButton.tsx`
  - Two-tap confirm end

## /src/lib
- `suggestCode.ts` — Player code generation
- `/supabase/client.ts` — Supabase anon client

## /supabase
- `schema.sql` — Canonical DB schema
- `/migrations`
  - `m2_rpc_sessions.sql`
  - `m4_record_game.sql`
  - `m5_group_leaderboards.sql`

---

# Core Logic (Most Complex Functions)

## record_game RPC
- Validates 4 players (2 per team)
- Generates deterministic `dedupe_key`
- Prevents duplicates via unique constraint
- Inserts immutable game row
- Inserts 4 game_players rows

## get_session_stats(p_session_id)
- Aggregates vw_player_game_stats
- Computes:
  - games_played
  - games_won
  - win_pct
  - points_for / against
  - point_diff
  - avg_point_diff
- Explicit numeric casting to avoid bigint/numeric mismatch

## get_group_stats(p_join_code, p_days)
- Resolves group_id
- Filters by session membership
- Applies day-anchored window for 30-day
- Deterministic ordering:
  1. win_pct desc
  2. games_won desc
  3. point_diff desc
  4. display_name asc
- Explicit casting enforced

## vw_player_game_stats
- Normalizes each game into per-player row
- Handles team A/B mapping
- Protects against invalid score rows
- Designed as reusable event projection

---

# The Design Back-Burner (Deferred / V2)

## UX Enhancements
- Animated leaderboard row reordering
- Rank change arrows
- Player avatar colors
- Session summary card (MVP, highlights)
- Shareable leaderboard link
- Dark mode (night court)

## Intelligence Features
- Elo rating system
- Elo delta per game
- Matchup stats
- Best teammate stats
- Streak tracking

## Structural Extensions
- Court number labeling
- Multi-court rotation suggestions
- Player join/leave mid-session tracking
- Rating history graph

---

# The Technical Debt Confession

## DB Layer
- Manual DB state existed before M5 codified migrations
- No automated test suite for SQL correctness
- Hardcoded 4-player-per-game assumption
- No soft-delete model (true deletion used)

## Frontend
- Some UI spacing manually tuned (magic Tailwind values)
- No centralized design tokens
- No global error boundary for RPC failures
- Range query param parsing is simplistic (string match only)
- No loading skeleton states

## Session Page
- No real-time updates (refresh required)
- No optimistic UI after record_game
- Standings + pairing sections not yet collapsible

## Leaderboard
- Last session RPC newly introduced — edge cases untested
- No memoization or caching for heavy group stats

---

# Resolved Regressions

## 1. Function Signature Collision
Error:
> Could not choose best candidate function

Fix:
- Explicit DROP FUNCTION IF EXISTS(signature)
- Enforced explicit signature typing

## 2. Bigint vs Numeric Return Type Mismatch
Error:
> structure of query does not match function result type

Fix:
- Explicit ::numeric casting
- Explicit ::bigint casting

## 3. Duplicate record_game Inserts Across Devices
Fix:
- Deterministic dedupe_key
- Unique DB constraint
- Proper conflict handling

## 4. encode(bytea) Extension Failure
Cause:
- pgcrypto extension mismatch

Fix:
- Adjusted hash strategy

## 5. Vercel Framework Preset Misconfiguration
Fix:
- Recreated project with Next.js preset

---

# Claude Code Execution Plan (Next 3 Steps)

1. Implement get_session_pair_counts RPC
   - Include zero-count pairs
   - Explicit casting
   - Deterministic ordering
   - Fully qualify public.* references

2. Integrate Pairing Balance UI
   - Place under Session Standings
   - Remove Active Players strip
   - Add pluralization + empty state

3. Execute Milestone 6 Validation Sweep
   - Performance test
   - Error state audit
   - Mobile tap-target verification
   - Update docs/testing.md

---

# Coding Standards & Patterns

## DB
- All functions SECURITY INVOKER
- Explicit casting in aggregates
- Fully qualify schema (public.table)
- Immutable game history
- Avoid DROP unless changing signature
- Use CREATE OR REPLACE when possible

## Frontend
- Server components preferred
- Tailwind only (no inline styles)
- No client-side heavy aggregation
- Use RPC for derived stats
- Deterministic query param parsing
- Mobile-first layout

## Naming
- RPC names: get_*
- View names: vw_*
- UUID always typed explicitly
- Lowercase snake_case for DB
- camelCase for TS

---

# The Validation Suite

Run locally:

```bash
npm install
npm run build

Supabase checks:
select count(*) from public.games;
select * from public.get_group_stats('JOINCODE', null);
select * from public.get_session_pair_counts('SESSION_ID');

Deployment validation:

Confirm leaderboard renders

Confirm session standings update after record

Confirm pairing counts update

Verify sorting order manually


Logic Guardrails (Do NOT Change)

dedupe_key generation logic in record_game

Deterministic leaderboard ordering rules

Explicit numeric casting in RPC math

Immutable game model (no edits)

Session auto-close logic (4-hour window)

Changing any of these will introduce regression risk.


External Dependencies
Supabase

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

Hosting

Vercel (Next.js preset required)

No third-party APIs currently integrated.

End of MEMORY Snapshot
