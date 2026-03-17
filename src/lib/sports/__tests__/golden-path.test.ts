import { describe, it, expect } from "vitest";
import { getSportConfig } from "../index";

/**
 * Golden-path integration test — verifies the entire SportConfig contract
 * works together as a single coherent flow. Documents the expected contract
 * that Phase 2 padel must also satisfy.
 */
describe("golden-path: full game lifecycle through sport layer", () => {
  it("validates, derives outcome, computes rating inputs, and checks edge cases", () => {
    // 1. Get sport config
    const config = getSportConfig("pickleball");
    expect(config.sport).toBe("pickleball");

    // 2. Validate a normal game
    const validation = config.validateScores(11, 7, 11);
    expect(validation).toEqual({ valid: true });

    // 3. Derive outcome
    const outcome = config.deriveOutcome(11, 7);
    expect(outcome).toEqual({ winner: "A", loser: "B" });

    // 4. Compute rating inputs
    const ratingInputs = config.computeRatingInputs({
      scoreA: 11,
      scoreB: 7,
      targetPoints: 11,
    });
    expect(ratingInputs).toEqual({ gameDiff: 4 });

    // 5. Check suspicious score (normal game — not suspicious)
    expect(config.isSuspiciousScore(11, 7, 11)).toBe(false);

    // 6. Check shutout
    expect(config.isShutout(11, 0, 11)).toBe(true);
    expect(config.isShutout(11, 7, 11)).toBe(false);
  });
});
