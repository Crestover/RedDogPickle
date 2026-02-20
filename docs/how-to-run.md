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

# Supabase service role key — NEVER expose to the browser
# Used only in Server Actions for privileged writes (e.g., ending a session)
# (from: Project Settings → API → service_role)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
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

> `type-check` script must be added to `package.json` manually: `"type-check": "tsc --noEmit"`

---

## Environment Variable Reference

| Variable | Required | Exposed to Browser | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | Anon key for client-side reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **No** | Service role for server-side privileged writes |

---

## Troubleshooting

**"Module not found: @supabase/supabase-js"**
→ Run `npm install` again.

**Supabase returns 401 / permission denied**
→ Check that your `.env.local` values match the Supabase dashboard exactly. Restart the dev server after any `.env.local` change.

**RLS blocks an insert**
→ Anon key only has SELECT and INSERT. If you're trying to UPDATE (e.g., end a session), the operation must go through a Server Action using `SUPABASE_SERVICE_ROLE_KEY`.

**Port 3000 already in use**
→ `npm run dev -- -p 3001` to use a different port.
