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
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Production, Preview, Development |

> **Where to find these:** Supabase Dashboard → your project → Project Settings → API

4. Click **Save** after each variable

---

### 3. Redeploy

After setting environment variables:

1. Go to **Deployments** tab in Vercel
2. Click the three-dot menu on the latest deployment
3. Click **Redeploy**

Or push any commit to `main` to trigger a new deployment automatically.

---

## Ongoing Deployments

Every push to the `main` branch automatically triggers a new production deployment on Vercel.

Every push to any other branch creates a **Preview deployment** with a unique URL — useful for testing features before merging.

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
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ |

Keep both in sync. Changes to Vercel env vars require a redeploy to take effect.

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
