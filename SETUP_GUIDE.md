# Setup Guide — RedDog Pickle MVP

> **Platform:** Windows 11 · PowerShell 7+ · All commands are PowerShell unless noted.

---

## Prerequisites

Install these before starting. Verify each with the command shown.

### Node.js 18+
Download: https://nodejs.org/en/download (choose "Windows Installer (.msi) — LTS")

Verify:
```powershell
node --version   # expect: v18.x.x or higher
npm --version    # expect: 9.x.x or higher
```

### Git
Download: https://git-scm.com/download/win (choose "64-bit Git for Windows Setup")

During install, choose:
- Default editor: your preference (VS Code recommended)
- "Override the default branch name" → type `main`
- All other defaults are fine

Verify:
```powershell
git --version    # expect: git version 2.x.x.windows.x
```

### Accounts needed
- GitHub: https://github.com/signup
- Vercel: https://vercel.com/signup (sign up with GitHub — easiest)
- Supabase: https://supabase.com/dashboard/sign-up

---

## Step 1: Open PowerShell in the Project Folder

```
RIGHT-CLICK the RedDogPickle folder in File Explorer
→ "Open in Terminal"
   (or: "Open PowerShell window here")
```

Confirm you're in the right place:
```powershell
Get-Location
# Should print something like: C:\Users\YourName\...\RedDogPickle
```

---

## Step 2: Initialize Git Repo

```powershell
git init
git add .
git commit -m "Initial commit: spec, build plan, schema, docs"
```

Expected output after commit:
```
[main (root-commit) abc1234] Initial commit: spec, build plan, schema, docs
 N files changed, ...
```

---

## Step 3: Create GitHub Repo and Push

### 3a. Create the repo on GitHub

```
BROWSER → https://github.com/new

  Repository name:  reddogpickle
  Description:      Pickleball stats tracker (optional)
  Visibility:       ● Private   (recommended)
                    ○ Public

  ┌─────────────────────────────────────────────────────┐
  │  Initialize this repository with:                   │
  │  [ ] Add a README file          ← LEAVE UNCHECKED   │
  │  [ ] Add .gitignore             ← LEAVE UNCHECKED   │
  │  [ ] Choose a license           ← LEAVE UNCHECKED   │
  └─────────────────────────────────────────────────────┘

  → Click [Create repository]
```

### 3b. Copy the remote URL

After creating, GitHub shows a "Quick setup" page:
```
  ┌─────────────────────────────────────────────────────────────────┐
  │  Quick setup — if you've done this kind of thing before         │
  │                                                                  │
  │  HTTPS   SSH                                                     │
  │  [HTTPS selected]                                                │
  │                                                                  │
  │  https://github.com/YOUR_USERNAME/reddogpickle.git   [copy icon]│
  └─────────────────────────────────────────────────────────────────┘
```

Click the **copy icon** next to the HTTPS URL.

### 3c. Push from PowerShell

Replace `YOUR_USERNAME` with your actual GitHub username:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/reddogpickle.git
git branch -M main
git push -u origin main
```

Expected output:
```
Enumerating objects: N, done.
Counting objects: 100% (N/N), done.
...
To https://github.com/YOUR_USERNAME/reddogpickle.git
 * [new branch]      main -> main
branch 'main' set up to track 'remote branch 'main' from 'origin'.
```

> **If prompted for credentials:** GitHub no longer accepts passwords over HTTPS. Use a Personal Access Token (PAT):
> ```
> BROWSER → https://github.com/settings/tokens
> → Tokens (classic) → Generate new token (classic)
>   Note: reddogpickle-push
>   Expiration: 90 days
>   Scopes: ✅ repo  (check the top-level "repo" box)
> → Generate token → COPY IT NOW (shown only once)
> ```
> When PowerShell asks for your password, paste the PAT token instead.

---

## Step 4: Initialize Next.js App

Still in PowerShell inside the project folder:

```powershell
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

You will be asked several questions. Answer exactly as shown:
```
✔ Would you like to use TypeScript?          › Yes
✔ Would you like to use ESLint?              › Yes
✔ Would you like to use Tailwind CSS?        › Yes
✔ Would you like your code inside a `src/` directory?  › Yes
✔ Would you like to use App Router?          › Yes
✔ Would you like to use Turbopack for `next dev`?      › No   ← choose No for stability
✔ Would you like to customize the import alias?        › Yes
✔ What import alias would you like configured?         › @/*
```

> Your existing files (SPEC.md, BUILD_PLAN.md, docs/, supabase/) are not removed — `create-next-app` only creates new files.

Commit the scaffolding:

