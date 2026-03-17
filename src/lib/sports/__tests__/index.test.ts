import { describe, it, expect } from "vitest";
import { getSportConfig } from "../index";

describe("getSportConfig", () => {
  it("returns valid config for pickleball", () => {
    const config = getSportConfig("pickleball");
    expect(config.sport).toBe("pickleball");
    expect(config.displayName).toBe("Pickleball");
    expect(config.targetPresets).toBeDefined();
  });

  it("returns valid config for padel (temporary clone)", () => {
    const config = getSportConfig("padel");
    expect(config).toBeDefined();
    expect(config.targetPresets).toBeDefined();
  });
});
