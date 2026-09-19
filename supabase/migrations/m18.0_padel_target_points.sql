-- ============================================================
-- M18.0: Padel Target Points
--
-- Widens the target_points CHECK constraints (sessions and games)
-- to also allow padel's set target (see src/lib/sports/padel.ts).
-- Pickleball's existing presets (11/15/21) are unchanged.
-- games.win_by / sessions.win_by_default need no change —
-- record_game hardcodes win_by := 1 for every sport since m16.0,
-- which already satisfies the existing (1, 2) constraint.
--
-- Note: games.target_points always stores 6 for padel (the fixed
-- session-level set target — see recordGameAction in games.ts).
-- The actual final score (team_a_score/team_b_score) is unrestricted
-- and can exceed 6 under padel's win-by-2 rule (e.g. 9-7, 10-8) —
-- those columns have no CHECK constraint. 8/9/10 are included here
-- defensively even though app code never stores them in this column.
--
-- Changes:
--   1. sessions.target_points_default — allow 6, 8, 9, 10
--   2. games.target_points — allow 6, 8, 9, 10
-- ============================================================


-- ── 1. sessions.target_points_default ───────────────────────

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_target_points_default_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_target_points_default_check
    CHECK (target_points_default IN (6, 8, 9, 10, 11, 15, 21));


-- ── 2. games.target_points ───────────────────────────────────

ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_target_points_check;

ALTER TABLE public.games
  ADD CONSTRAINT games_target_points_check
    CHECK (target_points IN (6, 8, 9, 10, 11, 15, 21));
