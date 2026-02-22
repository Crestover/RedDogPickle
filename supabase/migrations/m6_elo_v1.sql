-- M6: Elo Rating v1
-- Tables, indexes, RLS, and idempotent RPC for Elo ratings.
-- Ratings are applied *after* record_game returns (fire-and-forget).

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_ratings (
  group_id    uuid NOT NULL REFERENCES groups(id),
  player_id   uuid NOT NULL REFERENCES players(id),
  rating      numeric(7,2) NOT NULL DEFAULT 1200,
  games_rated integer NOT NULL DEFAULT 0,
  provisional boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, player_id)
);

CREATE TABLE IF NOT EXISTS rating_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES groups(id),
  session_id   uuid NOT NULL REFERENCES sessions(id),
  game_id      uuid NOT NULL REFERENCES games(id),
  player_id    uuid NOT NULL REFERENCES players(id),
  pre_rating   numeric(7,2) NOT NULL,
  post_rating  numeric(7,2) NOT NULL,
  delta        numeric(7,2) NOT NULL,
  algo_version text NOT NULL DEFAULT 'elo_v1',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id, algo_version)
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rating_events_game_id
  ON rating_events(game_id);

CREATE INDEX IF NOT EXISTS idx_rating_events_player_id
  ON rating_events(player_id);

