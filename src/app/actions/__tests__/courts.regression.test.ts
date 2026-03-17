/**
 * Server Action Regression Tests — recordCourtGameAction
 *
 * Proves pre-flight validation in the courts server action preserves
 * prior pickleball behavior after sport abstraction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase client ────────────────────────────────────────────────────

const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getServerClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { recordCourtGameAction } from "../courts";

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockSessionQuery(sport = "pickleball", targetPoints = 11) {
  mockSingle.mockResolvedValue({
    data: {
      target_points_default: targetPoints,
      group: { sport },
    },
    error: null,
  });
}

function mockRpcSuccess() {
  mockRpc.mockResolvedValue({
    data: {
      ok: true,
      data: {
        game_id: "court-game-1",
        target_points: 11,
        win_by: 2,
        deltas: [],
      },
    },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── A. Pickleball validation parity ─────────────────────────────────────────

describe("A. Pickleball validation parity", () => {
  it("accepts valid pickleball score (11-9)", async () => {
    mockSessionQuery("pickleball", 11);
    mockRpcSuccess();
    const result = await recordCourtGameAction("full", "s1", "jc", 1, 11, 9);
    expect(result.ok).toBe(true);
  });

  it("rejects score below target (10-8)", async () => {
    mockSessionQuery("pickleball", 11);
    const result = await recordCourtGameAction("full", "s1", "jc", 1, 10, 8);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("BELOW_TARGET");
  });

  it("rejects equal scores (11-11)", async () => {
    mockSessionQuery("pickleball", 11);
    const result = await recordCourtGameAction("full", "s1", "jc", 1, 11, 11);
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("SCORES_EQUAL");
  });

  it("rejects negative scores", async () => {
    mockSessionQuery("pickleball", 11);
    const result = await recordCourtGameAction("full", "s1", "jc", 1, -1, 11);
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("NEGATIVE_SCORE");
  });

  it("accepts overtime score (13-11)", async () => {
    mockSessionQuery("pickleball", 11);
    mockRpcSuccess();
    const result = await recordCourtGameAction("full", "s1", "jc", 1, 13, 11);
    expect(result.ok).toBe(true);
  });
});

// ── B. Sport lookup fallback ────────────────────────────────────────────────

describe("B. Sport lookup fallback", () => {
  it("pickleball group uses pickleball config", async () => {
    mockSessionQuery("pickleball", 11);
    mockRpcSuccess();
    const result = await recordCourtGameAction("full", "s1", "jc", 1, 11, 7);
    expect(result.ok).toBe(true);
  });

  it("padel group in Phase 1 behaves like pickleball", async () => {
    mockSessionQuery("padel", 11);
    mockRpcSuccess();
    const result = await recordCourtGameAction("full", "s1", "jc", 1, 11, 7);
    expect(result.ok).toBe(true);
  });

  it("padel group rejects same invalid scores as pickleball", async () => {
    mockSessionQuery("padel", 11);
    const result = await recordCourtGameAction("full", "s1", "jc", 1, 10, 8);
    expect(result.ok).toBe(false);
  });
});

// ── C. Team-size parity (enforced via sportConfig in courts flow) ───────────

describe("C. Team-size parity", () => {
  it("courts flow resolves pickleball 2v2 via sport config", async () => {
    // The courts flow doesn't validate team sizes in the action
    // (teams come from court slot assignments, not user input).
    // But we verify the sport config used has correct playersPerTeam.
    const { getSportConfig } = await import("@/lib/sports");
    const config = getSportConfig("pickleball");
    expect(config.playersPerTeam).toBe(2);
  });
});
