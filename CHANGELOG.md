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
