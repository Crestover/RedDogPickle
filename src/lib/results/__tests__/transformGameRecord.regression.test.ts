/**
 * Transformation Regression Tests
 *
 * Proves the shared transformGameRecords() preserves prior pickleball behavior.
 */

import { describe, it, expect } from "vitest";
import { transformGameRecords } from "../transformGameRecord";
import type { RawGameRow } from "../transformGameRecord";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<RawGameRow> = {}): RawGameRow {
  return {
    id: "game-1",
    played_at: "2025-06-01T10:00:00Z",
    game_players: [
      { player_id: "p1", team: "A" },
      { player_id: "p2", team: "A" },
      { player_id: "p3", team: "B" },
      { player_id: "p4", team: "B" },
    ],
    ...overrides,
  };
}

// ── A. Standard pickleball game shape ───────────────────────────────────────

describe("A. Standard pickleball game shape", () => {
  it("transforms a standard 4-player game correctly", () => {
    const result = transformGameRecords([makeGame()]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("game-1");
    expect(result[0].teamAIds).toEqual(["p1", "p2"]);
    expect(result[0].teamBIds).toEqual(["p3", "p4"]);
    expect(result[0].played_at).toBe("2025-06-01T10:00:00Z");
  });

  it("preserves player ordering within teams", () => {
    const game = makeGame({
      game_players: [
        { player_id: "z-last", team: "A" },
        { player_id: "a-first", team: "A" },
        { player_id: "m-mid", team: "B" },
        { player_id: "b-second", team: "B" },
      ],
    });
    const result = transformGameRecords([game]);

    // Order should be preserved from input, not sorted
    expect(result[0].teamAIds).toEqual(["z-last", "a-first"]);
    expect(result[0].teamBIds).toEqual(["m-mid", "b-second"]);
  });
});

// ── B. Voided filtering parity ──────────────────────────────────────────────

describe("B. Voided filtering parity", () => {
  it("filters out voided games", () => {
    const games = [
      makeGame({ id: "voided-1", voided_at: "2025-06-01T11:00:00Z" }),
      makeGame({ id: "active-1" }),
    ];
    const result = transformGameRecords(games);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("active-1");
  });

  it("filters out all games when all are voided", () => {
    const games = [
      makeGame({ id: "v1", voided_at: "2025-06-01T11:00:00Z" }),
      makeGame({ id: "v2", voided_at: "2025-06-01T12:00:00Z" }),
    ];
    expect(transformGameRecords(games)).toHaveLength(0);
  });

  it("keeps all games when none are voided", () => {
    const games = [
      makeGame({ id: "g1" }),
      makeGame({ id: "g2" }),
      makeGame({ id: "g3" }),
    ];
    expect(transformGameRecords(games)).toHaveLength(3);
  });
});

// ── C. Ordering parity ─────────────────────────────────────────────────────

describe("C. Ordering parity", () => {
  it("preserves input order", () => {
    const games = [
      makeGame({ id: "first", played_at: "2025-06-01T10:00:00Z" }),
      makeGame({ id: "second", played_at: "2025-06-01T11:00:00Z" }),
      makeGame({ id: "third", played_at: "2025-06-01T12:00:00Z" }),
    ];
    const result = transformGameRecords(games);

    expect(result.map((r) => r.id)).toEqual(["first", "second", "third"]);
  });
});

// ── D. Graceful malformed input handling ────────────────────────────────────

describe("D. Graceful malformed input handling", () => {
  it("handles empty input", () => {
    expect(transformGameRecords([])).toEqual([]);
  });

  it("handles undefined game_players", () => {
    const game = makeGame({ game_players: undefined });
    const result = transformGameRecords([game]);

    expect(result).toHaveLength(1);
    expect(result[0].teamAIds).toEqual([]);
    expect(result[0].teamBIds).toEqual([]);
  });

  it("handles non-array game_players", () => {
    const game = makeGame({ game_players: "not-an-array" as unknown });
    const result = transformGameRecords([game]);

    expect(result).toHaveLength(1);
    expect(result[0].teamAIds).toEqual([]);
    expect(result[0].teamBIds).toEqual([]);
  });

  it("handles null game_players", () => {
    const game = makeGame({ game_players: null as unknown });
    const result = transformGameRecords([game]);

    expect(result).toHaveLength(1);
    expect(result[0].teamAIds).toEqual([]);
    expect(result[0].teamBIds).toEqual([]);
  });

  it("handles empty game_players array", () => {
    const game = makeGame({ game_players: [] });
    const result = transformGameRecords([game]);

    expect(result).toHaveLength(1);
    expect(result[0].teamAIds).toEqual([]);
    expect(result[0].teamBIds).toEqual([]);
  });
});