CREATE INDEX IF NOT EXISTS idx_player_ratings_group_id
  ON player_ratings(group_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_events  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_player_ratings"
  ON player_ratings FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_rating_events"
  ON rating_events FOR SELECT TO anon USING (true);

-- No INSERT/UPDATE policies for anon — the RPC is SECURITY DEFINER.

-- ─── RPC: apply_ratings_for_game ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_ratings_for_game(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id     uuid;
  v_session_id   uuid;
  v_team_a_score integer;
  v_team_b_score integer;
  v_winner_team  text;  -- 'A' or 'B'
  -- Player IDs (2 per team)
  v_a1 uuid;  v_a2 uuid;
  v_b1 uuid;  v_b2 uuid;
  -- Current ratings
  v_ra1 numeric(7,2);  v_ra2 numeric(7,2);
  v_rb1 numeric(7,2);  v_rb2 numeric(7,2);
  -- Games rated counts (for K-factor)
  v_ga1 integer;  v_ga2 integer;
  v_gb1 integer;  v_gb2 integer;
  -- Elo intermediates
  v_team_a_avg numeric;
  v_team_b_avg numeric;
  v_expected_a numeric;
  v_expected_b numeric;
  v_score_a    numeric;  -- 1 = win, 0 = loss
  v_score_b    numeric;
  -- Per-player deltas
  v_delta_a1 numeric(7,2);  v_delta_a2 numeric(7,2);
  v_delta_b1 numeric(7,2);  v_delta_b2 numeric(7,2);
  v_k numeric;
BEGIN
  -- ── Idempotency check ───────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM rating_events
    WHERE game_id = p_game_id AND algo_version = 'elo_v1'
  ) THEN
    RETURN;
  END IF;

  -- ── Resolve game metadata ──────────────────────────────────────────────
  SELECT s.group_id, g.session_id, g.team_a_score, g.team_b_score
    INTO v_group_id, v_session_id, v_team_a_score, v_team_b_score
    FROM games g
    JOIN sessions s ON s.id = g.session_id
   WHERE g.id = p_game_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Game % not found', p_game_id;
  END IF;

  -- Determine winner
  IF v_team_a_score > v_team_b_score THEN
    v_winner_team := 'A';
  ELSE
    v_winner_team := 'B';
  END IF;

  -- ── Resolve player IDs per team ────────────────────────────────────────
  SELECT player_id INTO v_a1
    FROM game_players WHERE game_id = p_game_id AND team = 'A'
    ORDER BY player_id LIMIT 1;

  SELECT player_id INTO v_a2
    FROM game_players WHERE game_id = p_game_id AND team = 'A'
    ORDER BY player_id LIMIT 1 OFFSET 1;

  SELECT player_id INTO v_b1
    FROM game_players WHERE game_id = p_game_id AND team = 'B'
    ORDER BY player_id LIMIT 1;

  SELECT player_id INTO v_b2
    FROM game_players WHERE game_id = p_game_id AND team = 'B'
    ORDER BY player_id LIMIT 1 OFFSET 1;

  -- ── Upsert default ratings for any new players ─────────────────────────
  INSERT INTO player_ratings (group_id, player_id)
  VALUES
    (v_group_id, v_a1),
    (v_group_id, v_a2),
    (v_group_id, v_b1),
    (v_group_id, v_b2)
  ON CONFLICT DO NOTHING;

  -- ── Read current ratings + games_rated ─────────────────────────────────
  SELECT rating, games_rated INTO v_ra1, v_ga1
    FROM player_ratings WHERE group_id = v_group_id AND player_id = v_a1;
  SELECT rating, games_rated INTO v_ra2, v_ga2
    FROM player_ratings WHERE group_id = v_group_id AND player_id = v_a2;
  SELECT rating, games_rated INTO v_rb1, v_gb1
    FROM player_ratings WHERE group_id = v_group_id AND player_id = v_b1;
  SELECT rating, games_rated INTO v_rb2, v_gb2
    FROM player_ratings WHERE group_id = v_group_id AND player_id = v_b2;

  -- ── Compute Elo ────────────────────────────────────────────────────────
  v_team_a_avg := (v_ra1 + v_ra2) / 2.0;
  v_team_b_avg := (v_rb1 + v_rb2) / 2.0;

  -- Expected scores
  v_expected_a := 1.0 / (1.0 + power(10.0, (v_team_b_avg - v_team_a_avg) / 400.0));
  v_expected_b := 1.0 - v_expected_a;

  -- Actual scores (1 = win, 0 = loss)
  IF v_winner_team = 'A' THEN
    v_score_a := 1;  v_score_b := 0;
  ELSE
    v_score_a := 0;  v_score_b := 1;
  END IF;

  -- Per-player deltas (each teammate gets the same delta)
  -- K = 40 if provisional (games_rated < 5), else K = 20
  v_k := CASE WHEN v_ga1 < 5 THEN 40 ELSE 20 END;
  v_delta_a1 := round(v_k * (v_score_a - v_expected_a));

  v_k := CASE WHEN v_ga2 < 5 THEN 40 ELSE 20 END;
  v_delta_a2 := round(v_k * (v_score_a - v_expected_a));

  v_k := CASE WHEN v_gb1 < 5 THEN 40 ELSE 20 END;
  v_delta_b1 := round(v_k * (v_score_b - v_expected_b));

  v_k := CASE WHEN v_gb2 < 5 THEN 40 ELSE 20 END;
  v_delta_b2 := round(v_k * (v_score_b - v_expected_b));

  -- ── Update player_ratings ──────────────────────────────────────────────
  UPDATE player_ratings
     SET rating      = rating + v_delta_a1,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 5,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_a1;

  UPDATE player_ratings
     SET rating      = rating + v_delta_a2,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 5,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_a2;

  UPDATE player_ratings
     SET rating      = rating + v_delta_b1,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 5,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_b1;

  UPDATE player_ratings
     SET rating      = rating + v_delta_b2,
         games_rated = games_rated + 1,
         provisional = (games_rated + 1) < 5,
         updated_at  = now()
   WHERE group_id = v_group_id AND player_id = v_b2;

  -- ── Insert rating_events ───────────────────────────────────────────────
  INSERT INTO rating_events (group_id, session_id, game_id, player_id, pre_rating, post_rating, delta)
  VALUES
    (v_group_id, v_session_id, p_game_id, v_a1, v_ra1, v_ra1 + v_delta_a1, v_delta_a1),
    (v_group_id, v_session_id, p_game_id, v_a2, v_ra2, v_ra2 + v_delta_a2, v_delta_a2),
    (v_group_id, v_session_id, p_game_id, v_b1, v_rb1, v_rb1 + v_delta_b1, v_delta_b1),
    (v_group_id, v_session_id, p_game_id, v_b2, v_rb2, v_rb2 + v_delta_b2, v_delta_b2);
END;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION apply_ratings_for_game(uuid) TO anon;
