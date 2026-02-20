# Setup Guide — RedDog Pickle MVP

## Prerequisites
- Node.js 18+
- Git
- GitHub account
- Vercel account (free tier is fine)
- Supabase account (free tier is fine)

---

## Step 1: Initialize Git Repo

```bash
cd RedDogPickle
git init
git add .
git commit -m "Initial commit: spec, build plan, schema"
```

---

## Step 2: Create GitHub Repo and Push

1. Go to https://github.com/new
2. Name the repo (e.g. `reddogpickle`), set to private if desired
3. Do NOT initialize with README (you already have files)
4. Copy the remote URL shown, then run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/reddogpickle.git
git branch -M main
git push -u origin main
```

---

## Step 3: Initialize Next.js App

From inside the project directory:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Accept defaults. This overwrites only the generated files; your existing files (SPEC.md, BUILD_PLAN.md, etc.) are not removed.

Commit after creation:

```bash
git add .
git commit -m "Initialize Next.js app with App Router, TypeScript, Tailwind"
git push
```

---

## Step 4: Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click **New project**
3. Choose a name (e.g. `reddogpickle`) and a strong database password — **save this password somewhere safe**
4. Select the region closest to your users
5. Wait for the project to provision (~1 minute)

### Apply the SQL Schema

1. In the Supabase dashboard, go to **SQL Editor**
2. Click **New query**
3. Paste the entire contents of `supabase/schema.sql`
4. Click **Run**
5. Verify all tables appear in **Table Editor**

### Collect Supabase Credentials

Go to **Project Settings → API**. You need:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon public" key |
| `SUPABASE_SERVICE_ROLE_KEY` | "service_role" key (keep secret) |

---

## Step 5: Connect to Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository** → select your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Leave build settings as defaults
5. Click **Deploy** (first deploy may fail without env vars — that's OK)

---

## Step 6: Set Environment Variables

### In Vercel

1. Go to your project on Vercel → **Settings → Environment Variables**
2. Add all three variables for **Production**, **Preview**, and **Development**:

```
NEXT_PUBLIC_SUPABASE_URL      = https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
SUPABASE_SERVICE_ROLE_KEY     = eyJ...
```

3. After adding, go to **Deployments** and click **Redeploy** on the latest deployment

### Locally

Create `.env.local` in the project root (this file is git-ignored):

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Run locally to verify:

```bash
npm run dev
```

---

## Step 7: Install Supabase Client

```bash
npm install @supabase/supabase-js
```

Create `src/lib/supabase/client.ts` (browser client):

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Create `src/lib/supabase/server.ts` (server client, uses service role for mutations):

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

> Note: The service role key bypasses RLS. Use it only in Server Actions / Route Handlers, never in client components.

---

## Step 8: Verify End-to-End

1. Run `npm run dev`
2. Open http://localhost:3000
3. In browser console, confirm no Supabase connection errors
4. In Supabase SQL Editor, run:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables: `game_players`, `games`, `groups`, `players`, `session_players`, `sessions`

---

## .gitignore Reminders

Ensure these are present in `.gitignore` (create-next-app adds them automatically):

```
.env.local
.env*.local
node_modules/
.next/
```
