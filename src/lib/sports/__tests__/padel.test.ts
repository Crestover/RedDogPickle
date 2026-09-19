import { describe, it, expect } from "vitest";
import { padelConfig } from "../padel";

describe("padelConfig", () => {
  describe("constants", () => {
    it("has a single 6-game set target preset", () => {
      expect(padelConfig.targetPresets).toEqual([6]);
    });

    it("defaults to a 6-game set, win by 2", () => {
      expect(padelConfig.defaultTargetPoints).toBe(6);
      expect(padelConfig.defaultWinBy).toBe(2);
    });

    it("has correct players per team (doubles)", () => {
      expect(padelConfig.playersPerTeam).toBe(2);
    });

    it("has correct players per court and max courts", () => {
      expect(padelConfig.playersPerCourt).toBe(4);
      expect(padelConfig.maxCourts).toBe(8);
    });
  });

  describe("validateScores", () => {
    it("returns valid for a normal set (6-2)", () => {
      expect(padelConfig.validateScores(6, 2, 6)).toEqual({ valid: true });
    });

    it("returns valid for an extended win-by-2 set with no cap (9-7)", () => {
      expect(padelConfig.validateScores(9, 7, 6)).toEqual({ valid: true });
    });

    it("rejects a 1-game-margin set (6-5) — no tiebreak, must win by 2", () => {
      const result = padelConfig.validateScores(6, 5, 6);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_SET_SCORE");
    });

    it("rejects equal scores", () => {
      expect(padelConfig.validateScores(6, 6, 6).valid).toBe(false);
    });
  });

  describe("isSuspiciousScore", () => {
    it("always returns false for padel", () => {
      expect(padelConfig.isSuspiciousScore(9, 7, 6)).toBe(false);
      expect(padelConfig.isSuspiciousScore(6, 0, 6)).toBe(false);
    });
  });

  describe("isShutout", () => {
    it("detects a 6-0 bagel", () => {
      expect(padelConfig.isShutout(6, 0, 6)).toBe(true);
    });

    it("does not flag a normal margin (6-4)", () => {
      expect(padelConfig.isShutout(6, 4, 6)).toBe(false);
    });
  });

  describe("deriveOutcome", () => {
    it("A wins when scoreA > scoreB", () => {
      expect(padelConfig.deriveOutcome(6, 2)).toEqual({ winner: "A", loser: "B" });
    });

    it("B wins when scoreB > scoreA", () => {
      expect(padelConfig.deriveOutcome(2, 6)).toEqual({ winner: "B", loser: "A" });
    });
  });

  describe("computeRatingInputs", () => {
    it("returns games-won diff as gameDiff", () => {
      expect(
        padelConfig.computeRatingInputs({ scoreA: 6, scoreB: 2, targetPoints: 6 })
      ).toEqual({ gameDiff: 4 });
    });

    it("returns a diff of 2 for an extended win-by-2 set", () => {
      expect(
        padelConfig.computeRatingInputs({ scoreA: 9, scoreB: 7, targetPoints: 6 })
      ).toEqual({ gameDiff: 2 });
    });
  });
});
