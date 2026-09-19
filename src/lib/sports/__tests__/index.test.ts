import { describe, it, expect } from "vitest";
import { getSportConfig } from "../index";

describe("getSportConfig", () => {
  it("returns valid config for pickleball", () => {
    const config = getSportConfig("pickleball");
    expect(config.sport).toBe("pickleball");
    expect(config.displayName).toBe("Pickleball");
    expect(config.targetPresets).toBeDefined();
  });

  it("returns valid config for padel", () => {
    const config = getSportConfig("padel");
    expect(config.sport).toBe("padel");
    expect(config.displayName).toBe("Padel");
    expect(config.targetPresets).toEqual([6]);
  });
});
