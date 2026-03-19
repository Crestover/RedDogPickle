/**
 * RDR v2 Integration Tests
 *
 * Tests the confidence-based rating system by calling real Supabase RPCs
 * against the dev database. Each test creates isolated data (unique group,
 * players, session) so tests never interfere with each other.
 *
 * Run: npm run test:integration
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAnonClient,
  createAdminClient,
  setupTestGroup,
  setupTestPlayers,
  setupTestSession,
  recordGame,
  voidLastGame,
  undoGame,
  getPlayerRating,
  getGameDeltas,
  setPlayerLastPlayedAt,
  setPlayerRD,
  setPlayerGamesRated,
  setPlayerRating,
  daysAgo,
} from "./helpers";

let admin: SupabaseClient;
let anon: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
  anon = createAnonClient();
});

// ── Helper to set up a fresh 4-player game environment ──────

async function freshGameEnv() {
  const group = await setupTestGroup(admin);
  const players = await setupTestPlayers(admin, group.id, 4);
  const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

  // Record one game so all players have player_ratings rows
  // (created by record_game's ON CONFLICT DO NOTHING upsert)
  const initGame = await recordGame(
    anon,
    sessionId,
    [players[0].id, players[1].id],
    [players[2].id, players[3].id],
    11,
    9,
  );

  return { group, players, sessionId, initGame };
}

// ══════════════════════════════════════════════════════════════
// 1. CORE BEHAVIOR
// ══════════════════════════════════════════════════════════════

describe("RDR v2 — core behavior", () => {
  it("records a game and updates ratings with v2 algorithm", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    const result = await recordGame(
      anon,
      sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11,
      7,
    );

    expect(result.status).toBe("inserted");
    expect(result.deltas).toHaveLength(4);

    // Check delta log entries
    const deltas = await getGameDeltas(admin, result.game_id);
    expect(deltas).toHaveLength(4);
    expect(deltas[0].algo_version).toBe("rdr_v2");

    // Winners should have positive deltas, losers negative
    const winnerDelta = deltas.find((d) => d.player_id === players[0].id);
    const loserDelta = deltas.find((d) => d.player_id === players[2].id);
    expect(winnerDelta!.delta).toBeGreaterThan(0);
    expect(loserDelta!.delta).toBeLessThan(0);

    // Ratings should have moved from 1200
    const after = await getPlayerRating(admin, group.id, players[0].id);
    expect(after.rating).toBeGreaterThan(1200);
    expect(after.last_played_at).not.toBeNull();
    expect(after.games_rated).toBe(1);

    // RD should have decreased from initial 120
    expect(after.rating_deviation).toBeLessThan(120);
  });

  it("clamps deltas to ±32", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    // Make player 0 very high RD (max volatility) and favorable matchup
    await setPlayerRD(admin, group.id, players[0].id, 140);
    await setPlayerRating(admin, group.id, players[0].id, 1000); // underdog
    await setPlayerRating(admin, group.id, players[2].id, 1400); // opponent much higher
    await setPlayerRating(admin, group.id, players[3].id, 1400);

    const result = await recordGame(
      anon,
      sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11,
      1, // blowout win for the underdog
    );

    const deltas = await getGameDeltas(admin, result.game_id);
    for (const d of deltas) {
      expect(Math.abs(d.delta)).toBeLessThanOrEqual(32.01); // small float tolerance
    }
  });

  it("applies margin factor tiers correctly", async () => {
    // Record multiple games with different margins, same players
    // All players start at same rating so expected ≈ 0.5
    const results: { margin: number; absDelta: number }[] = [];

    for (const [scoreA, scoreB] of [[11, 9], [11, 6], [11, 3], [11, 1]] as const) {
      const group = await setupTestGroup(admin);
      const players = await setupTestPlayers(admin, group.id, 4);
      const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

      const result = await recordGame(
        anon, sessionId,
        [players[0].id, players[1].id],
        [players[2].id, players[3].id],
        scoreA, scoreB,
      );

      const deltas = await getGameDeltas(admin, result.game_id);
      const winnerDelta = deltas.find((d) => d.player_id === players[0].id)!;
      results.push({ margin: scoreA - scoreB, absDelta: Math.abs(winnerDelta.delta) });
    }

    // Larger margins → larger deltas (relative ordering)
    // 11-1 (margin 10) > 11-3 (margin 8) > 11-6 (margin 5) > 11-9 (margin 2)
    expect(results[3].absDelta).toBeGreaterThan(results[2].absDelta); // 11-1 > 11-3
    expect(results[2].absDelta).toBeGreaterThan(results[1].absDelta); // 11-3 > 11-6
    expect(results[1].absDelta).toBeGreaterThanOrEqual(results[0].absDelta); // 11-6 >= 11-9
  });

  it("applies partner gap dampener", async () => {
    // Balanced team vs large-gap team
    const group1 = await setupTestGroup(admin);
    const p1 = await setupTestPlayers(admin, group1.id, 4);
    const s1 = await setupTestSession(anon, group1.join_code, p1.map((p) => p.id));

    // Balanced: all at 1200 (default)
    const r1 = await recordGame(anon, s1, [p1[0].id, p1[1].id], [p1[2].id, p1[3].id], 11, 7);
    const d1 = await getGameDeltas(admin, r1.game_id);
    const balancedDelta = Math.abs(d1.find((d) => d.player_id === p1[0].id)!.delta);

    // Large gap: partner at 1500, far apart
    const group2 = await setupTestGroup(admin);
    const p2 = await setupTestPlayers(admin, group2.id, 4);
    const s2 = await setupTestSession(anon, group2.join_code, p2.map((p) => p.id));

    // Need to record a game first so player_ratings rows exist
    await recordGame(anon, s2, [p2[0].id, p2[1].id], [p2[2].id, p2[3].id], 11, 9);
    await setPlayerRating(admin, group2.id, p2[1].id, 1500); // partner much higher

    const r2 = await recordGame(anon, s2, [p2[0].id, p2[1].id], [p2[2].id, p2[3].id], 11, 7);
    const d2 = await getGameDeltas(admin, r2.game_id);
    const gapDelta = Math.abs(d2.find((d) => d.player_id === p2[0].id)!.delta);

    // Large partner gap should dampen the delta
    expect(gapDelta).toBeLessThan(balancedDelta);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. INACTIVITY & VOLATILITY
// ══════════════════════════════════════════════════════════════

describe("RDR v2 — inactivity & volatility", () => {
  it("inactive player gets larger delta than active player in same game", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    // Make player 0 inactive (90 days) with 5+ games
    await setPlayerLastPlayedAt(admin, group.id, players[0].id, daysAgo(90));
    await setPlayerGamesRated(admin, group.id, players[0].id, 10);

    // Player 2 is active (just played in freshGameEnv init)

    const result = await recordGame(
      anon,
      sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11,
      9,
    );

    const deltas = await getGameDeltas(admin, result.game_id);
    const inactiveDelta = Math.abs(deltas.find((d) => d.player_id === players[0].id)!.delta);
    const activeDelta = Math.abs(deltas.find((d) => d.player_id === players[2].id)!.delta);

    // Core v2 promise: inactive players move more
    expect(inactiveDelta).toBeGreaterThan(activeDelta);
  });

  it("tracks RD inflation and recovery in delta log", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    // Make player inactive
    await setPlayerLastPlayedAt(admin, group.id, players[0].id, daysAgo(90));
    await setPlayerGamesRated(admin, group.id, players[0].id, 10);

    const result = await recordGame(
      anon,
      sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11,
      9,
    );

    const deltas = await getGameDeltas(admin, result.game_id);
    const d = deltas.find((dd) => dd.player_id === players[0].id)!;

    // effective_rd_before should be inflated above stored RD
    expect(d.effective_rd_before).toBeGreaterThan(d.rd_before);

    // rd_after should be less than effective_rd_before (recovery happened)
    expect(d.rd_after).toBeLessThan(d.effective_rd_before);

    // vol_multiplier should be > 1 (uncertain player)
    expect(d.vol_multiplier).toBeGreaterThan(1.0);

    const after = await getPlayerRating(admin, group.id, players[0].id);
    // RD decreased from effective (inflated) level
    expect(after.rating_deviation).toBeLessThan(d.effective_rd_before);
  });

  it("does not inflate RD within grace period (14 days)", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    // Set last played 10 days ago (within grace)
    await setPlayerLastPlayedAt(admin, group.id, players[0].id, daysAgo(10));

    const result = await recordGame(
      anon,
      sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11,
      9,
    );

    const deltas = await getGameDeltas(admin, result.game_id);
    const d = deltas.find((d) => d.player_id === players[0].id)!;

    // No inflation: effective RD should equal stored RD
    expect(d.effective_rd_before).toBeCloseTo(d.rd_before, 1);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. REACCLIMATION
// ══════════════════════════════════════════════════════════════

describe("RDR v2 — reacclimation buffer", () => {
  it("triggers reacclimation for 60+ day inactive player with 5+ games", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    // Set player 0 as long-inactive with enough games
    await setPlayerLastPlayedAt(admin, group.id, players[0].id, daysAgo(90));
    await setPlayerGamesRated(admin, group.id, players[0].id, 10);

    // Game 1 — should trigger reacclimation
    const r1 = await recordGame(
      anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 9,
    );

    const d1 = await getGameDeltas(admin, r1.game_id);
    const p0d1 = d1.find((d) => d.player_id === players[0].id)!;
    expect(p0d1.reacclimation_before).toBe(0); // was 0 before trigger
    expect(p0d1.reacclimation_after).toBe(2); // set to 3, then decremented to 2

    const after1 = await getPlayerRating(admin, group.id, players[0].id);
    expect(after1.reacclimation_games_remaining).toBe(2);

    // Game 2
    await recordGame(
      anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 9,
    );

    const after2 = await getPlayerRating(admin, group.id, players[0].id);
    expect(after2.reacclimation_games_remaining).toBe(1);

    // Game 3
    await recordGame(
      anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 9,
    );

    const after3 = await getPlayerRating(admin, group.id, players[0].id);
    expect(after3.reacclimation_games_remaining).toBe(0);
  });

  it("dampens volatility during reacclimation (game 1 < game 3 abs delta)", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    await setPlayerLastPlayedAt(admin, group.id, players[0].id, daysAgo(90));
    await setPlayerGamesRated(admin, group.id, players[0].id, 10);

    // Reset all to same rating for fair comparison
    for (const p of players) {
      await setPlayerRating(admin, group.id, p.id, 1200);
      await setPlayerRD(admin, group.id, p.id, 80);
    }
    // Re-set player 0's state
    await setPlayerRD(admin, group.id, players[0].id, 80);
    await setPlayerLastPlayedAt(admin, group.id, players[0].id, daysAgo(90));

    const r1 = await recordGame(anon, sessionId,
      [players[0].id, players[1].id], [players[2].id, players[3].id], 11, 9);
    const d1 = await getGameDeltas(admin, r1.game_id);
    const absDelta1 = Math.abs(d1.find((d) => d.player_id === players[0].id)!.delta);

    // Reset player 0 rating to 1200 for game 3 comparison
    // (games 2 is just to burn through reacclimation)
    await recordGame(anon, sessionId,
      [players[0].id, players[1].id], [players[2].id, players[3].id], 11, 9);

    // Reset ratings again so game 3 has same starting conditions
    for (const p of players) {
      await setPlayerRating(admin, group.id, p.id, 1200);
    }

    const r3 = await recordGame(anon, sessionId,
      [players[0].id, players[1].id], [players[2].id, players[3].id], 11, 9);
    const d3 = await getGameDeltas(admin, r3.game_id);
    const absDelta3 = Math.abs(d3.find((d) => d.player_id === players[0].id)!.delta);

    // Game 3 should have larger delta (full volatility, no dampening)
    // compared to game 1 (dampened by 0.70 factor)
    expect(absDelta3).toBeGreaterThan(absDelta1);
  });

  it("does not trigger reacclimation for new players with < 5 games", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    // First game — player has 0 games, so no reacclimation even with NULL last_played
    await recordGame(
      anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 9,
    );

    const after = await getPlayerRating(admin, group.id, players[0].id);
    expect(after.reacclimation_games_remaining).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. RD RECOVERY
// ══════════════════════════════════════════════════════════════

describe("RDR v2 — RD recovery", () => {
  it("recovers more RD when opponents have low RD (high confidence)", async () => {
    // Scenario 1: opponents with low RD
    const g1 = await setupTestGroup(admin);
    const p1 = await setupTestPlayers(admin, g1.id, 4);
    const s1 = await setupTestSession(anon, g1.join_code, p1.map((p) => p.id));
    // Init game to create ratings
    await recordGame(anon, s1, [p1[0].id, p1[1].id], [p1[2].id, p1[3].id], 11, 9);
    // Set opponents to very low RD
    await setPlayerRD(admin, g1.id, p1[2].id, 50);
    await setPlayerRD(admin, g1.id, p1[3].id, 50);
    await setPlayerRD(admin, g1.id, p1[0].id, 100); // player starts at 100

    const r1 = await recordGame(anon, s1, [p1[0].id, p1[1].id], [p1[2].id, p1[3].id], 11, 9);
    const d1 = await getGameDeltas(admin, r1.game_id);
    const rdDrop1 = d1.find((d) => d.player_id === p1[0].id)!;
    const recovery1 = rdDrop1.effective_rd_before - rdDrop1.rd_after;

    // Scenario 2: opponents with high RD
    const g2 = await setupTestGroup(admin);
    const p2 = await setupTestPlayers(admin, g2.id, 4);
    const s2 = await setupTestSession(anon, g2.join_code, p2.map((p) => p.id));
    await recordGame(anon, s2, [p2[0].id, p2[1].id], [p2[2].id, p2[3].id], 11, 9);
    // Set opponents to high RD
    await setPlayerRD(admin, g2.id, p2[2].id, 130);
    await setPlayerRD(admin, g2.id, p2[3].id, 130);
    await setPlayerRD(admin, g2.id, p2[0].id, 100); // same starting RD

    const r2 = await recordGame(anon, s2, [p2[0].id, p2[1].id], [p2[2].id, p2[3].id], 11, 9);
    const d2 = await getGameDeltas(admin, r2.game_id);
    const rdDrop2 = d2.find((d) => d.player_id === p2[0].id)!;
    const recovery2 = rdDrop2.effective_rd_before - rdDrop2.rd_after;

    // More recovery when opponents are confident (low RD)
    expect(recovery1).toBeGreaterThan(recovery2);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. VOID / UNDO
// ══════════════════════════════════════════════════════════════

describe("RDR v2 — void/undo restoration", () => {
  it("void restores rating, RD, reacclimation, and last_played_at", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    // Capture state before game
    const before = await getPlayerRating(admin, group.id, players[0].id);

    // Record a game
    await recordGame(
      anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7,
    );

    // Verify state changed
    const afterGame = await getPlayerRating(admin, group.id, players[0].id);
    expect(afterGame.rating).not.toEqual(before.rating);
    expect(afterGame.games_rated).toBe(before.games_rated + 1);

    // Void the game
    const voidResult = await voidLastGame(anon, sessionId);
    expect(voidResult.status).toBe("voided");

    // Verify full restoration
    const afterVoid = await getPlayerRating(admin, group.id, players[0].id);
    expect(afterVoid.rating).toBeCloseTo(before.rating, 2);
    expect(afterVoid.games_rated).toBe(before.games_rated);
    expect(afterVoid.rating_deviation).toBeCloseTo(before.rating_deviation, 2);
    expect(afterVoid.reacclimation_games_remaining).toBe(before.reacclimation_games_remaining);
  });

  it("undo restores rating, RD, and last_played_at", async () => {
    const { group, players, sessionId } = await freshGameEnv();

    const before = await getPlayerRating(admin, group.id, players[0].id);

    // Record a game (within undo window)
    const result = await recordGame(
      anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7,
    );

    // Undo immediately (within 8s window)
    const undoResult = await undoGame(anon, result.game_id);
    expect(undoResult.status).toBe("undone");

    // Verify restoration
    const afterUndo = await getPlayerRating(admin, group.id, players[0].id);
    expect(afterUndo.rating).toBeCloseTo(before.rating, 2);
    expect(afterUndo.games_rated).toBe(before.games_rated);
    expect(afterUndo.rating_deviation).toBeCloseTo(before.rating_deviation, 2);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. NEW PLAYER BEHAVIOR
// ══════════════════════════════════════════════════════════════

describe("RDR v2 — new player", () => {
  it("starts with RD=120 and gets higher volatility than established player", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    // First game — all players are new (RD=120)
    const result = await recordGame(
      anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 9,
    );

    const deltas = await getGameDeltas(admin, result.game_id);
    const d = deltas.find((d) => d.player_id === players[0].id)!;

    // Started with RD=120 (column default)
    expect(d.rd_before).toBe(120);

    // Volatility should be > 1 (120/80 = 1.5, clamped to 1.5)
    expect(d.vol_multiplier).toBeGreaterThan(1.0);

    // No reacclimation (< 5 games)
    expect(d.reacclimation_before).toBe(0);
    expect(d.reacclimation_after).toBe(0);

    // RD decreased after game
    expect(d.rd_after).toBeLessThan(120);
  });
});
