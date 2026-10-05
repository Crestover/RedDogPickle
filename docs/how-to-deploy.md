# How to Deploy

This app is deployed to **Vercel** with **Supabase** as the database backend.

---

## First-Time Vercel Setup

### 1. Connect GitHub Repo to Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Authorize Vercel to access your GitHub account if prompted
4. Select the `reddogpickle` repo
5. Framework preset: **Next.js** (auto-detected)
6. Root Directory: leave as `.` (default)
7. Build command: `next build` (default)
8. Output directory: `.next` (default)
9. Click **Deploy**

> The first deploy may fail if environment variables are not yet set — that's expected. Set them in Step 2 and redeploy.

---

### 2. Set Environment Variables in Vercel

1. Go to your project on [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **Settings → Environment Variables**
3. Add each variable for **all environments** (Production, Preview, Development):

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | Production, Preview, Development |
| `NEXT_PUBLIC_SITE_URL` | Public site URL, no trailing slash (production: `https://playreddog.com`) | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key (admin panel only) | Production, Preview, Development |
| `ADMIN_PASSWORD` | Shared password for `/rd-admin` | Production, Preview |
| `ADMIN_SESSION_SECRET` | Long random string that signs the admin cookie (`openssl rand -hex 32`) | Production, Preview |

> **Where to find the Supabase values:** Supabase Dashboard → your project → Project Settings → API

> **Two Supabase projects.** Production (`main`) and Preview (`dev`) use **separate** Supabase projects, so `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must be scoped per environment and each key must come from the matching project. A dev service-role key saved under Production makes the admin panel fail with "Invalid API key". Open the project from the Supabase dashboard directly rather than through an embedded view in Vercel, so you know which project's keys you are copying.

4. Click **Save** after each variable

---

### 3. Redeploy

After setting environment variables:

1. Go to **Deployments** tab in Vercel
2. Click the three-dot menu on the latest deployment
3. Click **Redeploy**

Or push any commit to `main` to trigger a new deployment automatically.

> **Env var changes only reach a deployment created after the change.** In practice a plain Redeploy has not always picked up edited values for this project; pushing a fresh commit (an empty commit is fine: `git commit --allow-empty -m "chore: trigger deployment"`) did. After changing a variable, confirm in the new deployment that it took effect.
>
> **Check which Vercel project you are in.** If your Vercel account has more than one project, make sure the breadcrumb reads the Red Dog project (`red-dog-pickle`) before editing variables or redeploying — changes made in a different project do nothing here.

---

## Ongoing Deployments

Every push to the `main` branch automatically triggers a new production deployment on Vercel.

Every push to any other branch creates a **Preview deployment** with a unique URL — useful for testing features before merging.

### Release workflow (this project)

1. Day-to-day work happens on `dev` (Preview deployments, dev Supabase project).
2. Promote to production only on explicit go-ahead, as a fast-forward: `git push origin dev:main`.
3. Apply any new SQL migration to the **production** Supabase project **before** promoting code that depends on it (migrations are applied by hand in the SQL Editor; see [how-to-update-schema.md](./how-to-update-schema.md)).
4. Version bump checklist (only for releases, not for data corrections or copy tweaks): `package.json` → `CHANGELOG.md` → `CHANGELOG_PUBLIC.md` → `MEMORY.md`.

---

## Rollback a Deployment

1. Go to **Deployments** tab in Vercel
2. Find the last known-good deployment
3. Click the three-dot menu → **Promote to Production**

---

## Custom Domain (Optional)

1. Go to **Settings → Domains**
2. Add your custom domain
3. Follow Vercel's DNS instructions for your domain registrar

---

## Vercel Environment Variables vs Local

| Variable | Local (`.env.local`) | Vercel Dashboard |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ |
| `NEXT_PUBLIC_SITE_URL` | ✅ (localhost) | ✅ (production URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ |
| `ADMIN_PASSWORD` | ✅ (any local value) | ✅ |
| `ADMIN_SESSION_SECRET` | ✅ (any local value) | ✅ |

Keep both in sync. Changes to Vercel env vars require a new deployment to take effect (see above).

---

## Monitoring

- **Vercel Logs:** Dashboard → your project → Deployments → click a deployment → **Functions** tab for server-side logs
- **Vercel Analytics:** Enable in project settings to monitor Web Vitals (useful for the <2s mobile render target)
- **Supabase Logs:** Supabase Dashboard → Logs → API / Postgres logs for query debugging

---

## Troubleshooting Deployments

**Build fails: "Module not found"**
→ Ensure all dependencies are in `package.json` (not just `devDependencies` if used at runtime). Run `npm install` locally and commit the updated `package-lock.json`.

**500 error in production but works locally**
→ Check that all required environment variables are set in Vercel. Server-side env vars (without `NEXT_PUBLIC_` prefix) are not exposed to the browser and will be `undefined` if missing.

**RLS errors in production**
→ Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly in Vercel. Never prefix it with `NEXT_PUBLIC_`.

**Admin panel: error page mentioning `ADMIN_SESSION_SECRET` / `ADMIN_PASSWORD`**
→ The variable is missing in the deployment serving the site (wrong scope, or no new deployment since it was added).

**Admin panel: "Incorrect password."**
→ The deployment has an `ADMIN_PASSWORD`, but not the value you typed — usually a stale deployment, a stray space/newline in the stored value (the check is exact), or the variable was edited in the wrong Vercel project.

**Admin panel: group list empty or "Invalid API key"**
→ `SUPABASE_SERVICE_ROLE_KEY` belongs to a different Supabase project than `NEXT_PUBLIC_SUPABASE_URL` for that environment.
