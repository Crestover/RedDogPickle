import { describe, it, expect } from "vitest";
import { suggestForCourts } from "../autoSuggest";

describe("suggestForCourts", () => {
  it("assigns 4 players to 1 court with 2 players per team", () => {
    const players = ["p1", "p2", "p3", "p4"];
    const result = suggestForCourts([], players, [1], []);
    expect(result).toHaveLength(1);
    expect(result[0].teamA).toHaveLength(2);
    expect(result[0].teamB).toHaveLength(2);
    expect(result[0].courtNumber).toBe(1);
  });

  it("assigns 8 players to 2 courts", () => {
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const result = suggestForCourts([], players, [1, 2], []);
    expect(result).toHaveLength(2);
  });

  it("returns empty when insufficient players", () => {
    const players = ["p1", "p2", "p3"];
    const result = suggestForCourts([], players, [1], []);
    expect(result).toHaveLength(0);
  });
});
