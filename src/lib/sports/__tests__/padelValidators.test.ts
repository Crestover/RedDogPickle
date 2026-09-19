import { describe, it, expect } from "vitest";
import {
  validatePadelScores,
  isPadelShutout,
  isPadelSuspiciousScore,
  PADEL_SET_TARGET,
} from "../padelValidators";

describe("validatePadelScores", () => {
  it("accepts a normal set win (6-2)", () => {
    expect(validatePadelScores(6, 2)).toEqual({ valid: true });
  });

  it("accepts a bagel (6-0)", () => {
    expect(validatePadelScores(6, 0)).toEqual({ valid: true });
  });

  it("accepts the closest normal-margin set (6-4)", () => {
    expect(validatePadelScores(6, 4)).toEqual({ valid: true });
  });

  it("rejects a 1-game-margin set below the win-by-2 threshold (6-5)", () => {
    const result = validatePadelScores(6, 5);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_SET_SCORE");
  });

  it("accepts the win-by-2 extension from 5-5 (7-5)", () => {
    expect(validatePadelScores(7, 5)).toEqual({ valid: true });
  });

  it("rejects a 1-game-margin extended set (7-6) — no tiebreak, must win by 2", () => {
    const result = validatePadelScores(7, 6);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_SET_SCORE");
  });

  it("accepts a further win-by-2 extension (8-6)", () => {
    expect(validatePadelScores(8, 6)).toEqual({ valid: true });
  });

  it("accepts a long extended set with no upper cap (9-7)", () => {
    expect(validatePadelScores(9, 7)).toEqual({ valid: true });
  });

  it("accepts an even longer extended set (12-10)", () => {
    expect(validatePadelScores(12, 10)).toEqual({ valid: true });
  });

  it("rejects a score below the win condition (5-3)", () => {
    const result = validatePadelScores(5, 3);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_SET_SCORE");
  });

  it("rejects a margin greater than 2 once past 5-5 (9-6)", () => {
    const result = validatePadelScores(9, 6);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_SET_SCORE");
  });

  it("rejects negative scores", () => {
    const result = validatePadelScores(-1, 4);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("NEGATIVE_SCORE");
  });

  it("rejects equal scores", () => {
    const result = validatePadelScores(6, 6);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("SCORES_EQUAL");
  });

  it("is symmetric regardless of which side won", () => {
    expect(validatePadelScores(2, 6)).toEqual({ valid: true });
    expect(validatePadelScores(7, 9)).toEqual({ valid: true });
  });
});

describe("isPadelShutout", () => {
  it("detects a 6-0 bagel", () => {
    expect(isPadelShutout(6, 0)).toBe(true);
    expect(isPadelShutout(0, 6)).toBe(true);
  });

  it("does not flag a normal margin (6-4)", () => {
    expect(isPadelShutout(6, 4)).toBe(false);
  });

  it("does not flag an extended set (9-7)", () => {
    expect(isPadelShutout(9, 7)).toBe(false);
  });
});

describe("isPadelSuspiciousScore", () => {
  it("always returns false — every legal set score is unremarkable", () => {
    expect(isPadelSuspiciousScore()).toBe(false);
  });
});

describe("PADEL_SET_TARGET", () => {
  it("is 6 games", () => {
    expect(PADEL_SET_TARGET).toBe(6);
  });
});
