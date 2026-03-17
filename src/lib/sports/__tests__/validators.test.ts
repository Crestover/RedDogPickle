import { describe, it, expect } from "vitest";
import { validateScores, isSuspiciousScore, isShutout } from "../validators";

describe("validateScores (shared)", () => {
  it("returns valid for a normal game", () => {
    expect(validateScores(11, 7, 11)).toEqual({ valid: true });
  });

  it("returns valid for overtime game", () => {
    expect(validateScores(13, 11, 11)).toEqual({ valid: true });
  });

  it("rejects negative scores with NEGATIVE_SCORE code", () => {
    const result = validateScores(-1, 5, 11);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("NEGATIVE_SCORE");
    expect(result.error).toBe("Scores cannot be negative.");
  });

  it("rejects equal scores with SCORES_EQUAL code", () => {
    const result = validateScores(7, 7, 11);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("SCORES_EQUAL");
    expect(result.error).toBe("Scores cannot be equal.");
  });

  it("rejects winner below target with BELOW_TARGET code", () => {
    const result = validateScores(9, 5, 11);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("BELOW_TARGET");
    expect(result.error).toContain("at least 11");
  });

  it("works with target=15", () => {
    expect(validateScores(15, 10, 15)).toEqual({ valid: true });
    const result = validateScores(14, 10, 15);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("BELOW_TARGET");
  });

  it("works with target=21", () => {
    expect(validateScores(21, 18, 21)).toEqual({ valid: true });
  });
});

describe("isSuspiciousScore (shared)", () => {
  it("returns false for normal win at target", () => {
    expect(isSuspiciousScore(11, 5, 11)).toBe(false);
  });

  it("returns false for normal overtime (margin=2)", () => {
    expect(isSuspiciousScore(13, 11, 11)).toBe(false);
  });

  it("returns true when overtime margin exceeds 2", () => {
    expect(isSuspiciousScore(15, 11, 11)).toBe(true);
  });

  it("returns true for extreme overtime", () => {
    expect(isSuspiciousScore(20, 11, 11)).toBe(true);
  });
});

describe("isShutout (shared)", () => {
  it("detects shutout (11-0)", () => {
    expect(isShutout(11, 0, 11)).toBe(true);
  });

  it("detects shutout (0-11)", () => {
    expect(isShutout(0, 11, 11)).toBe(true);
  });

  it("does not flag below-target (5-0)", () => {
    expect(isShutout(5, 0, 11)).toBe(false);
  });

  it("does not flag non-zero loser (11-3)", () => {
    expect(isShutout(11, 3, 11)).toBe(false);
  });

  it("detects shutout with target=21", () => {
    expect(isShutout(21, 0, 21)).toBe(true);
  });
});
