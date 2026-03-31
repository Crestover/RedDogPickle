/**
 * Hidden Players Integration Tests
 *
 * Verifies that get_group_stats and get_session_stats filter out players
 * with hidden = true, while preserving those players' contributions to
 * visible players' stats (games_played, points, etc.).
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
  setPlayerHidden,
} from "./helpers";

let admin: SupabaseClient;
let anon: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
  anon = createAnonClient();
});

// ══════════════════════════════════════════════════════════════
// 1. get_group_stats
// ══════════════════════════════════════════════════════════════

describe("hidden players — get_group_stats", () => {
  it("players default to visible (hidden = false)", async () => {
    const group = await setupTestGroup(admin);
    const [p] = await setupTestPlayers(admin, group.id, 1);

    const { data } = await admin
      .from("players")
      .select("hidden")
      .eq("id", p.id)
      .single();

    expect(data?.hidden).toBe(false);
  });

  it("excludes hidden players from results", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7
    );

    await setPlayerHidden(admin, players[3].id, true);

    const { data: stats, error } = await anon.rpc("get_group_stats", { p_join_code: group.join_code });
    expect(error).toBeNull();

    const playerIds = stats.map((s: { player_id: string }) => s.player_id);
    expect(playerIds).not.toContain(players[3].id);
    expect(playerIds).toContain(players[0].id);
    expect(playerIds).toContain(players[1].id);
    expect(playerIds).toContain(players[2].id);
  });

  it("includes games vs hidden players in visible players' stats", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    // Two games — player[0] plays both, always opposite the hidden player[3]
    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7
    );
    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 9
    );

    await setPlayerHidden(admin, players[3].id, true);

    const { data: stats } = await anon.rpc("get_group_stats", { p_join_code: group.join_code });
    const p0 = stats.find((s: { player_id: string }) => s.player_id === players[0].id);

    expect(p0).toBeDefined();
    // Both games count — hiding player[3] does not reduce player[0]'s game count
    expect(Number(p0.games_played)).toBe(2);
  });

  it("result length equals visible player count (ranks will be 1…N with no gaps)", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7
    );

    // Hide 1 of 4 players — expect 3 rows back
    await setPlayerHidden(admin, players[2].id, true);

    const { data: stats } = await anon.rpc("get_group_stats", { p_join_code: group.join_code });
    expect(stats).toHaveLength(3);
  });

  it("unhiding a player restores them to results", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7
    );

    await setPlayerHidden(admin, players[3].id, true);
    const { data: hidden } = await anon.rpc("get_group_stats", { p_join_code: group.join_code });
    expect(hidden.map((s: { player_id: string }) => s.player_id)).not.toContain(players[3].id);

    await setPlayerHidden(admin, players[3].id, false);
    const { data: visible } = await anon.rpc("get_group_stats", { p_join_code: group.join_code });
    expect(visible.map((s: { player_id: string }) => s.player_id)).toContain(players[3].id);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. get_session_stats
// ══════════════════════════════════════════════════════════════

describe("hidden players — get_session_stats", () => {
  it("excludes hidden players from results", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7
    );

    await setPlayerHidden(admin, players[3].id, true);

    const { data: stats, error } = await anon.rpc("get_session_stats", { p_session_id: sessionId });
    expect(error).toBeNull();

    const playerIds = stats.map((s: { player_id: string }) => s.player_id);
    expect(playerIds).not.toContain(players[3].id);
    expect(playerIds).toContain(players[0].id);
    expect(playerIds).toContain(players[1].id);
    expect(playerIds).toContain(players[2].id);
  });

  it("includes games vs hidden players in visible players' session stats", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7
    );
    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 9
    );

    await setPlayerHidden(admin, players[3].id, true);

    const { data: stats } = await anon.rpc("get_session_stats", { p_session_id: sessionId });
    const p0 = stats.find((s: { player_id: string }) => s.player_id === players[0].id);

    expect(p0).toBeDefined();
    expect(Number(p0.games_played)).toBe(2);
  });

  it("result length equals visible player count", async () => {
    const group = await setupTestGroup(admin);
    const players = await setupTestPlayers(admin, group.id, 4);
    const sessionId = await setupTestSession(anon, group.join_code, players.map((p) => p.id));

    await recordGame(anon, sessionId,
      [players[0].id, players[1].id],
      [players[2].id, players[3].id],
      11, 7
    );

    await setPlayerHidden(admin, players[2].id, true);

    const { data: stats } = await anon.rpc("get_session_stats", { p_session_id: sessionId });
    expect(stats).toHaveLength(3);
  });
});
