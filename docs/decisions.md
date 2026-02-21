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

---

## Milestone 3 — Add Player & Session History

### D-023: Add Player — Code Suggestion from Initials
**Decision:** Player codes are auto-suggested in `AddPlayerForm` using the `suggestCode()` utility: first letter of each word (up to 3 words), uppercased. Single-word names use the first 3 characters. The user can override before submitting.
**Why:** Minimises typing courtside. Most players will have 2–3 word names giving natural 2–3 char codes (e.g. "John Doe" → "JDO"). The suggestion is a convenience, not a constraint — any uppercase alphanumeric string is valid.

### D-024: Code Collision Handled at Insert, Not Pre-Check
**Decision:** Code uniqueness is validated by catching the `23505` Postgres unique-constraint error on insert, not by doing a pre-check SELECT.
**Why:** A pre-check SELECT followed by an INSERT has a TOCTOU race condition — two devices could simultaneously add the same code. The DB unique constraint (`players_group_code_unique`) is the authoritative enforcement point. The error message shown to the user includes the conflicting code and prompts them to try a different one.

### D-025: Add Player Redirects to Caller via `?from=` Query Param
**Decision:** The Add Player page accepts a `?from=start` query param. When present, the success redirect goes back to `/g/{code}/start`. Otherwise it goes to `/g/{code}`. No `?from=session` variant needed in M3.
**Why:** The most common flow is: Start Session → Add Player (player is new) → back to Start Session to select them. The `?from` mechanism avoids hard-coding the back-destination in the server action and keeps the action reusable from any caller.

### D-026: Session History — No Pagination in M3
**Decision:** The Session History page fetches all sessions for the group ordered by `started_at DESC` with no pagination or limit.
**Why:** MVP usage expects small groups with infrequent sessions. A typical group might have 10–50 sessions per year. Full list is acceptable. Pagination or infinite scroll is a post-MVP enhancement.

### D-027: No Schema Changes in Milestone 3
**Decision:** Milestone 3 adds no new tables, columns, or RPC functions. All functionality is built on the existing schema.
**Why:** Add Player uses the existing `players` table (INSERT via anon RLS policy). Session History reads the existing `sessions` table (SELECT via anon RLS policy). No migration file is needed.

---

## Milestone 4 — Record Game

### D-028: Game Insert via SECURITY DEFINER RPC (`record_game`)
**Decision:** Game recording uses a Postgres RPC function (`record_game`) with `SECURITY DEFINER` and `search_path = public`. The function atomically inserts one `games` row and four `game_players` rows in a single PL/pgSQL call. Callable via the anon key.
**Why:** Atomicity requires both inserts to succeed or both fail — a two-step client insert could leave orphaned rows on network failure. `SECURITY DEFINER` is used (over `SECURITY INVOKER`) so session-liveness validation and `sequence_num` derivation are race-free and do not expose an anon UPDATE policy. Mirrors `end_session` design.

### D-029: dedupe_key is Order-Insensitive Within Teams AND Across Teams
**Decision:** Canonical dedupe_key construction:
1. Sort player UUIDs within each team → comma-joined: `team_a_str`, `team_b_str`
2. Sort the two team strings lexicographically → `lo`, `hi`
3. Score part: `min(score):max(score)`
4. 10-minute bucket: `floor(epoch / 600)` as integer string
5. Raw: `lo|hi|score_part|bucket` → SHA-256 hex

**Why:** The same game (same 4 players, same scores) must produce the same key regardless of which team was labelled A or B in the UI, and regardless of player order within each team. Lexicographic sort of team strings makes the key team-order-invariant. The 10-minute bucket allows the same real game to be entered from two devices without a false duplicate, while preventing genuine re-submissions.

### D-030: Score Validation at Three Layers
**Decision:** Score rules (winner ≥ 11, winner − loser ≥ 2, scores not equal) are enforced in: (1) `RecordGameForm` client component (instant feedback), (2) `recordGameAction` Server Action (pre-flight before RPC call), (3) `record_game` RPC (authoritative, cannot be bypassed).
**Why:** Client validation eliminates round trips for obvious errors. Server Action validation is a clean gate. RPC validation is the authoritative enforcement point. The DB `games_scores_not_equal` CHECK is a fourth backstop. Redundancy is intentional and cheap.