```powershell
git add .
git commit -m "Initialize Next.js app with App Router, TypeScript, Tailwind"
git push
```

---

## Step 5: Create Supabase Project

### 5a. Create the project

```
BROWSER → https://supabase.com/dashboard

  → Click [New project]

  ┌──────────────────────────────────────────────────┐
  │  Create a new project                            │
  │                                                  │
  │  Organization:    (your org or personal)         │
  │  Name:            reddogpickle                   │
  │  Database Password: ████████████  [Generate]     │
  │                    ↑ Click Generate, SAVE THIS   │
  │  Region:          (pick closest to your users)   │
  │  Pricing plan:    Free                           │
  │                                                  │
  │  → Click [Create new project]                   │
  └──────────────────────────────────────────────────┘

  Wait ~60 seconds for provisioning.
  You'll see: "Your project is ready."
```

### 5b. Apply the SQL schema

```
BROWSER → Supabase dashboard → your project

  LEFT SIDEBAR:
  ┌─────────────────────────────┐
  │  🏠 Home                    │
  │  📊 Table Editor            │
  │  🔍 SQL Editor          ←   │  ← CLICK THIS
  │  🔐 Authentication          │
  │  📦 Storage                 │
  │  ⚙️  Project Settings       │
  └─────────────────────────────┘

  → In SQL Editor, click [+ New query]  (top-left of the editor area)

  ┌─────────────────────────────────────────────────────┐
  │  SQL Editor                        [+ New query]    │
  │  ─────────────────────────────────────────────────  │
  │  Untitled query                                     │
  │  ┌───────────────────────────────────────────────┐  │
  │  │                                               │  │
  │  │  (paste your SQL here)                        │  │
  │  │                                               │  │
  │  └───────────────────────────────────────────────┘  │
  │                                        [▶ Run]       │
  └─────────────────────────────────────────────────────┘
```

**Open `supabase/schema.sql` in VS Code, select all (`Ctrl+A`), copy (`Ctrl+C`).**

Paste into the Supabase SQL editor (`Ctrl+V`), then click **[▶ Run]**.

Expected result panel at the bottom:
```
  Results
  ────────────────────────────────
  Success. No rows returned.
```

### 5c. Verify tables were created

```
LEFT SIDEBAR → 📊 Table Editor

  You should see these tables listed on the left:
  ┌──────────────────┐
  │  game_players    │
  │  games           │
  │  groups          │
  │  players         │
  │  session_players │
  │  sessions        │
  └──────────────────┘
```

If any table is missing, re-run the schema SQL. The statements use `CREATE TABLE` (not `CREATE TABLE IF NOT EXISTS`) so running twice on an already-provisioned DB will error — that's safe to ignore.

### 5d. Collect Supabase credentials

```
LEFT SIDEBAR → ⚙️ Project Settings → API

  ┌─────────────────────────────────────────────────────────────────┐
  │  Project Settings > API                                         │
  │                                                                 │
  │  Project URL                                                    │
  │  ┌────────────────────────────────────┐  [Copy]                 │
  │  │ https://xxxxxxxxxxxx.supabase.co   │                         │
  │  └────────────────────────────────────┘                         │
  │        ↑ This is NEXT_PUBLIC_SUPABASE_URL                       │
  │                                                                 │
  │  Project API Keys                                               │
  │                                                                 │
  │  anon  public                                                   │
  │  ┌────────────────────────────────────┐  [Copy]                 │
  │  │ eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp... │                         │
  │  └────────────────────────────────────┘                         │
  │        ↑ This is NEXT_PUBLIC_SUPABASE_ANON_KEY                  │
  │                                                                 │
  │  service_role  secret                                           │
  │  ┌────────────────────────────────────┐  [Copy]  [Reveal]       │
  │  │ ••••••••••••••••••••••••••••••••• │                         │
  │  └────────────────────────────────────┘                         │
  │        ↑ This is SUPABASE_SERVICE_ROLE_KEY                      │
  │          Click [Reveal] first, then [Copy]                      │
  │          ⚠️  Never commit this key. Never use NEXT_PUBLIC_.    │
  └─────────────────────────────────────────────────────────────────┘
```

Save all three values — you'll need them in Steps 6 and 7.

---

## Step 6: Connect to Vercel

### 6a. Import the GitHub repo

