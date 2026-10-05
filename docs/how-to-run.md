# How to Run Locally

## Prerequisites
| Tool | Minimum Version |
|---|---|
| Node.js | 18.x |
| npm | 9.x |
| Git | any recent |

---

## 1. Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/reddogpickle.git
cd reddogpickle
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Configure Environment Variables

Create a file named `.env.local` in the project root. **This file is git-ignored and must never be committed.**

```bash
# .env.local

# Supabase project URL (from: Project Settings → API → Project URL)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co

# Supabase anon (public) key — safe to expose to the browser
# (from: Project Settings → API → anon public)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Site URL — absolute URL for OG/Twitter images and the canonical link (no trailing slash)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Supabase service role key — NEVER expose to the browser
# Used only by the admin panel's server actions for privileged writes
# (create group, hide/unhide and edit players)
# (from: Project Settings → API → service_role / secret key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Admin panel (/rd-admin) — shared password and cookie-signing secret.
# Use any values locally; generate a long random ADMIN_SESSION_SECRET
# (e.g. `openssl rand -hex 32`). Not needed unless you open /rd-admin.
ADMIN_PASSWORD=choose-a-password
ADMIN_SESSION_SECRET=a-long-random-string
```

> **Where to get these values:** Supabase Dashboard → your project → Project Settings → API

---

## 4. Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Common Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Run production build locally |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type checker without emitting |
| `npm test` / `npx vitest run` | Run the unit test suite (279 tests across 21 files as of v0.9.0) |
| `npm run test:integration` | SQL/RPC integration tests (needs a real Supabase project in `.env.local`) |

---

## Environment Variable Reference

| Variable | Required | Exposed to Browser | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | Anon key for client-side reads |
| `NEXT_PUBLIC_SITE_URL` | No | Yes | Absolute site URL for OG/Twitter images and canonical link (defaults to `http://localhost:3000`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for `/rd-admin` | **No** | Service role for the admin panel's privileged writes. Each Supabase project has its own key — a dev key does not work against production |
| `ADMIN_PASSWORD` | Only for `/rd-admin` | **No** | Shared admin login password. Compared exactly (no trimming) |
| `ADMIN_SESSION_SECRET` | Only for `/rd-admin` | **No** | HMAC secret that signs the admin session cookie. Login will throw if it is missing |

If the admin panel's group list is empty or shows an error such as "Invalid API key", the service-role key does not match the project `NEXT_PUBLIC_SUPABASE_URL` points to.

---

## Troubleshooting

**"Module not found: @supabase/supabase-js"**
→ Run `npm install` again.

**Supabase returns 401 / permission denied**
→ Check that your `.env.local` values match the Supabase dashboard exactly. Restart the dev server after any `.env.local` change.

**RLS blocks an insert**
→ Anon key only has SELECT and INSERT. Anything that needs an UPDATE must go through a SECURITY DEFINER RPC (e.g. `end_session`, `void_last_game`) or, for admin-only writes, an admin server action using `SUPABASE_SERVICE_ROLE_KEY`.

**Port 3000 already in use**
→ `npm run dev -- -p 3001` to use a different port.
