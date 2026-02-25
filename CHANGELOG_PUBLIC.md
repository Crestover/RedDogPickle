# What's New

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
- **Session-level game rules**: set target points (11, 15, or 21) and win-by (1 or 2) for the entire session via a tappable Rules Chip. No more toggling per game.
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