```
BROWSER → https://vercel.com/new

  → Under "Import Git Repository":
    → Click [Continue with GitHub]  (authorize if prompted)
    → Find "reddogpickle" in the list
    → Click [Import]

  ┌──────────────────────────────────────────────────────┐
  │  Configure Project                                   │
  │                                                      │
  │  Framework Preset:   Next.js          (auto-detected)│
  │  Root Directory:     ./              (leave as-is)   │
  │  Build Command:      next build      (leave as-is)   │
  │  Output Directory:   .next           (leave as-is)   │
  │  Install Command:    npm install     (leave as-is)   │
  │                                                      │
  │  Environment Variables  ← ADD THEM HERE (see 6b)    │
  │                                                      │
  │  → Click [Deploy]                                   │
  └──────────────────────────────────────────────────────┘
```

> The first deploy may fail — that's OK if you skip env vars now. You'll add them in Step 7 and redeploy.

---

## Step 7: Set Environment Variables

### 7a. In Vercel

```
BROWSER → https://vercel.com/dashboard
  → Click your project "reddogpickle"
  → Click [Settings] tab (top navigation)

  LEFT SIDEBAR:
  ┌─────────────────────────────┐
  │  General                    │
  │  Domains                    │
  │  Environment Variables  ←   │  ← CLICK THIS
  │  Git                        │
  │  Integrations               │
  │  ...                        │
  └─────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │  Environment Variables                                           │
  │                                                                  │
  │  Key                          Value                              │
  │  ┌──────────────────────┐  ┌────────────────────────────────┐   │
  │  │ NEXT_PUBLIC_SUPA...  │  │ https://xxxxxxxxxxxx.supa...   │   │
  │  └──────────────────────┘  └────────────────────────────────┘   │
  │                                                                  │
  │  Environments:  ✅ Production  ✅ Preview  ✅ Development        │
  │                                                                  │
  │  → Click [Add]   ← repeat for each of the 3 variables           │
  └──────────────────────────────────────────────────────────────────┘
```

Add these three variables, checking **all three environment checkboxes** for each:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service role key) |

After adding all three:
```
  → Click [Deployments] tab
  → Find the most recent deployment
  → Click the ••• (three-dot) menu on the right
  → Click [Redeploy]
  → Click [Redeploy] in the confirmation dialog
```

### 7b. Locally (`.env.local`)

In PowerShell, in the project folder:

```powershell
# Create the file (PowerShell here-string)
@"
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
"@ | Out-File -FilePath .env.local -Encoding utf8
```

> Or open VS Code and create `.env.local` manually — paste the three lines and save.

**Verify `.env.local` is git-ignored:**
```powershell
git status
# .env.local should NOT appear in the output.
# If it does: Add ".env.local" to your .gitignore, then run: git rm --cached .env.local
```

---

## Step 8: Install Supabase Client & Verify

### 8a. Install the package

```powershell
npm install @supabase/supabase-js
```

### 8b. Start dev server

```powershell
npm run dev
```

Expected:
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Environments: .env.local

  ✓ Starting...
  ✓ Ready in Xs
```

Open http://localhost:3000 in your browser. The default Next.js page should load with no console errors.

### 8c. Verify schema in Supabase

```
BROWSER → Supabase dashboard → SQL Editor → New query

Paste and run:
```

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected results:
```
  table_name
  ──────────────────
  game_players
  games
  groups
  players
  session_players
  sessions
```

All 6 tables present = setup complete. ✅

---

## Step 9: Commit & Push Final State

```powershell
git add .
git commit -m "Add Supabase client package"
git push
```

Vercel will automatically deploy the new commit to production.

---

## Quick Reference: PowerShell Commands

| Task | Command |
|---|---|
| Start dev server | `npm run dev` |
| Production build | `npm run build` |
| Run linter | `npm run lint` |
| Check TypeScript | `npx tsc --noEmit` |
| Install a package | `npm install <package>` |
| Git status | `git status` |
| Stage all changes | `git add .` |
| Commit | `git commit -m "message"` |
| Push to GitHub | `git push` |
| Pull latest | `git pull` |

---

## Troubleshooting

### PowerShell: "running scripts is disabled"
```powershell
# Run this once, in an Administrator PowerShell window:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### `npx` command not found
Make sure Node.js is installed and its folder is in your PATH. Restart PowerShell after installing Node.

### Git push asks for credentials
Use a GitHub Personal Access Token as your password (see Step 3c). Never use your GitHub account password.

### `.env.local` changes not taking effect
Restart the dev server (`Ctrl+C` then `npm run dev`). Next.js only reads env vars at startup.

### Supabase: "relation does not exist"
The schema wasn't applied, or was applied to the wrong project. Re-run `supabase/schema.sql` in the SQL Editor for the correct project.

### Vercel deploy still shows old version
After adding env vars, you must manually redeploy: Vercel Dashboard → Deployments → ••• → Redeploy.
