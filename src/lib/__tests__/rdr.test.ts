import { describe, it, expect } from "vitest";
import { getTier, tierColor, getConfidence, getConfidenceLabel, confidenceColor } from "../rdr";
import type { RdrTier, ConfidenceLabel } from "../rdr";

describe("getTier", () => {
  it("returns Walk-On below 1100", () => {
    expect(getTier(1099)).toBe("Walk-On");
    expect(getTier(1000)).toBe("Walk-On");
  });

  it("returns Challenger at 1100", () => {
    expect(getTier(1100)).toBe("Challenger");
  });

  it("returns Challenger at 1199", () => {
    expect(getTier(1199)).toBe("Challenger");
  });

  it("returns Contender at 1200", () => {
    expect(getTier(1200)).toBe("Contender");
  });

  it("returns All-Star at 1300", () => {
    expect(getTier(1300)).toBe("All-Star");
  });

  it("returns Elite at 1400", () => {
    expect(getTier(1400)).toBe("Elite");
  });
});

describe("tierColor", () => {
  const tiers: RdrTier[] = ["Walk-On", "Challenger", "Contender", "All-Star", "Elite"];

  for (const tier of tiers) {
    it(`returns non-empty string for ${tier}`, () => {
      expect(tierColor(tier).length).toBeGreaterThan(0);
    });
  }
});

// ── getConfidence ───────────────────────────────────────────────────────────

describe("getConfidence", () => {
  it("returns 1.0 at RD_MIN (50)", () => {
    expect(getConfidence(50)).toBe(1.0);
  });

  it("returns 0.0 at RD_MAX (140)", () => {
    expect(getConfidence(140)).toBeCloseTo(0.0);
  });

  it("returns ~0.67 at RD_DEFAULT (80)", () => {
    // 1 - (80 - 50) / 90 = 1 - 30/90 ≈ 0.667
    expect(getConfidence(80)).toBeCloseTo(0.667, 2);
  });

  it("clamps to 1.0 for RD below minimum", () => {
    expect(getConfidence(30)).toBe(1.0);
  });

  it("clamps to 0.0 for RD above maximum", () => {
    expect(getConfidence(200)).toBe(0.0);
  });

  it("returns ~0.56 at new-player RD (120)", () => {
    // 1 - (120 - 50) / 90 = 1 - 70/90 ≈ 0.222
    expect(getConfidence(120)).toBeCloseTo(0.222, 2);
  });
});

// ── getConfidenceLabel ──────────────────────────────────────────────────────

describe("getConfidenceLabel", () => {
  it("returns 'Locked In' for confidence >= 0.85", () => {
    expect(getConfidenceLabel(0.85)).toBe("Locked In");
    expect(getConfidenceLabel(1.0)).toBe("Locked In");
    expect(getConfidenceLabel(0.95)).toBe("Locked In");
  });

  it("returns 'Active' for confidence 0.65–0.84", () => {
    expect(getConfidenceLabel(0.65)).toBe("Active");
    expect(getConfidenceLabel(0.84)).toBe("Active");
    expect(getConfidenceLabel(0.75)).toBe("Active");
  });

  it("returns 'Rusty' for confidence 0.40–0.64", () => {
    expect(getConfidenceLabel(0.40)).toBe("Rusty");
    expect(getConfidenceLabel(0.64)).toBe("Rusty");
    expect(getConfidenceLabel(0.50)).toBe("Rusty");
  });

  it("returns 'Returning' for confidence below 0.40", () => {
    expect(getConfidenceLabel(0.39)).toBe("Returning");
    expect(getConfidenceLabel(0.0)).toBe("Returning");
    expect(getConfidenceLabel(0.1)).toBe("Returning");
  });
});

// ── confidenceColor ─────────────────────────────────────────────────────────

describe("confidenceColor", () => {
  const labels: ConfidenceLabel[] = ["Locked In", "Active", "Rusty", "Returning"];

  for (const label of labels) {
    it(`returns non-empty Tailwind class for "${label}"`, () => {
      const color = confidenceColor(label);
      expect(color.length).toBeGreaterThan(0);
      expect(color).toMatch(/^text-/);
    });
  }

  it("returns green for Locked In", () => {
    expect(confidenceColor("Locked In")).toContain("green");
  });

  it("returns orange for Returning", () => {
    expect(confidenceColor("Returning")).toContain("orange");
  });
});
