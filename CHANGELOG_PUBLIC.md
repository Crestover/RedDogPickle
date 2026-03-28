# What's New

---

## v0.8.2 — Win by 1 Now Allowed

### Added
- **Games played now shows on every leaderboard card.** You can see how many games each player has played right next to their tier — no need to tap to expand.

### Changed
- **11-10, 15-14, and 21-20 scores are now valid.** The app previously rejected any win where the winner didn't lead by at least 2. This was stricter than intended — a win by 1 is now accepted for all three game lengths.
- **Confirmation before recording a close win.** If you enter a score where the winner leads by exactly 1, the app will ask "Are you sure you want to record a win by 1?" before saving, so you don't accidentally record a typo.

### Fixed
- Score entry errors were sometimes showing `[object Object]` instead of a readable message. Now shows the actual error text.

---

## v0.8.0 — Faster Game Recording

### Improved
- **Tap to pick players.** Starting a game is now a single-screen tap — just tap the players who are playing and the app assigns them to teams automatically. First two taps go to Team A, next two go to Team B. No menus, no dropdowns.
- **Always know where you stand.** Team A and Team B summary cards are always visible as you select players, so you can see exactly who's been assigned before you confirm.
- **Score entry appears when you're ready.** The score fields only show up once all four player slots are filled — no clutter while you're still picking.
- **The button always tells you what to do.** The action button updates as you go: "Select 2 more players", "Select 2 more for Team B", "Record Game" — so you never have to guess what the next step is.

### Added
- **Add players mid-session.** Tapping "+ Add players" during a session now shows your full group roster — just tap the people who showed up late. Previously this only let you create a brand new player, which wasn't what you needed.
- **Newly added players are ready to go.** After you add someone mid-session, they're automatically pre-selected on the game screen with a brief green highlight so you know who was just added.

### Fixed
- Several small bugs in team assignment and player selection that could cause players to end up on the wrong team after deselecting and reselecting.

---

## v0.7.1 — Fresh Look for the Leaderboard and Games Feed

### Improved
- **New leaderboard cards.** The leaderboard now uses clean, expandable cards. You can see rank, name, tier, and key stats at a glance — tap any card to see the full breakdown.
- **Redesigned games feed.** Game cards now look like a real sports scoreboard. The winning team is bold on top with their score in green, the losing team sits below in lighter text. Much faster to scan courtside.
- **Better typography.** The app now uses Inter, a clean modern font, across the board. Key numbers like rank and point differential use a tighter, bolder style for that athletic feel.

### Changed
- Game badges now show "G12" instead of "Game #12" — compact and easy to spot.
- Voided games still show all the details (players, score, time) instead of a generic placeholder.
- Scores now display with a simple dash (11 - 04) instead of "vs".

---

## v0.7.0 — Smarter Ratings

### Improved
- **Ratings now know when you've been away.** If you haven't played in a while, your rating stays the same — but the system knows it's less certain about where you stand. When you come back, your rating will adjust faster to match your current level.
- **Confidence labels on the leaderboard.** Each player now shows a status below their rating: **Locked In**, **Active**, **Rusty**, or **Returning**. This tells you how confident the system is in that player's rating right now.
- **Smoother first games back.** If you return after a long break, the first couple of games ease you back in instead of causing huge rating swings right away.
- **Better game quality matters.** Close games against players with solid ratings now count for more when building confidence. Blowouts and games against uncertain players count for a little less.
- **Tighter rating swings.** Maximum rating change per game has been reduced to keep things stable. The old system could occasionally produce outsized moves — this one stays more predictable.

### Changed
- The old rating system used a simple on/off switch between "new player" and "established player" to decide how much your rating moves. The new system uses a smooth scale based on how recently and how often you've been playing.

---

## v0.6.0 — GOAT Badges + New Tier Names

### Added
- **GOAT badges on the leaderboard**: The top-rated player now gets a gold 👑 GOAT badge next to their name on the All-time leaderboard. If someone has achieved the highest rating ever recorded (with 50+ games), they earn the ALL-TIME badge. One player can hold both.
- **GOAT row highlight**: The Reigning GOAT's card gets a subtle gold border and background so it stands out at a glance.

### Changed
- **New tier names**: The rating tiers have been renamed to feel more sports-native:
  - Walk-On → Challenger → Contender → All-Star → Elite
- The old names (Observer, Practitioner, Strategist, Authority, Architect) are retired.

---

## v0.5.1 — Under the Hood

### Improved
- Behind-the-scenes work to support additional sports in the future. Everything works exactly the same as before — this update lays the groundwork for what's coming next.
- Added automated testing across the app to catch issues faster and keep things reliable as we add new features.
- Search engines are now blocked from indexing the app, keeping your group data private.

---

## v0.5.0 — Session Browsing + Scoring Improvements

