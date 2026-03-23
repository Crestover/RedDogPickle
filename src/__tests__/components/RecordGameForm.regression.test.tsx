/**
 * RecordGameForm Regression Tests
 *
 * Proves winner preview, team-size enforcement, preset rendering,
 * submit gating, and the action payload remain correct for the
 * tap-to-select Quick Game UI.
 *
 * Interaction model (new UI):
 *   - Tap a player row → auto-assigned (taps 1+2 → Team A, taps 3+4 → Team B)
 *   - Score inputs only appear once 4 players are selected (progressive disclosure)
 *   - CTA label: "Select 4 players" → "Enter score" → "Record Game"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import RecordGameForm from "@/app/g/[join_code]/session/[session_id]/RecordGameForm";
import { recordGameAction } from "@/app/actions/games";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/games", () => ({
  recordGameAction: vi.fn(),
  undoGameAction: vi.fn(),
}));

vi.mock("@/app/actions/sessions", () => ({
  setSessionRulesAction: vi.fn(),
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

const attendees = [
  { id: "p1", display_name: "Alice Smith", code: "AS" },
  { id: "p2", display_name: "Bob Jones", code: "BJ" },
  { id: "p3", display_name: "Carol Lee", code: "CL" },
  { id: "p4", display_name: "Dave Kim", code: "DK" },
  { id: "p5", display_name: "Eve Park", code: "EP" },
];

const defaultProps = {
  sessionId: "s1",
  joinCode: "abc",
  attendees,
  sessionRules: { targetPoints: 11, winBy: 1 },
  sportConfig: { targetPresets: [11, 15, 21], playersPerTeam: 2 },
};

function renderForm(overrides = {}) {
  return render(<RecordGameForm {...defaultProps} {...overrides} />);
}

/**
 * Tap 4 players in order (1+2 → Team A, 3+4 → Team B), then fill in scores.
 * Call after renderForm(). Score inputs only appear after the 4th tap.
 */
function selectPlayersAndScores(scoreA: string, scoreB: string) {
  fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }));
  fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));
  fireEvent.click(screen.getByRole("button", { name: /Carol Lee/ }));
  fireEvent.click(screen.getByRole("button", { name: /Dave Kim/ }));
  fireEvent.change(screen.getByLabelText("Team A"), { target: { value: scoreA } });
  fireEvent.change(screen.getByLabelText("Team B"), { target: { value: scoreB } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── A. Winner preview behavior ──────────────────────────────────────────────

describe("A. Winner preview behavior", () => {
  it("11-7 shows Winner label for team A", () => {
    renderForm();
    selectPlayersAndScores("11", "7");
    expect(screen.getAllByText("Winner")).toHaveLength(1);
    expect(screen.getAllByText("Loser")).toHaveLength(1);
  });

  it("7-11 shows Winner label for team B", () => {
    renderForm();
    selectPlayersAndScores("7", "11");
    expect(screen.getAllByText("Winner")).toHaveLength(1);
    expect(screen.getAllByText("Loser")).toHaveLength(1);
  });

  it("11-0 shows correct winner (shutout)", () => {
    renderForm();
    selectPlayersAndScores("11", "0");
    expect(screen.getAllByText("Winner")).toHaveLength(1);
    expect(screen.getAllByText("Loser")).toHaveLength(1);
  });

  it("equal scores do not show Winner/Loser labels", () => {
    renderForm();
    selectPlayersAndScores("7", "7");
    expect(screen.queryAllByText("Winner")).toHaveLength(0);
    expect(screen.queryAllByText("Loser")).toHaveLength(0);
  });
});

// ── B. Team-size enforcement ────────────────────────────────────────────────

describe("B. Team-size enforcement", () => {
  it("team cards show placeholder text before any selection", () => {
    renderForm();
    // Both Team A and Team B cards should have "Select 2 players" placeholder
    expect(screen.getAllByText(/Select 2 players/)).toHaveLength(2);
  });

  it("first 2 taps fill Team A, removing its placeholder", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));
    // Team A placeholder gone; only Team B placeholder remains
    expect(screen.getAllByText(/Select 2 players/)).toHaveLength(1);
  });

  it("taps 3 and 4 fill Team B; 5th tap is ignored when teams are full", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));
    fireEvent.click(screen.getByRole("button", { name: /Carol Lee/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dave Kim/ }));

    // All 4 assigned — both placeholders gone, score section visible
    expect(screen.queryAllByText(/Select 2 players/)).toHaveLength(0);
    expect(screen.getByLabelText("Team A")).toBeInTheDocument();

    // 5th tap should be a no-op: CTA stays at "Enter score" not "Select 4 players"
    fireEvent.click(screen.getByRole("button", { name: /Eve Park/ }));
    expect(screen.getByRole("button", { name: "Enter score" })).toBeInTheDocument();
  });
});