### D-031: `sequence_num` Derived Atomically Inside RPC
**Decision:** `sequence_num` is computed inside `record_game` as `SELECT coalesce(max(sequence_num), 0) + 1 FROM public.games WHERE session_id = p_session_id`.
**Why:** Deriving `sequence_num` inside the RPC is race-free — the SELECT and INSERT run in the same implicit PL/pgSQL transaction. A client-side counter would race under concurrent submissions from multiple devices on the same court.

### D-032: Duplicate Game — Warn and Confirm (replaces hard-block) *(updated M4.1)*
**Decision (M4):** Originally, `record_game` raised a `23505` unique constraint error on `(session_id, dedupe_key)`, and the UI showed a static error message.
**Decision (M4.1):** The `UNIQUE (session_id, dedupe_key)` constraint is dropped. The RPC instead performs a *15-minute recency check*: if a game with the same fingerprint was recorded in the same session within the last 15 minutes, it returns `{ status: 'possible_duplicate', existing_game_id, existing_created_at }` (no insert). The Server Action surfaces this as `{ possibleDuplicate: true, ... }`. The UI shows an amber warning banner on the confirm step ("recorded 2 minutes ago") with two buttons: **Cancel** (reset form) and **Record anyway** (calls with `force=true`, which skips the recency check and inserts unconditionally).
**Why removing the unique constraint:** Without a time bucket in the fingerprint, the same scoreline played again legitimately (e.g. two courts, same teams, same 11-7) would be permanently blocked forever. The 15-minute window catches accidental double-submissions across devices while allowing legitimate repeats after the window expires.
**Why warn-and-confirm over hard-block:** Courtside users need to trust the system. A hard error with no escape path is frustrating when it's wrong. A warn-and-confirm respects the user's intent while surfacing potential mistakes.

### D-033: RecordGameForm Uses 3-Step State Machine (select → scores → confirm)
**Decision:** `RecordGameForm` cycles through three steps: `"select"` (pick players + assign teams), `"scores"` (enter scores), `"confirm"` (review + submit). State lives in the Client Component; no URL changes between steps.
**Why:** Fitting player selection, team assignment, score entry, and confirmation on one mobile screen simultaneously would require excessive scrolling. Three focused steps keeps each screen readable. Staying on one URL means browser Back/Forward doesn't disrupt the flow and the session page URL stays stable.

### D-034: Game List on Session Page, Newest First
**Decision:** The session page now fetches and displays all games for the session, ordered by `sequence_num DESC`.
**Why:** After recording a game, the redirect returns to the session page. Showing the game list inline provides instant confirmation of a successful save and a running log of all games. No separate game-detail route is needed in M4.

---

## Milestone 4.1 — Duplicate Warn-and-Confirm

### D-035: Fingerprint Has No Time Bucket (M4.1 change from M4)
**Decision:** The `dedupe_key` fingerprint is `sha256(lo|hi|score_part)` — no time bucket. It was `sha256(lo|hi|score_part|10min_bucket)` in M4.
**Why:** With a time bucket, two separate identical games played >10 minutes apart would produce different fingerprints and both insert silently — correct. But with a time bucket the unique constraint also does nothing beyond the bucket window. Removing the bucket makes the fingerprint a *semantic identity* for a game (same teams, same score = same fingerprint), which enables the 15-minute recency check to be meaningful. After 15 minutes, the same fingerprint can insert again freely.

### D-036: `p_force` Parameter on `record_game` RPC
**Decision:** `record_game` gains a `p_force boolean DEFAULT false` parameter. When `true`, the 15-minute recency check is skipped entirely and the insert proceeds unconditionally (subject to all other validations).
**Why:** The force path is the only way for the user to intentionally record a game that looks like a duplicate. It must go through the same RPC (atomicity, validation) — only the recency check is bypassed. The Server Action passes `force=true` only when the user explicitly clicks "Record anyway" in the UI.

