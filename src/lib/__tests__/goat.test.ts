import { describe, it, expect } from "vitest";
import {
  isEligibleForReigningGoat,
  isEligibleForAllTimeGoat,
  getReigningGoat,
  getAllTimeGoat,
  getGoatResult,
} from "../goat";
import type { GoatCandidate } from "../goat";

/** Helper to create a GoatCandidate with sensible defaults. */
function makePlayer(overrides: Partial<GoatCandidate> & { player_id: string }): GoatCandidate {
  return {
    current_rdr: 1200,
    peak_rdr: 1200,
    games_rated: 0,
    win_pct: 50,
    point_diff: 0,
    peak_rating_achieved_at: null,
    rating_achieved_at: null,
    ...overrides,
  };
}

describe("isEligibleForReigningGoat", () => {
  it("requires >= 20 games AND rounded RDR >= 1400", () => {
    expect(isEligibleForReigningGoat(makePlayer({ player_id: "a", games_rated: 20, current_rdr: 1400 }))).toBe(true);
  });

  it("rejects < 20 games even with high RDR", () => {
    expect(isEligibleForReigningGoat(makePlayer({ player_id: "a", games_rated: 19, current_rdr: 1500 }))).toBe(false);
  });

  it("rejects RDR below 1400 even with many games", () => {
    expect(isEligibleForReigningGoat(makePlayer({ player_id: "a", games_rated: 100, current_rdr: 1399 }))).toBe(false);
  });

  it("uses Math.round — 1399.5 rounds to 1400 and qualifies", () => {
    expect(isEligibleForReigningGoat(makePlayer({ player_id: "a", games_rated: 20, current_rdr: 1399.5 }))).toBe(true);
  });

  it("uses Math.round — 1399.4 rounds to 1399 and does not qualify", () => {
    expect(isEligibleForReigningGoat(makePlayer({ player_id: "a", games_rated: 20, current_rdr: 1399.4 }))).toBe(false);
  });
});

describe("isEligibleForAllTimeGoat", () => {
  it("requires >= 50 games", () => {
    expect(isEligibleForAllTimeGoat(makePlayer({ player_id: "a", games_rated: 50 }))).toBe(true);
  });

  it("rejects < 50 games", () => {
    expect(isEligibleForAllTimeGoat(makePlayer({ player_id: "a", games_rated: 49 }))).toBe(false);
  });
});

describe("getReigningGoat", () => {
  it("returns null when no players are eligible", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 10, current_rdr: 1500 }),
      makePlayer({ player_id: "b", games_rated: 25, current_rdr: 1300 }),
    ];
    expect(getReigningGoat(players)).toBeNull();
  });

  it("returns the single eligible player", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 25, current_rdr: 1450 }),
      makePlayer({ player_id: "b", games_rated: 10, current_rdr: 1500 }),
    ];
    expect(getReigningGoat(players)).toBe("a");
  });

  it("picks higher current RDR when both eligible", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 25, current_rdr: 1450 }),
      makePlayer({ player_id: "b", games_rated: 25, current_rdr: 1500 }),
    ];
    expect(getReigningGoat(players)).toBe("b");
  });

  it("breaks RDR tie with more games rated", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 30, current_rdr: 1450 }),
      makePlayer({ player_id: "b", games_rated: 25, current_rdr: 1450 }),
    ];
    expect(getReigningGoat(players)).toBe("a");
  });

  it("breaks games tie with higher win %", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 30, current_rdr: 1450, win_pct: 70 }),
      makePlayer({ player_id: "b", games_rated: 30, current_rdr: 1450, win_pct: 65 }),
    ];
    expect(getReigningGoat(players)).toBe("a");
  });

  it("breaks win% tie with higher point diff", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 30, current_rdr: 1450, win_pct: 70, point_diff: 100 }),
      makePlayer({ player_id: "b", games_rated: 30, current_rdr: 1450, win_pct: 70, point_diff: 50 }),
    ];
    expect(getReigningGoat(players)).toBe("a");
  });

  it("breaks point_diff tie with earlier rating timestamp", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 30, current_rdr: 1450, win_pct: 70, point_diff: 100, rating_achieved_at: "2025-06-01T00:00:00Z" }),
      makePlayer({ player_id: "b", games_rated: 30, current_rdr: 1450, win_pct: 70, point_diff: 100, rating_achieved_at: "2025-05-01T00:00:00Z" }),
    ];
    expect(getReigningGoat(players)).toBe("b");
  });

  it("uses player_id as final stable fallback", () => {
    const players = [
      makePlayer({ player_id: "bbb", games_rated: 30, current_rdr: 1450, win_pct: 70, point_diff: 100 }),
      makePlayer({ player_id: "aaa", games_rated: 30, current_rdr: 1450, win_pct: 70, point_diff: 100 }),
    ];
    expect(getReigningGoat(players)).toBe("aaa");
  });
});