// ── C. Preset rendering ─────────────────────────────────────────────────────

describe("C. Preset rendering", () => {
  it("renders target presets from sportConfig when picker is open", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Game to 11/i }));
    expect(screen.getByRole("button", { name: "11" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "21" })).toBeInTheDocument();
  });

  it("renders only the presets passed via sportConfig", () => {
    renderForm({ sportConfig: { targetPresets: [7, 11], playersPerTeam: 2 } });
    fireEvent.click(screen.getByRole("button", { name: /Game to 11/i }));
    expect(screen.getByRole("button", { name: "7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "15" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "21" })).not.toBeInTheDocument();
  });
});

// ── D. CTA label progression ────────────────────────────────────────────────

describe("D. CTA label progression", () => {
  it("shows 'Select 4 players' before any selection", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Select 4 players" })).toBeInTheDocument();
  });

  it("shows 'Enter score' after 4 players selected but no scores entered", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));
    fireEvent.click(screen.getByRole("button", { name: /Carol Lee/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dave Kim/ }));
    expect(screen.getByRole("button", { name: "Enter score" })).toBeInTheDocument();
  });

  it("shows 'Record Game' when teams complete and scores entered", () => {
    renderForm();
    selectPlayersAndScores("11", "7");
    expect(screen.getByRole("button", { name: "Record Game" })).toBeInTheDocument();
  });

  it("score section is hidden until 4 players are selected", () => {
    renderForm();
    expect(screen.queryByLabelText("Team A")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));
    fireEvent.click(screen.getByRole("button", { name: /Carol Lee/ }));
    expect(screen.queryByLabelText("Team A")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Dave Kim/ }));
    expect(screen.getByLabelText("Team A")).toBeInTheDocument();
  });
});

// ── E. CTA is a no-op when form is incomplete ────────────────────────────────

describe("E. CTA no-op when form incomplete", () => {
  it("does not call recordGameAction when no players selected", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Select 4 players" }));
    expect(recordGameAction).not.toHaveBeenCalled();
  });

  it("does not call recordGameAction when players selected but no scores", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));
    fireEvent.click(screen.getByRole("button", { name: /Carol Lee/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dave Kim/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enter score" }));
    expect(recordGameAction).not.toHaveBeenCalled();
  });
});

// ── F. Successful submit calls action with correct payload ──────────────────

describe("F. Submit action payload", () => {
  it("calls recordGameAction with correct players and scores", async () => {
    const mockResult = {
      success: true as const,
      gameId: "g1",
      deltas: [],
      targetPoints: 11,
      winBy: 1,
      undoExpiresAt: new Date(Date.now() + 8000).toISOString(),
    };
    vi.mocked(recordGameAction).mockResolvedValue(mockResult);

    renderForm();

    // Taps 1+2 → Team A (Alice, Bob), taps 3+4 → Team B (Carol, Dave)
    fireEvent.click(screen.getByRole("button", { name: /Alice Smith/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob Jones/ }));
    fireEvent.click(screen.getByRole("button", { name: /Carol Lee/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dave Kim/ }));

    fireEvent.change(screen.getByLabelText("Team A"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Team B"), { target: { value: "7" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Record Game" }));
    });

    expect(recordGameAction).toHaveBeenCalledWith(
      "full",
      "s1",          // sessionId
      "abc",         // joinCode
      ["p1", "p2"],  // Team A: Alice, Bob
      ["p3", "p4"],  // Team B: Carol, Dave
      11,            // scoreA
      7,             // scoreB
      false          // force
    );
  });
});