### D-037: Duplicate Warning Uses Relative Time from `existing_created_at`
**Decision:** The amber warning banner displays how long ago the potential duplicate was recorded using `existing_created_at` from the RPC response, computed client-side as a relative string ("2 minutes ago").
**Why:** An absolute timestamp ("16:42:03") is less immediately meaningful courtside. "2 minutes ago" tells the user at a glance whether this is likely an accident. The RPC returns the ISO timestamp; the `relativeTime()` helper in `RecordGameForm` converts it.

---

## Milestone 5 — Group Leaderboards & Stats

### D-038: `get_group_stats` Uses `p_join_code text` (Not `group_id`)
**Decision:** The group leaderboard RPC accepts `p_join_code text` instead of `p_group_id uuid`.
**Why:** The frontend route parameter is `join_code` (from `/g/[join_code]/leaderboard`). Passing join_code directly avoids an extra group-lookup query on the client/server. The RPC resolves the group internally and raises if not found.

---

### D-039: Leaderboard Toggle via URL Query Param `?range=30d`
**Decision:** The All-time / Last 30 Days toggle uses a URL query parameter (`?range=30d`) instead of client-side state.
**Why:** This keeps the leaderboard page as a pure Server Component — no Client Component, no `useState`, no hydration cost. The toggle is just two `<Link>` elements. This also makes the current view bookmarkable and shareable.

---

### D-040: `vw_player_game_stats` View Codified in Migration
**Decision:** The `vw_player_game_stats` view (originally applied directly in Supabase during M4.2) is now defined in `m5_group_leaderboards.sql` using `CREATE OR REPLACE VIEW`.
**Why:** The repository must be the complete source of truth for DB state. Any artifact applied directly in Supabase without a migration is a drift risk. M5 codifies both the view and `get_session_stats` alongside the new `get_group_stats` function.

---

### D-041: Group Leaderboard Uses SECURITY INVOKER
**Decision:** `get_group_stats` runs as `SECURITY INVOKER` (not DEFINER).
**Why:** The function only performs SELECT queries against tables that already have anon SELECT RLS policies. No privilege escalation is needed. INVOKER is the safer default — it ensures the function can never read more than the caller is allowed to.

---

### D-042: Invalid-Score Protection via `is_valid` Flag
**Decision:** `vw_player_game_stats` includes a boolean `is_valid` column. All aggregates in `get_session_stats` and `get_group_stats` use `FILTER (WHERE is_valid)` to exclude garbage rows.
**Why:** The `record_game` RPC enforces score rules (winner ≥ 11, margin ≥ 2, scores ≠ equal), but a directly inserted row (migration, manual fix, future import) could violate these. `is_valid` guards stats from NULL scores, ties, and 0-0 games. Invalid rows are preserved in the table but invisible in aggregates.

---

### D-043: Day-Anchored "Last 30 Days" Cutoff
**Decision:** The 30-day filter uses `CURRENT_DATE - p_days` (calendar-day boundary) instead of `now() - interval '30 days'` (rolling timestamp).
**Why:** A rolling cutoff would shift every second, meaning the same player could rank differently between page loads within minutes. Day-anchoring gives stable, cache-friendly results: the same request returns the same data all day. The cast `::timestamptz` ensures correct comparison against `played_at`.

---

### D-044: Explicit Type Casting in RPC Aggregates
**Decision:** All aggregated columns use explicit casts: `::bigint` for counts and sums, `::numeric` for ROUND inputs, `::numeric(5,1)` for percentages and averages. Division uses `NULLIF(…, 0)` to prevent divide-by-zero.
**Why:** Postgres may infer different types depending on context (bigint vs integer vs numeric), causing return-type mismatches with the declared `RETURNS TABLE`. Explicit casting prevents `42P13` errors and ensures stable types regardless of data.

---

### D-045: Frontend Input Sanitisation on Leaderboard Route
**Decision:** The leaderboard page validates `join_code` against a conservative regex (`/^[a-z0-9][a-z0-9-]{0,30}$/`) and only accepts `"30d"` as a valid `range` parameter. Invalid input triggers `notFound()`.
**Why:** Although the RPC also validates (`lower(p_join_code)` + exception on not found), rejecting bad input at the edge is defence in depth. It prevents malformed strings from reaching the database and provides a clean 404 instead of a server error.
