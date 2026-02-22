# RedDogPickle — Current File Map

This reflects the active project structure based on current build output, routes, migrations, and Supabase integration.

---

## Root
RedDogPickle/
│
├── .env.local
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
│
├── BUILD_PLAN.md
├── SETUP_GUIDE.md
├── SPEC.md
├── CHANGELOG.md
│
├── supabase/
│ ├── schema.sql
│ └── migrations/
│ ├── m1_initial_schema.sql
│ ├── m2_create_session.sql
│ ├── m3_add_players.sql
│ ├── m4_record_game.sql
│ └── m4.1_duplicate_warn.sql
│
└── src/
├── lib/
│ └── supabaseClient.ts
│
├── app/
│ ├── globals.css
│ ├── layout.tsx
│ ├── page.tsx
│ ├── not-found.tsx
│
│ ├── actions/
│ │ └── games.ts
│ │
│ └── g/
│ └── [join_code]/
│ ├── page.tsx
│ ├── start/
│ │ └── page.tsx
│ ├── sessions/
│ │ └── page.tsx
│ ├── players/
│ │ └── new/
│ │ └── page.tsx
│ └── session/
│ └── [session_id]/
│ ├── page.tsx
│ └── RecordGameForm.tsx


---

# File Responsibilities

## Root-Level Config

### package.json
- Dependency definitions
- Next.js + Supabase + Tailwind
- Scripts:
  - dev
  - build
  - start

### next.config.ts
- Next.js configuration

### tsconfig.json
- TypeScript config
- Strict mode enabled

### tailwind.config.ts
- Tailwind theme
- Mobile-first styling

### postcss.config.js
- Tailwind + autoprefixer

---

# Supabase Folder

## supabase/schema.sql
Canonical database schema:
- groups
- players
- sessions
- session_players
- games
- game_players
- RLS policies

## supabase/migrations/

### m1_initial_schema.sql
- Core tables

### m2_create_session.sql
- Session creation RPC
- Session-player linking

### m3_add_players.sql
- Player creation
- Session attendee logic

### m4_record_game.sql
- Initial record_game RPC

### m4.1_duplicate_warn.sql
- p_force parameter
- Duplicate warning logic
- Fingerprint hashing

---

# src/lib

## supabaseClient.ts
- Initializes Supabase client
- Uses:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
- Exported for server/client use

---

# src/app (Next.js App Router)

## layout.tsx
- Root layout
- Global Tailwind styles

## globals.css
- Tailwind base
- No inline CSS allowed

## page.tsx
- Landing screen
- Enter group code
- Navigate to `/g/[join_code]`

## not-found.tsx
- Custom 404

---

# src/app/actions

## games.ts
Server Actions:
- recordGameAction()
- Calls Supabase RPC `record_game`
- Handles:
  - inserted
  - possible_duplicate
- Controls duplicate override flow

---

# src/app/g/[join_code]

## page.tsx
Group Home
- Detect active session
- Show:
  - Continue Session
  - Start Session
  - Leaderboard (placeholder)

---

## start/page.tsx
- Multi-select session attendees
- Calls create_session RPC

---

## sessions/page.tsx
- Historical sessions list
- Sorted by date

---

## players/new/page.tsx
- Add new player
- Insert into players table
- Associate to group

---

# src/app/g/[join_code]/session/[session_id]

## page.tsx
Session View
- Displays:
  - RecordGameForm
  - Games list
  - Team A vs Team B
  - Winning team highlight
- Enforces:
  - 4-hour rule
  - Active session validation
- Handles duplicate confirmation UI

## RecordGameForm.tsx
- Team selection dropdown/buttons
- Score input fields
- Submit action
- Duplicate confirmation state
- Calls recordGameAction()

---

# Runtime Build Artifacts (Generated)

.next/


- DO NOT COMMIT
- Dev + build cache
- Known Windows/OneDrive sensitivity

---

# Key Architectural Boundaries

## Frontend Responsibilities
- UI
- Session state rendering
- Duplicate confirmation UX
- Mobile-first design

## Backend Responsibilities
- All scoring validation
- All atomic writes
- Duplicate detection
- Session expiration enforcement

No client-side trust for game insertion.

---

# Environment Variables (Required)

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY


---

# Deployment Target

- Vercel
- Supabase Postgres
- pgcrypto extension enabled

---

END OF FILE MAP
