# Assumptions

This file records every assumption made where the SPEC was ambiguous or silent. If any assumption is incorrect, the decision should be revisited and this file updated.

---

## A-001: Minimum Attendees to Start a Session
**Assumption:** There is no hard minimum number of attendees required to start a session. A session can be created with any number of players (including fewer than 4).
**Why:** The SPEC does not specify a minimum. Pickleball requires 4 players per game, but attendees who arrive late or leave early are still legitimate attendees. The game recording screen enforces "exactly 4 players," not the session start screen.
**Impact:** Session start flow does not block on attendee count. Game recording flow does.

---

## A-002: Player Code Format
**Assumption:** Player codes are uppercase alphanumeric only (no special characters, no spaces). The suggested code is derived from the initials of the player's display name, uppercased.
**Why:** SPEC says codes are "URL-safe" (implied by their use in session labels) and the schema regex `^[A-Z0-9]+$` enforces this. Suggested generation logic (initials) is the simplest useful default.
**Impact:** Code input is validated client-side and server-side against this regex.

---

## A-003: join_code Suggestion / Generation
**Assumption:** join_codes for new groups are not created through the MVP UI. The seed/initial groups are inserted directly via SQL or Supabase dashboard. The MVP app only reads groups by join_code — it does not create them.
**Why:** The SPEC describes joining a group by code but does not describe a "create group" UI flow. Creating a group creation UI would require additional decisions about access control.
**Impact:** No "Create Group" screen exists in the MVP. Group creation is an admin/manual operation.

---

## A-004: Session Label Uses Attendance at Creation Time
**Assumption:** The session label (`YYYY-MM-DD CODE CODE CODE`) is generated once at session creation time, using the attendees selected during "Start Session." It does not update if players are added later.
**Why:** SPEC §4.3.1 says "Label is cosmetic only" and "Attendance stored in session_players (source of truth)." A static label avoids needing to track or re-render label changes.
**Impact:** Label generation runs once on session insert. `session_players` is always the authoritative attendance list.

---

## A-005: played_at is Server-Side Timestamp
**Assumption:** `games.played_at` is set to the current server time at the moment the Server Action processes the insert, not the time the user tapped "Save."
**Why:** Using a server timestamp prevents clock skew between devices from affecting the 10-minute deduplication bucket. It also prevents clients from submitting manipulated timestamps.
**Impact:** The dedupe time bucket is computed server-side. There may be a 1–2 second difference between "tap Save" and `played_at`, which is acceptable.

---

## A-006: sequence_num Generation Strategy
**Assumption:** `sequence_num` is computed as `(SELECT COALESCE(MAX(sequence_num), 0) + 1 FROM games WHERE session_id = ?)` inside the Server Action, wrapped in a transaction with the game insert.
**Why:** SPEC says sequence_num is monotonic within a session. Without a DB sequence or trigger, the app layer computes it. A transaction ensures two simultaneous inserts don't get the same sequence_num.
**Impact:** Game inserts use a short transaction. Minor performance cost is acceptable at MVP scale.

---

## A-007: 30-Day Window Uses played_at, Not session_date
**Assumption:** The 30-day leaderboard filter uses `games.played_at >= now() - interval '30 days'`, not `sessions.session_date`.
**Why:** SPEC §7.5 explicitly states `played_at >= now() - 30 days`.
**Impact:** Games from a session started 31 days ago but finishing after the 30-day cutoff will be included.

---

## A-008: "Switch Player" Clears Only localStorage
**Assumption:** "Switch Player" clears `my_player_id`, `my_player_code`, and `my_display_name` from localStorage. It does not log out, modify the database, or affect any other state.
**Why:** Device identity is localStorage only. There is no server-side session.
**Impact:** Switching player on one device has no effect on any other device.

---

## A-009: No Soft Delete / Deactivation UI in MVP
**Assumption:** While `players.is_active` exists in the schema for future use, there is no UI to deactivate a player in the MVP. All players are shown as active.
**Why:** The SPEC does not describe a deactivation flow. The field is included for future-proofing.
**Impact:** `is_active` is always `true` for newly created players. Deactivation is a future feature.

---

## A-011: Buttons Disabled in Milestone 1 Are Not Aria-Disabled for Screen Readers
**Assumption:** Disabled buttons in Milestone 1 (`Start Session`, `Leaderboard`) use the HTML `disabled` attribute, not `aria-disabled`. This is acceptable for MVP because the app is used by a known, trusted group of players courtside and full accessibility compliance is post-MVP.
**Why:** SPEC has no accessibility requirement beyond 44px tap targets. Implementing aria-disabled with focus management adds complexity that is not in scope.
**Impact:** Screen readers will announce these buttons as "dimmed" or skip them entirely, which is fine for MVP.

## A-010: Supabase Anon Key Used for All Client Reads
**Assumption:** All client-side reads (group load, player list, leaderboard, game history) use the `NEXT_PUBLIC_SUPABASE_ANON_KEY` via the browser Supabase client. RLS SELECT policies allow this.
**Why:** There is no authentication, so there is no user token. The anon key is the correct key for unauthenticated access.
**Impact:** All data in the Supabase project is publicly readable to anyone who knows the URL. This is acceptable given the trust-based model in the SPEC.
