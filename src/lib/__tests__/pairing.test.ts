import { describe, it, expect } from "vitest";
import { pairKey } from "../pairing";

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });

  it("uses canonical (alphabetical) ordering", () => {
    expect(pairKey("z", "a")).toBe("a:z");
    expect(pairKey("a", "z")).toBe("a:z");
  });

  it("handles UUIDs", () => {
    const id1 = "abc-123";
    const id2 = "xyz-789";
    expect(pairKey(id1, id2)).toBe(pairKey(id2, id1));
  });
});
