# Architecture & Design Decisions

This file records every significant decision made during the build, along with the reasoning. Updated at each milestone.

---

## Milestone 0 — Project Setup

### D-001: Framework — Next.js App Router
**Decision:** Use Next.js 14+ with the App Router (not Pages Router).
**Why:** App Router enables React Server Components, which allows us to fetch Supabase data server-side with zero client bundle cost. This is important for the mobile <2s render target. The App Router is also the current Next.js default and the direction for future development.

---

### D-002: Database — Supabase (Postgres)
**Decision:** Use Supabase as the database and API layer.
**Why:** Supabase provides Postgres with a REST/realtime API, Row Level Security, and a generous free tier. It eliminates the need to run a separate API server for MVP. The `dedupe_key` unique constraint works reliably in Postgres and provides cross-device duplicate prevention without coordination logic.

---

### D-003: No Authentication
**Decision:** No login, no user accounts.
**Why:** SPEC explicitly requires zero-friction courtside usage. Authentication adds friction. Trust is assumed within a group. Device identity via localStorage is sufficient for attribution only (not permission control).

---

### D-004: RLS — SELECT + INSERT Only on Anon Key
**Decision:** Row Level Security policies only permit SELECT and INSERT for the Supabase anon key. UPDATE is not permitted via the anon key.
**Why:** Games are immutable in the MVP. Sessions can only be ended (their `ended_at` set) by server-side code using the service role key, which bypasses RLS. This prevents any client-side mutation of existing records while keeping the architecture simple (no triggers, no complex policies).

---

### D-005: Session End via Service Role Only
**Decision:** The only UPDATE operation in the system — setting `sessions.ended_at` — is performed exclusively via a Next.js Server Action using the `SUPABASE_SERVICE_ROLE_KEY`.
**Why:** Keeps the anon key truly read/insert only. The service role key is never exposed to the browser. This enforces immutability of game records at the database layer without needing DB-level triggers.

---

### D-006: Dedupe Key Design
**Decision:** `dedupe_key` is a SHA-256 hash computed server-side before insert, encoding: `session_id + sorted Team A player IDs + sorted Team B player IDs + team_a_score + team_b_score + 10-minute time bucket`.
**Why:** Deterministic and collision-resistant across devices. The unique constraint on `(session_id, dedupe_key)` at the DB layer means duplicate rejection works even when two devices submit simultaneously. No coordination needed.

---

### D-007: Application-Level Score Validation
**Decision:** Score rules (winner >= 11, winner − loser >= 2) are enforced in server-side code (Server Actions), not as DB CHECK constraints.
**Why:** These are game rules, not data integrity rules. They could change (e.g., win-by-1 tiebreaker games). Keeping them in application code makes them easy to adjust without a schema migration.

---

### D-008: Exactly-4-Players Constraint in App Layer
**Decision:** The rule "exactly 4 players per game, exactly 2 per team" is enforced in the Server Action, not in SQL.
**Why:** SQL CHECK constraints cannot easily count rows in a related table without triggers. A trigger would add fragility and make the schema harder to reason about. The Server Action performs this validation before constructing the insert, making it clear and testable.

---

### D-009: Hosting — Vercel
**Decision:** Deploy to Vercel.
**Why:** Vercel has native Next.js support, zero-config deployments from GitHub, free tier covers MVP usage, and Server Actions work out of the box.

---

### D-010: Styling — Tailwind CSS
**Decision:** Use Tailwind CSS for all styling.
**Why:** Tailwind ships zero unused CSS in production, works well with mobile-first responsive design, and is the default in the Next.js create template. It enforces the 44px tap target requirement through utility classes.

---

### D-011: join_code Stored as Lowercase
**Decision:** `join_code` is stored in the database in lowercase only (enforced by a regex CHECK constraint `^[a-z0-9\-]+$`). The application lowercases any user input before lookup.
**Why:** SPEC says join_code is case-insensitive. Storing canonical lowercase avoids case-sensitivity bugs at the DB level without needing a `LOWER()` index or `ILIKE` queries.

---

### D-012: Documentation as First-Class Deliverable
**Decision:** Every milestone must update `/docs` with decisions, run guide, deploy guide, schema guide, testing checklist, and assumptions. A `CHANGELOG.md` and `README.md` are maintained throughout.
**Why:** The project owner requires this. It also makes onboarding, debugging, and future development faster.

---

## Milestone 1 — Group Access & Device Identity

### D-013: Server Component for Group Lookup
**Decision:** `/g/[join_code]` is a Next.js Server Component that queries Supabase directly on the server using the anon key. No client-side fetch or `useEffect`.
**Why:** Server Components render on the server and stream HTML to the client, giving the fastest possible first paint on mobile (no JS waterfall for data). The anon key is safe to use server-side — it doesn't need to be hidden from the server, only from client bundles where it is already `NEXT_PUBLIC_`.

