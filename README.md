# 🏓 RedDog Pickle 

Mobile-first pickleball and padel stats tracker for live courtside scoring, leaderboards, and player stats. **Current version: 0.9.0.**

**Stack:** Next.js 15 (App Router) · React 19 · Supabase · Vercel · Tailwind CSS

---

## What It Does

- Groups access via shareable URL: `/g/{join_code}`; read-only view links at `/v/{view_code}`
- No login required — trust-based, courtside-optimized
- Record doubles games in < 12 seconds on mobile (tap-to-select Quick Game Screen; Courts Mode for multi-court rotation)
- Pickleball and padel groups (padel: one set per recording, first to 6 win by 2, no tiebreak)
- Automatic deduplication across devices
- Session leaderboards + all-time and 30-day stats, per-player game history
- RDR (Red Dog Rating) v2 ratings with confidence labels and GOAT badges
- Immutable game history (void + re-record to correct mistakes)
- Password-gated admin panel at `/rd-admin` (create groups, hide/unhide and edit players)

---

## Quick Links

| | |
|---|---|
| 📋 [Product Spec](./SPEC.md) | Full feature specification v1.3 |
| 🗺️ [Build Plan](./BUILD_PLAN.md) | Milestones 0–6 and the Milestone 7 roadmap |
| 🔄 [Release Notes](./CHANGELOG_PUBLIC.md) | User-facing release notes |
| 🧭 [Project Memory](./MEMORY.md) | Detailed current-state reference: file map, logic, guardrails, runbooks |

### Developer Docs

| | |
|---|---|
| 🚀 [How to Run Locally](./docs/how-to-run.md) | Dev setup, env vars, common commands |
| ☁️ [How to Deploy](./docs/how-to-deploy.md) | Vercel setup, env vars, redeploy steps |
| 🗄️ [How to Update Schema](./docs/how-to-update-schema.md) | Supabase SQL guide, RLS reference |
| 🧠 [Decisions](./docs/decisions.md) | Architecture decisions + rationale |
| 🧪 [Testing](./docs/testing.md) | Manual test checklist by screen |
| 📝 [Assumptions](./docs/assumptions.md) | Recorded ambiguities and resolutions |
| 📇 [Indexes](./docs/indexes.md) | Expected database indexes + rationale |
| 🔧 [Engineering Changelog](./CHANGELOG.md) | Full internal change history (not user-facing) |

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local   # then fill in your Supabase credentials

# Start dev server
npm run dev
```

See [docs/how-to-run.md](./docs/how-to-run.md) for full setup instructions.

---

## Project Structure

A high-level map. For per-file detail see [MEMORY.md](./MEMORY.md) ("Complete File Map").

```
/
├── src/
│   ├── app/
│   │   ├── layout.tsx, page.tsx                 # Root layout (metadata, footer); home (group code + rotating slogan)
│   │   ├── actions/                             # Server actions: sessions, players, games, courts, admin, access guard
│   │   ├── g/[join_code]/                       # Full-access group routes: dashboard, start, players, sessions,
│   │   │                                        #   leaderboard, session/[id] (Quick Game Screen, courts, games, players)
│   │   ├── v/[view_code]/                       # Read-only mirror of the group routes
│   │   ├── rd-admin/                            # Password-gated admin panel (login, groups, player editing)
│   │   ├── help/, changelog_public/, rdr/       # Static/explainer pages
│   └── lib/
│       ├── sports/                              # SportConfig registry: pickleball, padel, shared validators
│       ├── admin/                               # Admin session auth + path constants
│       ├── supabase/                            # Anon clients, service-role admin client, RPC constants, helpers
│       ├── components/                          # Shared UI: LeaderboardCard(List), PlayerPicker, ...
│       └── *.ts                                 # types, datetime, formatting, statLabels, rdr, goat, autoSuggest, ...
├── supabase/
│   ├── schema.sql                               # Reference schema (stale — migrations are the source of truth, m0 → m18.0)
│   └── migrations/                              # Ordered SQL migrations applied by hand in the Supabase SQL Editor
├── docs/                                        # Developer documentation
├── .env.example                                 # Env var template (no secrets)
├── SPEC.md                                      # Product specification (original MVP spec)
├── BUILD_PLAN.md                                # Milestone roadmap
├── MEMORY.md                                    # Detailed current-state reference
├── CHANGELOG.md                                 # Internal engineering change history
└── CHANGELOG_PUBLIC.md                          # User-facing release notes (served at /changelog_public)
```

---

## Milestone Status

| Milestone | Description | Status |
|---|---|---|
| 0 | Project Setup | ✅ Complete |
| 1 | Group Access & Dashboard Shell | ✅ Complete |
| 2 | Sessions (RPC-based create + end) | ✅ Complete |
| 3 | Add Player & Session History | ✅ Complete |
| 4 | Record Game | ✅ Complete |
| 5 | Leaderboards & Stats | ✅ Complete |
| 6 | Elo v1 + Trust UX + Version/Changelog | ✅ Complete |
| — | v0.4–v0.8: RDR ratings, rebrand, view-only links, GOAT badges, RDR v2, Quick Game Screen, win-by-1, hidden players | ✅ Shipped (see [CHANGELOG.md](./CHANGELOG.md)) |
| 7a–7f | v0.9.0: session standings link fix, player search, padel (manual scoring), admin panel, per-player history, admin player editing | ✅ Shipped (v0.9.0, production) |
| 7g–7i | Admin "View group" link, archive groups, reopen session from admin | 📋 Planned (see [BUILD_PLAN.md](./BUILD_PLAN.md)) |

---

## Key Design Principles

- **Zero friction** — the whole point is courtside speed
- **Immutable records** — games are never edited or deleted; mistakes are voided (soft-delete) and re-recorded
- **Cross-device duplicate prevention** — SHA-256 fingerprint checked inside `record_game`
- **No auth for players** — trust-based group model; device identity via localStorage only. The only password is the shared admin password for `/rd-admin`
- **RDR ratings** — Red Dog Rating v2 computed atomically inside `record_game` and reversed LIFO on void/undo (see [RATING_GUIDE.md](./RATING_GUIDE.md))