### Added
- **Session standings tab**: Ended sessions now have a Games / Standings toggle so you can see rankings without leaving the session.
- **Browse session standings from the leaderboard**: The "Last Session" view now shows Previous and Next buttons to step through all your past sessions.
- **Suspicious score warning**: If you enter a score with an unusually large overtime margin (greater than win by 2), a quick confirmation appears before saving. Normal scores are unaffected.
- **End Session from Courts Mode**: The End button now appears in the Courts page header — no need to switch to Manual first.
- **Courts Mode footer links**: All Games and Standings links now appear at the bottom of the Courts page, matching Manual mode.

### Improved
- Game cards across the app now show the same layout: game number, score with the winning side highlighted in green, and player names underneath.
- Player names in game cards now display as first name + last initial (e.g. "Joe S.") instead of first name only.
- Tapping Standings from a session takes you to the leaderboard and the back button returns you to that session instead of the home screen.
- Scoring rules simplified: the target points picker (11 / 15 / 21) is the only setting you need. Win-by has been removed from the interface to keep things simple.

---

## v0.4.3 — View-Only Sharing

### Added
- Share a read-only link to your group so spectators, friends, or family can follow along without being able to change anything. Tap "Copy view-only link" on the group dashboard to grab it.
- View-only visitors can browse the leaderboard, session history, live sessions, and full game logs — all without a join code.

### Improved
- Added analytics to help us understand which pages are used most and improve the experience over time.
- View-only pages now display the group name instead of internal codes, keeping your group's access credentials private.

---

## v0.4.2 — Scoring Preview + Timezone Fix

### Improved
- Game preview before recording now shows two color-coded team cards — green for the winner, amber for the loser — so you can verify the result at a glance instead of reading a sentence.
- All timestamps throughout the app now display in Central Time (Dallas) instead of depending on your device or the server timezone.

---

## v0.4.1 — Polish

### Improved
- Group dashboard now shows the horizontal Red Dog logo instead of plain text.
- iMessage and social share previews now reliably display the Open Graph image.

---

## v0.4.0 — Red Dog Rating + Rebrand

### Added
- New **Red Dog Rating (RDR)** system replaces the old Elo ratings. RDR accounts for margin of victory and partner skill gaps for more accurate player rankings.
- Cosmetic **tier badges** on the leaderboard: Observer, Practitioner, Strategist, Authority, and Architect.
- **Session-level game rules**: set target points (11, 15, or 21) for the entire session via a tappable Rules Chip. No more toggling per game.
- **RDR delta flash** after recording a game briefly shows each player's rating change.
- **Rating-correct void**: voiding a game now cleanly reverses each player's rating change.
- New **Red Dog logo** on the home screen and brand mark on the help page.
- New **favicon, Apple touch icon, and SVG icon** for browser tabs and home screen bookmarks.
- Rewritten **Learn More** page with RDR explainer, Manual vs Courts guide, and updated FAQ.

### Improved
- Leaderboard sorting is now fully server-side across all three views. Last Session breaks ties by point differential then RDR. All-Time and 30-Day sort by RDR first.
- Score validation uses the session's active rules instead of hardcoded 11/win-by-2.
- Rules Chip appears in both Manual and Courts modes with the same controls.
- Product renamed to **Red Dog** throughout the app — home screen, group dashboard, help page, and browser tab title.

---

## v0.3.1 — Live Referee Console

### Added
- Live session page redesigned as a single-screen scoring console. Team selection, scores, and the Record button are all visible without scrolling.
- Each player row now has explicit A and B buttons for direct team assignment. No guessing which team you're adding to.
- Live game ticker shows the last recorded result at a glance — score, team codes, and time.
- New "All Games" page for browsing the full game log of any session.
- Pairing dot indicators show how often partners and opponents have been matched this session.
- Courts Mode waiting pool now uses horizontal scroll chips. Tap a chip to assign a player to an open court slot.
- Courts Mode controls (court count, Suggest All, Void) are pinned above the court cards for quick access.
- Fairness summary line in Courts Mode shows which players have the fewest and most games.

### Improved
- Session page is cleaner: standings and pairing tables moved off the live view. Use the Standings link to see analytics.
- Only the Record Game button uses a filled green style. All other buttons are outline-only for a calmer interface.
- Ended sessions show a simple game log instead of analytics.

---

## v0.3.0 — Courts Mode + Game Voids

### Added
- Courts Mode for multi-court sessions with auto-suggested matchups.
- Void Last Game with full Elo recompute.
- Help page explaining how RedDog Pickle works.
- Inline pairing feedback in team picker.

### Improved
- Footer now shows version and changelog link on every page.
- Footer stays visible without scrolling on short pages.

---

## v0.2.0 — Ratings + Quality Improvements

### Added
- Player skill ratings now update automatically after each game.
- Version number displayed on the home screen.
- Added a safeguard when saving games with a 0 score.

### Improved
- Leaderboard now displays player ratings.
- Rating updates run automatically in the background.

### Fixed
- Minor stability improvements.