### D-014: join_code Lowercased at Route Entry
**Decision:** The `join_code` URL param is lowercased before the Supabase query (`.toLowerCase()`). This is the single point of case normalization.
**Why:** The DB stores join_codes in lowercase (schema constraint `^[a-z0-9\-]+$`). Lowercasing at query time means `/g/RED-DOGS` and `/g/red-dogs` both work correctly without extra DB indexes.

### D-015: Supabase Client in Milestone 1 Uses Anon Key Only
**Decision:** `src/lib/supabase/client.ts` exports a single client built from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No service role key in the browser client.
**Why:** The service role key bypasses RLS and must never be exposed to the browser. All privileged writes (session end) happen in Server Actions in later milestones. The browser client only needs anon access.

### D-016: Action Buttons Disabled in Milestone 1 (Scaffolding Only)
**Decision:** "Start Session" and "Leaderboard" buttons render as disabled in Milestone 1 with a `title` attribute explaining they are coming in later milestones.
**Why:** The milestone scope explicitly excludes session creation and game recording. Rendering the buttons as disabled (rather than not rendering them) establishes the correct layout and tap-target sizes for mobile early, making Milestone 2 integration a simple un-disable + wire-up.

### D-TODO-M2: Active Session Detection Deferred → RESOLVED as D-017

---

## Milestone 2 — Sessions (RPC-based)

### D-017: Active Session Detection via Server-Side Query (Resolves D-TODO-M2)
**Decision:** The group dashboard queries the `sessions` table on the server at page-load time to find the most recent active session (`ended_at IS NULL AND started_at >= now() - 4 hours`). Result drives the "Start Session" vs. "Continue Session" state.
**Why:** Server Component fetch keeps the page fast (no client-side data waterfall). The query is simple and cheap — one row, indexed on `(group_id, started_at desc)`. The 4-hour window is evaluated in the application using `Date.now()` converted to ISO string for the `.gte()` filter, matching the SPEC §5.1 definition exactly.

### D-018: Session Creation via SECURITY INVOKER RPC (`create_session`)
**Decision:** Session creation uses a Postgres RPC function (`create_session`) with `SECURITY INVOKER`. The function atomically inserts the session row and all `session_players` rows, builds the session label, and returns the new session UUID.
**Why:** Atomicity — both inserts happen in a single function call, eliminating the race condition where a session could exist without attendees. `SECURITY INVOKER` means the function runs as the anon role, so existing INSERT RLS policies apply. No service role key needed for session creation.

### D-019: Session End via SECURITY DEFINER RPC (`end_session`)
**Decision:** Session ending uses a Postgres RPC function (`end_session`) with `SECURITY DEFINER` and `search_path = public`. The function sets `ended_at = now()` and `closed_reason = 'manual'`. It is callable by the anon key.
**Why:** There is no anon UPDATE RLS policy on `sessions` (by design — games are immutable, session end must be deliberate). `SECURITY DEFINER` allows the function to execute the UPDATE while running as the function owner (postgres), bypassing RLS. `search_path = public` is pinned as a Supabase security best practice to prevent search-path injection attacks. The anon key can call the function via `supabase.rpc()` — the grant statement enables this.

### D-020: No Service Role Key in Milestone 2
**Decision:** The `SUPABASE_SERVICE_ROLE_KEY` is not used in Milestone 2. Both RPCs are callable with the anon key. The server actions use `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.
**Why:** The RPC design (D-018, D-019) eliminates the need for the service role key in this milestone. This keeps the env var surface minimal and reduces risk. The service role key may be added in a future milestone if needed.

### D-021: End Session UX — Two-Tap Confirmation
**Decision:** The "End Session" button requires two taps: the first tap changes it to "Confirm End Session" (red); the second tap executes the action. A "Cancel" link appears between taps.
**Why:** Ending a session is irreversible in the MVP (no re-open). A single accidental tap courtside would be frustrating. Two taps with a cancel path prevents accidental endings while remaining fast (no modal/dialog needed).

### D-022: join_code Lowercase Enforced at Both App and DB Layer
**Decision:** In addition to the existing regex constraint (`^[a-z0-9\-]+$`), a new CHECK constraint (`join_code = lower(join_code)`) is added to `public.groups`. Existing rows are normalized before the constraint is applied.
**Why:** Belt-and-suspenders: the regex already implied lowercase, but an explicit equality check makes the DB reject mixed-case inserts even if the regex were accidentally changed. The migration normalizes any pre-existing rows so the constraint addition does not fail.
