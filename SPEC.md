# 🏓 Pickleball Stats App — Spec v1.3 (MVP)

## 1. Product Summary
Mobile-first web app for recording doubles pickleball games during live sessions and automatically generating leaderboards and player statistics over time.

Design goals:
- Zero-friction usage courtside
- Multi-device scoring allowed
- No authentication (trust-based)
- Immutable game history
- Future-proof for Elo rating system
- Clean data integrity from day one

---

## 2. Access & Group Model

### 2.1 Group Access
Each group has:
- `id`
- `name`
- `join_code` (unique, URL-safe, case-insensitive)

Group URL format:
`/g/{join_code}`

Behavior:
- Visiting `/g/{join_code}` loads that group.
- Invalid code → show error state.
- No authentication required.
- Anyone with the URL can:
  - View stats
  - Start sessions
  - Add players
  - Record games
  - End sessions

### 2.2 Root Route
Visiting `/`:
- Shows “Enter Group Code”
- Redirects to `/g/{code}`

---

## 3. Device Identity (Non-Authentication)

### 3.1 Purpose
Device identity is used only for convenience and attribution. It does NOT control permissions.

### 3.2 Behavior
On first visit to a group:
1. Check localStorage for `my_player_id`
2. If missing:
   - Display “Who are you?” screen
   - Show all existing players as large tappable buttons
   - Include search
   - Include `[ I’m New ]` → Add Player
3. When selected:
   - Store `my_player_id`
   - Store `my_player_code`
   - Store `my_display_name`
4. Provide “Switch Player” option in settings/menu.

### 3.3 Rules
- All write operations allowed regardless of identity.
- `created_by_player_id` is optional.
- Identity may be null.

---

## 4. Core Data Model
All timestamps stored in UTC.

### 4.1 Groups
Fields:
- id
- name
- join_code (unique)
- created_at

### 4.2 Players
Fields:
- id
- group_id
- display_name
- code (unique within group)
- is_active (default true)
- created_at

Constraints:
- Unique(group_id, code)
- display_name not required to be unique

### 4.3 Sessions
Represents one meetup.

Fields:
- id
- group_id
- session_date (date only, local timezone)
- name (display label)
- started_at
- ended_at (nullable)
- closed_reason (nullable: "manual" | "auto")
- created_at

#### 4.3.1 Session Label
Format:
`YYYY-MM-DD CODE CODE CODE ...`

Rules:
- Codes sorted alphabetically
- Codes derived from session attendance
- Label is cosmetic only
- Attendance stored in session_players (source of truth)

### 4.4 Session Players (Attendance)
Fields:
- session_id
- player_id
- created_at

Primary key:
- (session_id, player_id)

### 4.5 Games
Fields:
- id
- session_id
- played_at
- sequence_num (monotonic within session)
- team_a_score
- team_b_score
- dedupe_key
- created_by_player_id (nullable)
- created_at

Constraints:
- team_a_score >= 0
- team_b_score >= 0
- team_a_score != team_b_score
- Unique(session_id, dedupe_key)

Validation (application-level):
- Winner score >= 11
- Winner - loser >= 2

Games are immutable in MVP.

### 4.6 Game Players
Fields:
- game_id
- player_id
- team (A or B)

Constraints:
- Primary key(game_id, player_id)
- Exactly 4 players per game
- Exactly 2 players per team
- No duplicate players per game

---

## 5. Session Lifecycle Rules

### 5.1 Active Session Definition
A session is active if:
- ended_at is NULL
AND
- current time < started_at + 4 hours

The active session is:
- The most recent session matching the above condition.

### 5.2 Manual End
When user taps “End Session”:
- Set ended_at
- Set closed_reason = "manual"

### 5.3 Auto-Close
If:
- current time > started_at + 4 hours

Then session is treated as closed.

If user attempts to record a game into a closed session:
Prompt:
- “Session is closed. Start a new session?”

---

## 6. Duplicate Prevention
Duplicate defined as:

Same:
- session_id
- Team A player set
- Team B player set
- final score
- 10-minute time bucket

Time bucket:
- played_at rounded down to nearest 10 minutes.

dedupe_key must be deterministic and hashed.

If duplicate detected:
- Reject insert
- Show message: “Looks like this game was already recorded.”
- Provide link to view most recent matching game.

Must work across devices.

---

## 7. Functional Requirements

### 7.1 Start Session
- Tap “Start Session”
- Display player buttons
- Search supported
- Add Player supported
- Select attendees
- Create session
- Insert session_players rows
- Generate label from attendance

### 7.2 Add Player
Requires:
- display_name
- unique code

Behavior:
- Suggest code
- Allow override
- On collision → show error + suggest alternative

### 7.3 Record Game (Mobile-First)
From active session:
- Show only session attendees as buttons
- User selects exactly 4 players
- Team assignment:
  - Two columns: Team A / Team B
  - Swap button
  - Tap-to-move players
- Two score inputs
- Validate
- Save

Target:
- < 12 seconds typical entry time.

After save:
- Show confirmation
- Clear selection

### 7.4 Session Summary
Displays:
- Session leaderboard
- Game history (sorted by sequence_num descending)

No editing in MVP.

### 7.5 Leaderboards
Default view:
- All-time

Toggle:
- Last 30 Days

30-day filter:
- played_at >= now() - 30 days

#### 7.5.1 Stats Per Player
- games_played
- games_won
- win_pct
- points_for
- points_against
- point_diff
- avg_point_diff

Sorting:
1. win_pct desc
2. games_won desc
3. point_diff desc

Stats computed from raw games only.

---

## 8. Mobile UX Requirements
- 44px minimum tap targets
- Minimal typing
- Active session prominently displayed
- Clear save feedback
- Maximum 3 primary destinations

### 8.1 First Screen (State-Aware)
If active session exists:
- Primary: Continue Session
- Secondary: Leaderboard

If no active session:
- Primary: Start Session
- Secondary: Leaderboard

### 8.2 Screens
1. Dashboard (state-aware)
2. Start Session
3. Active Session (Record Game)
4. Session Summary
5. Session History (list of past sessions)

---

## 9. Multi-Device Rules
- Multi-device scoring allowed.
- No locking.
- Duplicate prevention handles conflicts.
- No permission tiers in MVP.

---

## 10. Elo Future-Proofing Requirements
System must store sufficient data to compute individual Elo later.

Required:
- Chronological order (sequence_num + played_at)
- Team composition
- Scores
- Participants

No schema changes should be required to add rating engine later.

---

## 11. Non-Functional Requirements
- Mobile render < 2s on LTE
- Data integrity enforced by DB constraints
- Timestamps stored in UTC
- UI displays in local timezone

---

## 12. Acceptance Criteria
- Group loads via `/g/{join_code}`
- Device identity selection works
- Session created correctly
- Session auto-closes after 4 hours
- Games validated properly
- Duplicate detection works across devices
- Session leaderboard accurate
- All-time leaderboard accurate
- 30-day toggle accurate
- Game ordering deterministic
- No editing possible in MVP