describe("getAllTimeGoat", () => {
  it("returns null when no players are eligible", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 49, peak_rdr: 1600 }),
    ];
    expect(getAllTimeGoat(players)).toBeNull();
  });

  it("returns the single eligible player", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 50, peak_rdr: 1300 }),
      makePlayer({ player_id: "b", games_rated: 10, peak_rdr: 1600 }),
    ];
    expect(getAllTimeGoat(players)).toBe("a");
  });

  it("picks higher peak RDR", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 50, peak_rdr: 1500 }),
      makePlayer({ player_id: "b", games_rated: 50, peak_rdr: 1600 }),
    ];
    expect(getAllTimeGoat(players)).toBe("b");
  });

  it("breaks peak tie with more games rated", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 60, peak_rdr: 1500 }),
      makePlayer({ player_id: "b", games_rated: 50, peak_rdr: 1500 }),
    ];
    expect(getAllTimeGoat(players)).toBe("a");
  });

  it("breaks games tie with higher current RDR", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 60, peak_rdr: 1500, current_rdr: 1400 }),
      makePlayer({ player_id: "b", games_rated: 60, peak_rdr: 1500, current_rdr: 1350 }),
    ];
    expect(getAllTimeGoat(players)).toBe("a");
  });

  it("breaks current RDR tie with higher win %", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 60, peak_rdr: 1500, current_rdr: 1400, win_pct: 70 }),
      makePlayer({ player_id: "b", games_rated: 60, peak_rdr: 1500, current_rdr: 1400, win_pct: 65 }),
    ];
    expect(getAllTimeGoat(players)).toBe("a");
  });

  it("breaks win% tie with earlier peak timestamp", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 60, peak_rdr: 1500, current_rdr: 1400, win_pct: 70, peak_rating_achieved_at: "2025-06-01T00:00:00Z" }),
      makePlayer({ player_id: "b", games_rated: 60, peak_rdr: 1500, current_rdr: 1400, win_pct: 70, peak_rating_achieved_at: "2025-05-01T00:00:00Z" }),
    ];
    expect(getAllTimeGoat(players)).toBe("b");
  });

  it("uses player_id as final stable fallback", () => {
    const players = [
      makePlayer({ player_id: "bbb", games_rated: 60, peak_rdr: 1500 }),
      makePlayer({ player_id: "aaa", games_rated: 60, peak_rdr: 1500 }),
    ];
    expect(getAllTimeGoat(players)).toBe("aaa");
  });
});

describe("getGoatResult", () => {
  it("returns both null when no eligible players", () => {
    const result = getGoatResult([]);
    expect(result.reigningGoatPlayerId).toBeNull();
    expect(result.allTimeGoatPlayerId).toBeNull();
  });

  it("same player can hold both titles", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 60, current_rdr: 1500, peak_rdr: 1600 }),
    ];
    const result = getGoatResult(players);
    expect(result.reigningGoatPlayerId).toBe("a");
    expect(result.allTimeGoatPlayerId).toBe("a");
  });

  it("different players can hold different titles", () => {
    const players = [
      makePlayer({ player_id: "reigning", games_rated: 25, current_rdr: 1500, peak_rdr: 1500 }),
      makePlayer({ player_id: "alltime", games_rated: 60, current_rdr: 1300, peak_rdr: 1600 }),
    ];
    const result = getGoatResult(players);
    expect(result.reigningGoatPlayerId).toBe("reigning");
    expect(result.allTimeGoatPlayerId).toBe("alltime");
  });

  it("reigning requires Elite tier — high-games player below 1400 does not qualify", () => {
    const players = [
      makePlayer({ player_id: "a", games_rated: 100, current_rdr: 1390, peak_rdr: 1600 }),
    ];
    const result = getGoatResult(players);
    expect(result.reigningGoatPlayerId).toBeNull();
    expect(result.allTimeGoatPlayerId).toBe("a");
  });
});
