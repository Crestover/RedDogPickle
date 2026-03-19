import { describe, it, expect } from "vitest";
import { formatDiff, shortName } from "../formatting";

// ── formatDiff ──────────────────────────────────────────────────────────────

describe("formatDiff", () => {
  it("prepends + for positive numbers", () => {
    expect(formatDiff(5)).toBe("+5");
    expect(formatDiff(1)).toBe("+1");
    expect(formatDiff(100)).toBe("+100");
  });

  it("returns plain string for zero (no + sign)", () => {
    expect(formatDiff(0)).toBe("0");
  });

  it("returns negative sign for negative numbers", () => {
    expect(formatDiff(-3)).toBe("-3");
    expect(formatDiff(-1)).toBe("-1");
    expect(formatDiff(-50)).toBe("-50");
  });

  it("handles decimal values", () => {
    expect(formatDiff(2.5)).toBe("+2.5");
    expect(formatDiff(-0.1)).toBe("-0.1");
  });
});

// ── shortName ───────────────────────────────────────────────────────────────

describe("shortName", () => {
  it("shortens 'First Last' to 'First L.'", () => {
    expect(shortName("Joe Smith")).toBe("Joe S.");
    expect(shortName("Sam Lee")).toBe("Sam L.");
  });

  it("returns single name unchanged", () => {
    expect(shortName("Mike")).toBe("Mike");
  });

  it("uses last name initial for three-word names", () => {
    expect(shortName("Mary Jane Watson")).toBe("Mary W.");
  });

  it("handles extra whitespace", () => {
    expect(shortName("  Joe   Smith  ")).toBe("Joe S.");
  });

  it("handles empty string gracefully", () => {
    expect(shortName("")).toBe("");
  });
});
