/**
 * Integration test helpers for RDR v2.
 *
 * Two-client strategy:
 *   - adminClient: service role key, bypasses RLS — for setup, teardown, state mutation
 *   - anonClient: anon key, subject to RLS — for calling RPCs (real production behavior)
 *
 * Test data isolation:
 *   - Each test creates its own group with a unique join_code
 *   - Data is append-only (no cleanup required for correctness)
 *   - Unique prefix: test-rdr-{timestamp}-{random}
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── ENV ──────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}
if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (required for integration tests)");
}

// ── CLIENTS ──────────────────────────────────────────────────

export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY);
}

export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ── UTIL ─────────────────────────────────────────────────────

function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// ── SETUP HELPERS ────────────────────────────────────────────

/** Create an isolated test group with a unique join_code. */
export async function setupTestGroup(admin: SupabaseClient) {
  const joinCode = `test-rdr-${uniqueId()}`;

  const { data, error } = await admin
    .from("groups")
    .insert({ name: `Test Group ${joinCode}`, join_code: joinCode })
    .select()
    .single();

  if (error) throw new Error(`setupTestGroup failed: ${error.message}`);
  return data as { id: string; join_code: string };
}

/**
 * Create test players in a group.
 *
 * Does NOT insert player_ratings rows — those are created automatically
 * by record_game's ON CONFLICT DO NOTHING upsert (with column defaults:
 * rating=1200, rating_deviation=120, games_rated=0).
 */
export async function setupTestPlayers(admin: SupabaseClient, groupId: string, count: number) {
  const players: { id: string; display_name: string; code: string }[] = [];
  const suffix = uniqueId();

  for (let i = 0; i < count; i++) {
    const code = `T${suffix.replace("-", "").slice(-6)}${String.fromCharCode(65 + i)}`; // e.g., T123456A
    const { data, error } = await admin
      .from("players")
      .insert({
        group_id: groupId,
        display_name: `Test Player ${i + 1}`,
        code: code.toUpperCase(),
      })
      .select()
      .single();

    if (error) throw new Error(`setupTestPlayers failed for player ${i}: ${error.message}`);
    players.push(data);
  }

  return players;
}

/**
 * Create a session via the create_session RPC (anon client).
 * Returns the session UUID.
 */
export async function setupTestSession(
  anon: SupabaseClient,
  joinCode: string,
  playerIds: string[]
): Promise<string> {
  const { data, error } = await anon.rpc("create_session", {
    group_join_code: joinCode,
    player_ids: playerIds,
  });

  if (error) throw new Error(`setupTestSession failed: ${error.message}`);
  return data as string;
}

// ── ACTIONS ──────────────────────────────────────────────────

/** Record a game via the record_game RPC (anon client). */
export async function recordGame(
  anon: SupabaseClient,
  sessionId: string,
  teamA: string[],
  teamB: string[],
  scoreA: number,
  scoreB: number,
  force = true // skip duplicate check in tests
) {
  const { data, error } = await anon.rpc("record_game", {
    p_session_id: sessionId,
    p_team_a_ids: teamA,
    p_team_b_ids: teamB,
    p_team_a_score: scoreA,
    p_team_b_score: scoreB,
    p_force: force,
  });

  if (error) throw new Error(`recordGame failed: ${error.message}`);
  return data as {
    status: string;
    game_id: string;
    deltas: { player_id: string; delta: number; rdr_after: number }[];
    undo_expires_at: string;
  };
}

/** Void the last game in a session via void_last_game RPC (anon client). */
export async function voidLastGame(anon: SupabaseClient, sessionId: string) {
  const { data, error } = await anon.rpc("void_last_game", {
    p_session_id: sessionId,
  });

  if (error) throw new Error(`voidLastGame failed: ${error.message}`);
  return data as { status: string; voided_game_id?: string };
}

/** Undo a game via undo_game RPC (anon client). Must be within 8s window. */
export async function undoGame(anon: SupabaseClient, gameId: string) {
  const { data, error } = await anon.rpc("undo_game", {
    p_game_id: gameId,
  });

  if (error) throw new Error(`undoGame failed: ${error.message}`);
  return data as { status: string; game_id: string };
}

// ── STATE MUTATION (ADMIN ONLY) ──────────────────────────────

/** Set a player's last_played_at to simulate inactivity. */
export async function setPlayerLastPlayedAt(
  admin: SupabaseClient,
  groupId: string,
  playerId: string,
  timestamp: string
) {
  const { error } = await admin
    .from("player_ratings")
    .update({ last_played_at: timestamp })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  if (error) throw new Error(`setPlayerLastPlayedAt failed: ${error.message}`);
}

/** Set a player's rating_deviation directly. */
export async function setPlayerRD(
  admin: SupabaseClient,
  groupId: string,
  playerId: string,
  rd: number
) {
  const { error } = await admin
    .from("player_ratings")
    .update({ rating_deviation: rd })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  if (error) throw new Error(`setPlayerRD failed: ${error.message}`);
}

/** Set a player's games_rated directly. */
export async function setPlayerGamesRated(
  admin: SupabaseClient,
  groupId: string,
  playerId: string,
  games: number
) {
  const { error } = await admin
    .from("player_ratings")
    .update({ games_rated: games })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  if (error) throw new Error(`setPlayerGamesRated failed: ${error.message}`);
}

/** Set a player's rating directly. */
export async function setPlayerRating(
  admin: SupabaseClient,
  groupId: string,
  playerId: string,
  rating: number
) {
  const { error } = await admin
    .from("player_ratings")
    .update({ rating })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  if (error) throw new Error(`setPlayerRating failed: ${error.message}`);
}

/** Set reacclimation_games_remaining directly. */
export async function setPlayerReacclimation(
  admin: SupabaseClient,
  groupId: string,
  playerId: string,
  remaining: number
) {
  const { error } = await admin
    .from("player_ratings")
    .update({ reacclimation_games_remaining: remaining })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  if (error) throw new Error(`setPlayerReacclimation failed: ${error.message}`);
}

// ── READ HELPERS ─────────────────────────────────────────────

/** Read the current player_ratings row for a player. */
export async function getPlayerRating(admin: SupabaseClient, groupId: string, playerId: string) {
  const { data, error } = await admin
    .from("player_ratings")
    .select("*")
    .eq("group_id", groupId)
    .eq("player_id", playerId)
    .single();

  if (error) throw new Error(`getPlayerRating failed: ${error.message}`);
  return data as {
    rating: number;
    games_rated: number;
    provisional: boolean;
    rating_deviation: number;
    last_played_at: string | null;
    reacclimation_games_remaining: number;
    peak_rating: number;
    updated_at: string;
  };
}

/** Read game_rdr_deltas rows for a specific game. */
export async function getGameDeltas(admin: SupabaseClient, gameId: string) {
  const { data, error } = await admin
    .from("game_rdr_deltas")
    .select("*")
    .eq("game_id", gameId);

  if (error) throw new Error(`getGameDeltas failed: ${error.message}`);
  return data as {
    player_id: string;
    delta: number;
    rdr_before: number;
    rdr_after: number;
    rd_before: number;
    rd_after: number;
    effective_rd_before: number;
    vol_multiplier: number;
    reacclimation_before: number;
    reacclimation_after: number;
    last_played_before: string | null;
    last_played_after: string;
    algo_version: string;
    games_before: number;
    games_after: number;
  }[];
}

/**
 * Helper to get a timestamp N days ago (ISO string).
 * Useful for simulating inactivity.
 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
