# RedDogPickle — Current File Map (v0.9.0)

A high-level map of the project. For per-file detail (responsibilities, props, guardrails) see **MEMORY.md** ("Complete File Map").

---

## Root

```
RedDogPickle/
├── .env.local            # local secrets (git-ignored)
├── .env.example          # template, no secrets
├── package.json          # version (single source of truth for the footer), scripts
├── next.config.ts        # injects NEXT_PUBLIC_APP_VERSION from package.json
├── tailwind.config.ts    # content paths MUST include src/lib/**
├── vitest.config.ts, vitest.integration.config.ts
├── public/               # logos, favicons, OG image, robots.txt
│
├── README.md, SPEC.md, BUILD_PLAN.md, MEMORY.md, FILEMAP.md
├── CHANGELOG.md          # internal engineering changelog
├── CHANGELOG_PUBLIC.md   # user-facing release notes (served at /changelog_public)
├── RATING_GUIDE.md, SETUP_GUIDE.md
├── docs/                 # how-to-run, how-to-deploy, how-to-update-schema (incl. data-correction runbook),
│                         #   decisions, testing, assumptions, indexes
├── supabase/
│   ├── schema.sql        # reference only — stale at ~M6
│   └── migrations/       # m0_base_tables.sql … m18.0_padel_target_points.sql (applied by hand)
└── src/
```

---

## src/app (Next.js App Router)

| Path | Purpose |
|---|---|
| `layout.tsx`, `page.tsx` | Root layout (metadata, footer with version); home: group-code entry + rotating slogan |
| `help/`, `rdr/`, `changelog_public/` | Help page, rating explainer, rendered public changelog |
| `actions/` | Server actions: `sessions.ts`, `players.ts`, `games.ts`, `courts.ts`, `admin.ts`, `access.ts` (write guard) |
| `g/[join_code]/` | Full-access group routes: dashboard, `start/`, `players/new/`, `players/[player_id]/` (per-player history), `sessions/`, `leaderboard/`, `session/[session_id]/` (Quick Game Screen, `courts/`, `games/`, `players/`) |
| `v/[view_code]/` | Read-only mirror of the group routes (no write components, no `/g/` links) |
| `rd-admin/` | Password-gated admin panel: `login/`, home (group list + create group), `groups/[group_id]/` (player hide/edit) |

## src/lib

| Path | Purpose |
|---|---|
| `sports/` | `SportConfig` registry (`getSportConfig`): `pickleball.ts`, `padel.ts`, `padelValidators.ts`, shared `validators.ts`, tests in `__tests__/` |
| `admin/` | `auth.ts` (HMAC-signed admin cookie, `requireAdminSession`), `constants.ts` (`/rd-admin` paths) |
| `supabase/` | `server.ts`/`client.ts` (anon), `adminServer.ts` (service-role, admin only), `rpc.ts` (RPC names), `helpers.ts` (`one()`) |
| `components/` | `LeaderboardCard`, `LeaderboardCardList`, `PlayerPicker`, rating/confidence badges, legacy `PlayerStatsRow` |
| `*.ts` | `types`, `datetime` (America/Chicago), `formatting`, `statLabels`, `rdr`, `goat`, `autoSuggest`, `pairing`, `pairingFeedback`, `errors`, `suggestCode`, `env` |

---

## Architectural Boundaries

**Frontend:** UI, tap-to-select scoring, confirmation UX, mobile-first layout.
**Backend (Postgres RPCs):** all scoring validation, atomic game writes, duplicate detection, rating math (RDR v2), LIFO void/undo. No client-side trust for game insertion.
**Service role:** admin panel only.
**Games are immutable:** corrected by void + re-record (see `docs/how-to-update-schema.md`).

## Environment Variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and — for the admin panel — `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`. Details in `docs/how-to-run.md` and `docs/how-to-deploy.md`.

## Deployment

Vercel (`main` → production, other branches → previews) and two Supabase Postgres projects (production and dev). `pgcrypto` must be enabled.

Generated, do not commit: `.next/`, `node_modules/`.
