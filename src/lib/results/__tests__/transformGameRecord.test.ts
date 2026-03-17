import { describe, it, expect } from "vitest";
import { transformGameRecords } from "../transformGameRecord";
import type { RawGameRow } from "../transformGameRecord";

describe("transformGameRecords", () => {
  it("transforms rows into GameRecord format", () => {
    const raw: RawGameRow[] = [
      {
        id: "g1",
        played_at: "2025-01-01T00:00:00Z",
        game_players: [
          { player_id: "p1", team: "A" },
          { player_id: "p2", team: "A" },
          { player_id: "p3", team: "B" },
          { player_id: "p4", team: "B" },
        ],
      },
    ];

    const result = transformGameRecords(raw);
    expect(result).toHaveLength(1);
    expect(result[0].teamAIds).toEqual(["p1", "p2"]);
    expect(result[0].teamBIds).toEqual(["p3", "p4"]);
    expect(result[0].id).toBe("g1");
  });

  it("filters out voided games", () => {
    const raw: RawGameRow[] = [
      { id: "g1", played_at: "2025-01-01T00:00:00Z", voided_at: "2025-01-01T01:00:00Z", game_players: [] },
      { id: "g2", played_at: "2025-01-01T00:00:00Z", game_players: [] },
    ];

    const result = transformGameRecords(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g2");
  });

  it("handles empty input", () => {
    expect(transformGameRecords([])).toEqual([]);
  });

  it("handles non-array game_players gracefully", () => {
    const raw: RawGameRow[] = [
      { id: "g1", played_at: "2025-01-01T00:00:00Z", game_players: undefined },
    ];

    const result = transformGameRecords(raw);
    expect(result).toHaveLength(1);
    expect(result[0].teamAIds).toEqual([]);
    expect(result[0].teamBIds).toEqual([]);
  });
});
