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
│   │   ├── layout.tsx                           # Root layout
│   │   ├── page.tsx                             # / → Enter Group Code
│   │   ├── actions/
│   │   │   ├── sessions.ts                      # createSessionAction, endSessionAction
│   │   │   ├── players.ts                       # addPlayerAction
│   │   │   └── games.ts                         # recordGameAction
│   │   └── g/[join_code]/
│   │       ├── page.tsx                         # Dashboard (state-aware)
│   │       ├── start/
│   │       │   ├── page.tsx                     # Start Session (server)
│   │       │   └── StartSessionForm.tsx         # Attendee selector (client)
│   │       ├── players/new/
│   │       │   ├── page.tsx                     # Add Player (server)
│   │       │   └── AddPlayerForm.tsx            # Name + code form (client)
│   │       ├── leaderboard/
│   │       │   └── page.tsx                     # Group Leaderboard (all-time / 30d / last)
│   │       ├── sessions/
│   │       │   └── page.tsx                     # Session History list
│   │       └── session/[session_id]/
│   │           ├── page.tsx                     # Session view + game list
│   │           ├── EndSessionButton.tsx         # Two-tap end button (client)
│   │           ├── RecordGameForm.tsx           # 3-step game entry (client)
│   │           └── SessionStandings.tsx        # Collapsible standings (client)
│   └── lib/
│       ├── suggestCode.ts                       # Pure util: initials → player code
│       └── supabase/
│           └── client.ts                        # Supabase anon client
├── supabase/
│   ├── schema.sql                               # Full DB schema (source of truth)
│   └── migrations/
│       ├── m2_rpc_sessions.sql                  # M2 delta: constraint + 2 RPCs
│       ├── m4_record_game.sql                   # M4 delta: record_game RPC
│       ├── m4.1_duplicate_warn.sql              # M4.1 delta: warn-and-confirm
│       ├── m5_group_leaderboards.sql            # M5 delta: view + session/group stats RPCs
│       └── m5.1_last_session_standings.sql     # M5.1 delta: extended session stats + last session RPC
├── docs/                                        # Developer documentation
├── .env.example                                 # Env var template (no secrets)
├── SPEC.md                                      # Product specification
├── BUILD_PLAN.md                                # Milestone roadmap
└── CHANGELOG.md                                 # Change history
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
| 6 | Polish & Acceptance Criteria | 🔜 Pending |

---

## Key Design Principles

- **Zero friction** — the whole point is courtside speed
- **Immutable records** — games cannot be edited or deleted
- **Cross-device duplicate prevention** — via deterministic `dedupe_key` + DB unique constraint
- **No auth** — trust-based group model; device identity via localStorage only
- **Elo-ready** — full chronological game data stored; rating engine can be added without schema changes
