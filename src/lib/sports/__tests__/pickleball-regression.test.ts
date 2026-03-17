/**
 * Pickleball Scoring Parity Regression Tests
 *
 * Proves Phase 1 sport abstraction preserves prior pickleball behavior exactly.
 * Table-driven where possible. Covers config, validation, outcome, suspicious
 * score, shutout, and rating-input parity.
 */

import { describe, it, expect } from "vitest";
import { getSportConfig } from "../index";
import type { SportConfig } from "../types";

// ── Fixtures ────────────────────────────────────────────────────────────────

let pickleball: SportConfig;
let padel: SportConfig;

beforeEach(() => {
  pickleball = getSportConfig("pickleball");
  padel = getSportConfig("padel");
});

// ── A. Config parity ────────────────────────────────────────────────────────

describe("A. Config parity", () => {
  it("returns expected pickleball config values", () => {
    expect(pickleball.sport).toBe("pickleball");
    expect(pickleball.targetPresets).toEqual([11, 15, 21]);
    expect(pickleball.winByOptions).toEqual([1, 2]);
    expect(pickleball.defaultTargetPoints).toBe(11);
    expect(pickleball.defaultWinBy).toBe(2);
    expect(pickleball.playersPerTeam).toBe(2);
    expect(pickleball.playersPerCourt).toBe(4);
    expect(pickleball.maxCourts).toBe(8);
  });
});

// ── B. Phase 1 padel fallback parity ────────────────────────────────────────

describe("B. Phase 1 padel fallback parity", () => {
  it("padel has same target presets as pickleball", () => {
    expect([...padel.targetPresets]).toEqual([...pickleball.targetPresets]);
  });

  it("padel has same player/team counts as pickleball", () => {
    expect(padel.playersPerTeam).toBe(pickleball.playersPerTeam);
    expect(padel.playersPerCourt).toBe(pickleball.playersPerCourt);
    expect(padel.maxCourts).toBe(pickleball.maxCourts);
  });

  it("padel validation behaves like pickleball", () => {
    expect(padel.validateScores(11, 7, 11)).toEqual(pickleball.validateScores(11, 7, 11));
    expect(padel.validateScores(10, 8, 11)).toEqual(pickleball.validateScores(10, 8, 11));
  });

  it("padel outcome derivation behaves like pickleball", () => {
    expect(padel.deriveOutcome(11, 7)).toEqual(pickleball.deriveOutcome(11, 7));
    expect(padel.deriveOutcome(7, 11)).toEqual(pickleball.deriveOutcome(7, 11));
  });
});

// ── C. Score validation regression table ────────────────────────────────────

describe("C. Score validation regression table", () => {
  const validCases: [number, number, number][] = [
    [11, 0, 11],
    [11, 9, 11],
    [15, 13, 15],
    [21, 19, 21],
    [12, 10, 11],
    [13, 11, 11],
    [13, 10, 11],
  ];

  it.each(validCases)(
    "(%d, %d, target=%d) → valid",
    (a, b, target) => {
      const result = pickleball.validateScores(a, b, target);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.code).toBeUndefined();
    }
  );

  const invalidCases: [number, number, number, string][] = [
    [10, 8, 11, "BELOW_TARGET"],
    [11, 11, 11, "SCORES_EQUAL"],
    [-1, 11, 11, "NEGATIVE_SCORE"],
    [11, -1, 11, "NEGATIVE_SCORE"],
    [0, 0, 11, "SCORES_EQUAL"],
    [5, 5, 11, "SCORES_EQUAL"],
  ];

  it.each(invalidCases)(
    "(%d, %d, target=%d) → invalid with code %s",
    (a, b, target, expectedCode) => {
      const result = pickleball.validateScores(a, b, target);
      expect(result.valid).toBe(false);
      expect(result.code).toBe(expectedCode);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
      expect(result.error!.length).toBeGreaterThan(0);
    }
  );
});

// ── D. Outcome derivation ───────────────────────────────────────────────────

describe("D. Outcome derivation", () => {
  const cases: [number, number, "A" | "B"][] = [
    [11, 7, "A"],
    [7, 11, "B"],
    [15, 13, "A"],
    [19, 21, "B"],
  ];

  it.each(cases)(
    "(%d, %d) → winner %s",
    (a, b, expectedWinner) => {
      const result = pickleball.deriveOutcome(a, b);
      expect(result.winner).toBe(expectedWinner);
      expect(result.loser).toBe(expectedWinner === "A" ? "B" : "A");
    }
  );
});

// ── E. Suspicious-score behavior ────────────────────────────────────────────

describe("E. Suspicious-score behavior", () => {
  const cases: [number, number, number, boolean][] = [
    [11, 9, 11, false],
    [12, 10, 11, false],
    [13, 11, 11, false],
    [13, 10, 11, true],
    [15, 13, 15, false],
    [17, 14, 15, true],
    [10, 8, 11, false],
  ];

  it.each(cases)(
    "(%d, %d, target=%d) → suspicious=%s",
    (a, b, target, expected) => {
      expect(pickleball.isSuspiciousScore(a, b, target)).toBe(expected);
    }
  );
});

// ── F. Shutout behavior ─────────────────────────────────────────────────────

describe("F. Shutout behavior", () => {
  const cases: [number, number, number, boolean][] = [
    [11, 0, 11, true],
    [0, 11, 11, true],
    [15, 0, 15, true],
    [21, 0, 21, true],
    [11, 1, 11, false],
    [5, 0, 11, false],
    [11, 3, 11, false],
  ];

  it.each(cases)(
    "(%d, %d, target=%d) → shutout=%s",
    (a, b, target, expected) => {
      expect(pickleball.isShutout(a, b, target)).toBe(expected);
    }
  );
});

// ── G. Rating-input parity ──────────────────────────────────────────────────

describe("G. Rating-input parity", () => {
  const cases: [number, number, number, number][] = [
    [11, 7, 11, 4],
    [11, 0, 11, 11],
    [15, 13, 15, 2],
    [21, 19, 21, 2],
  ];

  it.each(cases)(
    "(%d, %d, target=%d) → gameDiff=%d",
    (a, b, target, expectedDiff) => {
      const result = pickleball.computeRatingInputs({ scoreA: a, scoreB: b, targetPoints: target });
      expect(result.gameDiff).toBe(expectedDiff);
    }
  );
});
