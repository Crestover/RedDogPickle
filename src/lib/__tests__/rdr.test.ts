import { describe, it, expect } from "vitest";
import { getTier, tierColor } from "../rdr";
import type { RdrTier } from "../rdr";

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
