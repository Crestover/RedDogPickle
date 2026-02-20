# 🏓 RedDog Pickle

Mobile-first pickleball stats tracker for live courtside scoring, leaderboards, and player stats.

**Stack:** Next.js (App Router) · Supabase · Vercel · Tailwind CSS

---

## What It Does

- Groups access via shareable URL: `/g/{join_code}`
- No login required — trust-based, courtside-optimized
- Record doubles games in < 12 seconds on mobile
- Automatic deduplication across devices
- Session leaderboards + all-time and 30-day stats
- Immutable game history, Elo-ready data model

---

## Quick Links

| | |
|---|---|
| 📋 [Product Spec](./SPEC.md) | Full feature specification v1.3 |
| 🗺️ [Build Plan](./BUILD_PLAN.md) | 6-milestone roadmap |
| 🔄 [Changelog](./CHANGELOG.md) | Milestone-by-milestone history |

### Developer Docs

| | |
|---|---|
| 🚀 [How to Run Locally](./docs/how-to-run.md) | Dev setup, env vars, common commands |
| ☁️ [How to Deploy](./docs/how-to-deploy.md) | Vercel setup, env vars, redeploy steps |
| 🗄️ [How to Update Schema](./docs/how-to-update-schema.md) | Supabase SQL guide, RLS reference |
| 🧠 [Decisions](./docs/decisions.md) | Architecture decisions + rationale |
| 🧪 [Testing](./docs/testing.md) | Manual test checklist by screen |
| 📝 [Assumptions](./docs/assumptions.md) | Recorded ambiguities and resolutions |

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

```
/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # / → Enter Group Code
│   │   └── g/[join_code]/
│   │       └── page.tsx         # /g/{code} → Group dashboard
│   └── lib/
│       └── supabase/
│           └── client.ts        # Supabase anon client
├── supabase/
│   └── schema.sql               # Full DB schema (source of truth)
├── docs/                        # Developer documentation
├── .env.example                 # Env var template (no secrets)
├── SPEC.md                      # Product specification
├── BUILD_PLAN.md                # Milestone roadmap
└── CHANGELOG.md                 # Change history
```

---

## Milestone Status

| Milestone | Description | Status |
|---|---|---|
| 0 | Project Setup | ✅ Complete |
| 1 | Group Access & Dashboard Shell | ✅ Complete |
| 2 | Players & Device Identity | 🔜 Pending |
| 3 | Sessions | 🔜 Pending |
| 4 | Record Game | 🔜 Pending |
| 5 | Leaderboards & Stats | 🔜 Pending |
| 6 | Polish & Acceptance Criteria | 🔜 Pending |

---

## Key Design Principles

- **Zero friction** — the whole point is courtside speed
- **Immutable records** — games cannot be edited or deleted
- **Cross-device duplicate prevention** — via deterministic `dedupe_key` + DB unique constraint
- **No auth** — trust-based group model; device identity via localStorage only
- **Elo-ready** — full chronological game data stored; rating engine can be added without schema changes
