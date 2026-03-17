import { describe, it, expect } from "vitest";
import { getTier, tierColor } from "../rdr";
import type { RdrTier } from "../rdr";

describe("getTier", () => {
  it("returns Observer below 1100", () => {
    expect(getTier(1099)).toBe("Observer");
    expect(getTier(1000)).toBe("Observer");
  });

  it("returns Practitioner at 1100", () => {
    expect(getTier(1100)).toBe("Practitioner");
  });

  it("returns Practitioner at 1199", () => {
    expect(getTier(1199)).toBe("Practitioner");
  });

  it("returns Strategist at 1200", () => {
    expect(getTier(1200)).toBe("Strategist");
  });

  it("returns Authority at 1300", () => {
    expect(getTier(1300)).toBe("Authority");
  });

  it("returns Architect at 1400", () => {
    expect(getTier(1400)).toBe("Architect");
  });
});

describe("tierColor", () => {
  const tiers: RdrTier[] = ["Observer", "Practitioner", "Strategist", "Authority", "Architect"];

  for (const tier of tiers) {
    it(`returns non-empty string for ${tier}`, () => {
      expect(tierColor(tier).length).toBeGreaterThan(0);
    });
  }
});
