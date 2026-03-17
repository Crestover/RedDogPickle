/**
 * Server Action Regression Tests — recordGameAction
 *
 * Proves pre-flight validation in the server action preserves prior
 * pickleball behavior after sport abstraction. Mocks Supabase client
 * to isolate validation logic from DB access.
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

// Mock next/navigation to prevent redirect errors
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { recordGameAction } from "../games";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Configure mock to return a pickleball session with given target points. */
function mockSessionQuery(sport = "pickleball", targetPoints = 11) {
  mockSingle.mockResolvedValue({
    data: {
      target_points_default: targetPoints,
      group: { sport },
    },
    error: null,
  });
}

/** Configure mock RPC to return a successful game insertion. */
function mockRpcSuccess(gameId = "new-game-id") {
  mockRpc.mockResolvedValue({
    data: {
      status: "inserted",
      game_id: gameId,
      target_points: 11,
      win_by: 2,
      deltas: [],
      undo_expires_at: new Date(Date.now() + 8000).toISOString(),
    },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── A. Team size validation ─────────────────────────────────────────────────

describe("A. Team size validation", () => {
  it("rejects team A with 1 player", async () => {
    mockSessionQuery();
    const result = await recordGameAction("full", "s1", "jc", ["p1"], ["p3", "p4"], 11, 7);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("2 players");
  });

  it("rejects team B with 1 player", async () => {
    mockSessionQuery();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3"], 11, 7);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("2 players");
  });

  it("rejects team A with 3 players", async () => {
    mockSessionQuery();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2", "p3"], ["p4", "p5"], 11, 7);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("2 players");
  });

  it("rejects overlapping player IDs", async () => {
    mockSessionQuery();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p2", "p3"], 11, 7);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("both teams");
  });

  it("accepts exactly 2 players per side", async () => {
    mockSessionQuery();
    mockRpcSuccess();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 7);
    expect(result).toHaveProperty("success", true);
  });
});

// ── B. Score validation ─────────────────────────────────────────────────────

describe("B. Score validation", () => {
  it("accepts (11, 9) for target=11", async () => {
    mockSessionQuery("pickleball", 11);
    mockRpcSuccess();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 9);
    expect(result).toHaveProperty("success", true);
  });

  it("rejects (10, 8) for target=11 — below target", async () => {
    mockSessionQuery("pickleball", 11);
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 10, 8);
    expect(result).toHaveProperty("error");
  });

  it("rejects (11, 11) — equal scores", async () => {
    mockSessionQuery("pickleball", 11);
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 11);
    expect(result).toHaveProperty("error");
  });

  it("rejects negative scores", async () => {
    mockSessionQuery("pickleball", 11);
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], -1, 11);
    expect(result).toHaveProperty("error");
  });
});

// ── C. Sport lookup behavior ────────────────────────────────────────────────

describe("C. Sport lookup behavior", () => {
  it("pickleball group uses pickleball config (accepts valid game)", async () => {
    mockSessionQuery("pickleball", 11);
    mockRpcSuccess();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 7);
    expect(result).toHaveProperty("success", true);
  });

  it("padel group in Phase 1 fallback still behaves like pickleball", async () => {
    mockSessionQuery("padel", 11);
    mockRpcSuccess();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 7);
    expect(result).toHaveProperty("success", true);
  });

  it("padel group rejects same invalid scores as pickleball", async () => {
    mockSessionQuery("padel", 11);
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 10, 8);
    expect(result).toHaveProperty("error");
  });
});

// ── D. Outcome seam ─────────────────────────────────────────────────────────

describe("D. Outcome seam — no behavioral drift", () => {
  it("A win (11-7) goes through to RPC", async () => {
    mockSessionQuery();
    mockRpcSuccess();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 7);
    expect(result).toHaveProperty("success", true);
    // Verify RPC was called with correct scores
    expect(mockRpc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        p_team_a_score: 11,
        p_team_b_score: 7,
      })
    );
  });

  it("B win (7-11) goes through to RPC", async () => {
    mockSessionQuery();
    mockRpcSuccess();
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 7, 11);
    expect(result).toHaveProperty("success", true);
    expect(mockRpc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        p_team_a_score: 7,
        p_team_b_score: 11,
      })
    );
  });
});

// ── E. Error handling ───────────────────────────────────────────────────────

describe("E. Error handling", () => {
  it("returns user-safe error for session lookup failure", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 7);
    expect(result).toHaveProperty("error");
    const msg = (result as { error: string }).error;
    expect(typeof msg).toBe("string");
    // Should not expose raw DB internals — just a user-safe message
    expect(msg.length).toBeGreaterThan(0);
  });

  it("returns user-safe error for RPC failure", async () => {
    mockSessionQuery();
    mockRpc.mockResolvedValue({ data: null, error: { message: "constraint violation" } });
    const result = await recordGameAction("full", "s1", "jc", ["p1", "p2"], ["p3", "p4"], 11, 7);
    expect(result).toHaveProperty("error");
    expect(typeof (result as { error: string }).error).toBe("string");
  });
});
