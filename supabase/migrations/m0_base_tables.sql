-- ============================================================
-- M0: Base Table DDL (Reconstructed)
--
-- WARNING: Do NOT run on existing databases. Tables already exist.
-- This file is committed for reproducibility and audit trail only.
-- It documents the original Supabase dashboard setup.
--
-- To set up a new database from scratch, run this file FIRST,
-- then apply all subsequent migrations in order (m2 through m7).
-- ============================================================

-- ── Extension required by record_game's DIGEST() function ─────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

-- ── groups ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  join_code  text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Join codes must be lowercase alphanumeric + hyphens
  CONSTRAINT groups_join_code_format    CHECK (join_code ~ '^[a-z0-9\-]+$'),
  -- Belt-and-suspenders: explicit lowercase check
  CONSTRAINT groups_join_code_lowercase CHECK (join_code = lower(join_code))
);

-- ── players ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.players (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES public.groups(id),
  display_name text NOT NULL,
  code         text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Player codes are unique within a group
  CONSTRAINT players_group_code_unique UNIQUE (group_id, code),
  -- Codes must be uppercase alphanumeric
  CONSTRAINT players_code_format CHECK (code ~ '^[A-Z0-9]+$')
);

-- ── sessions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES public.groups(id),
  session_date  date NOT NULL DEFAULT current_date,
  name          text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  closed_reason text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── session_players (attendance) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_players (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  player_id  uuid NOT NULL REFERENCES public.players(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (session_id, player_id)
);

-- ── games ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.games (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.sessions(id),
  sequence_num integer NOT NULL,
  team_a_score integer,
  team_b_score integer,
  dedupe_key   text,
  played_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- M7.3: Void support (soft-delete — never physically remove games)
  voided_at    timestamptz,
  void_reason  text,
  voided_by    text,

  -- Scores cannot be equal (no ties in pickleball)
  CONSTRAINT games_scores_not_equal CHECK (team_a_score <> team_b_score),
  -- Scores must be non-negative
  CONSTRAINT games_scores_nonnegative CHECK (team_a_score >= 0 AND team_b_score >= 0)
);

-- ── game_players (per-player game record) ─────────────────────
CREATE TABLE IF NOT EXISTS public.game_players (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id   uuid NOT NULL REFERENCES public.games(id),
  player_id uuid NOT NULL REFERENCES public.players(id),
  team      text NOT NULL CHECK (team IN ('A', 'B')),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (game_id, player_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Posture: anon gets SELECT + INSERT only; no UPDATE/DELETE.
-- UPDATEs happen via SECURITY DEFINER RPCs (end_session, etc.)

ALTER TABLE public.groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players    ENABLE ROW LEVEL SECURITY;

-- SELECT policies (all tables readable by anon)
CREATE POLICY "anon_select_groups"          ON public.groups          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_players"         ON public.players         FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_sessions"        ON public.sessions        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_session_players" ON public.session_players FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_games"           ON public.games           FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_game_players"    ON public.game_players    FOR SELECT TO anon USING (true);

-- INSERT policies (tables written by SECURITY INVOKER RPCs or direct inserts)
CREATE POLICY "anon_insert_groups"          ON public.groups          FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_players"         ON public.players         FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_sessions"        ON public.sessions        FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_session_players" ON public.session_players FOR INSERT TO anon WITH CHECK (true);

-- games and game_players: INSERTs happen via SECURITY DEFINER record_game RPC.
-- These INSERT policies allow direct inserts if needed (e.g., data import).
CREATE POLICY "anon_insert_games"           ON public.games           FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_game_players"    ON public.game_players    FOR INSERT TO anon WITH CHECK (true);
