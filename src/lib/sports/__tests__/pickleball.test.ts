import { describe, it, expect } from "vitest";
import { pickleballConfig } from "../pickleball";

describe("pickleballConfig", () => {
  describe("constants", () => {
    it("has correct target presets", () => {
      expect(pickleballConfig.targetPresets).toEqual([11, 15, 21]);
    });

    it("has correct players per team", () => {
      expect(pickleballConfig.playersPerTeam).toBe(2);
    });

    it("has correct players per court", () => {
      expect(pickleballConfig.playersPerCourt).toBe(4);
    });

    it("has correct max courts", () => {
      expect(pickleballConfig.maxCourts).toBe(8);
    });
  });

  describe("validateScores", () => {
    it("returns valid for a normal game", () => {
      expect(pickleballConfig.validateScores(11, 7, 11)).toEqual({ valid: true });
    });

    it("returns valid for overtime game", () => {
      expect(pickleballConfig.validateScores(12, 10, 11)).toEqual({ valid: true });
    });

    it("rejects negative scores", () => {
      const result = pickleballConfig.validateScores(-1, 5, 11);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("NEGATIVE_SCORE");
    });

    it("rejects equal scores", () => {
      const result = pickleballConfig.validateScores(7, 7, 11);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("SCORES_EQUAL");
    });

    it("rejects winner below target", () => {
      const result = pickleballConfig.validateScores(9, 5, 11);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("BELOW_TARGET");
    });
  });

  describe("isSuspiciousScore", () => {
    it("returns false for normal overtime (margin=2)", () => {
      expect(pickleballConfig.isSuspiciousScore(13, 11, 11)).toBe(false);
    });

    it("returns true for suspicious margin in overtime", () => {
      expect(pickleballConfig.isSuspiciousScore(15, 11, 11)).toBe(true);
    });

    it("returns false when winner is at target", () => {
      expect(pickleballConfig.isSuspiciousScore(11, 5, 11)).toBe(false);
    });
  });

  describe("isShutout", () => {
    it("detects 11-0 as shutout", () => {
      expect(pickleballConfig.isShutout(11, 0, 11)).toBe(true);
    });

    it("detects 0-11 as shutout", () => {
      expect(pickleballConfig.isShutout(0, 11, 11)).toBe(true);
    });

    it("does not flag 5-0 as shutout (below target)", () => {
      expect(pickleballConfig.isShutout(5, 0, 11)).toBe(false);
    });

    it("does not flag 11-3 as shutout", () => {
      expect(pickleballConfig.isShutout(11, 3, 11)).toBe(false);
    });
  });

  describe("deriveOutcome", () => {
    it("A wins when scoreA > scoreB", () => {
      expect(pickleballConfig.deriveOutcome(11, 5)).toEqual({
        winner: "A",
        loser: "B",
      });
    });

    it("B wins when scoreB > scoreA", () => {
      expect(pickleballConfig.deriveOutcome(3, 11)).toEqual({
        winner: "B",
        loser: "A",
      });
    });
  });

  describe("computeRatingInputs", () => {
    it("returns correct gameDiff", () => {
      expect(
        pickleballConfig.computeRatingInputs({ scoreA: 11, scoreB: 7, targetPoints: 11 })
      ).toEqual({ gameDiff: 4 });
    });

    it("returns gameDiff when B wins", () => {
      expect(
        pickleballConfig.computeRatingInputs({ scoreA: 3, scoreB: 11, targetPoints: 11 })
      ).toEqual({ gameDiff: 8 });
    });
  });
});
