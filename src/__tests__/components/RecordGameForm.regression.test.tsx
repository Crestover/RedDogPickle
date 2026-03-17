/**
 * RecordGameForm Regression Tests
 *
 * Proves winner preview, team-size enforcement, and preset rendering
 * remain correct after Phase 1 sport abstraction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecordGameForm from "@/app/g/[join_code]/session/[session_id]/RecordGameForm";

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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── A. Winner preview behavior ──────────────────────────────────────────────

describe("A. Winner preview behavior", () => {
  function assignTeamsAndScores(scoreA: string, scoreB: string) {
    renderForm();

    // Assign p1 and p2 to team A
    const aButtons = screen.getAllByRole("button", { name: "A" });
    fireEvent.click(aButtons[0]); // p1 → A
    fireEvent.click(aButtons[1]); // p2 → A

    // Assign p3 and p4 to team B
    const bButtons = screen.getAllByRole("button", { name: "B" });
    fireEvent.click(bButtons[2]); // p3 → B
    fireEvent.click(bButtons[3]); // p4 → B

    // Enter scores
    const scoreInputA = screen.getByLabelText("Team A Score");
    const scoreInputB = screen.getByLabelText("Team B Score");
    fireEvent.change(scoreInputA, { target: { value: scoreA } });
    fireEvent.change(scoreInputB, { target: { value: scoreB } });
  }

  it("11-7 shows Winner label for team A", () => {
    assignTeamsAndScores("11", "7");
    const winners = screen.getAllByText("Winner");
    const losers = screen.getAllByText("Loser");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
  });

  it("7-11 shows Winner label for team B", () => {
    assignTeamsAndScores("7", "11");
    const winners = screen.getAllByText("Winner");
    const losers = screen.getAllByText("Loser");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
  });

  it("11-0 shows correct winner (shutout)", () => {
    assignTeamsAndScores("11", "0");
    expect(screen.getAllByText("Winner")).toHaveLength(1);
    expect(screen.getAllByText("Loser")).toHaveLength(1);
  });

  it("equal scores do not show Winner/Loser labels", () => {
    assignTeamsAndScores("7", "7");
    expect(screen.queryAllByText("Winner")).toHaveLength(0);
    expect(screen.queryAllByText("Loser")).toHaveLength(0);
  });
});

// ── B. Team-size enforcement ────────────────────────────────────────────────

describe("B. Team-size enforcement", () => {
  it("shows /2 in team panel headers (from sportConfig)", () => {
    renderForm();
    expect(screen.getByText(/Team A \(0\/2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Team B \(0\/2\)/)).toBeInTheDocument();
  });

  it("cannot assign more than 2 players to team A", () => {
    renderForm();
    const aButtons = screen.getAllByRole("button", { name: "A" });

    fireEvent.click(aButtons[0]); // p1 → A
    fireEvent.click(aButtons[1]); // p2 → A

    // After 2 assigned, team A should show 2/2
    expect(screen.getByText(/Team A \(2\/2\)/)).toBeInTheDocument();

    // Third A button for p3 should be disabled
    expect(aButtons[2]).toBeDisabled();
  });

  it("cannot assign more than 2 players to team B", () => {
    renderForm();
    const bButtons = screen.getAllByRole("button", { name: "B" });

    fireEvent.click(bButtons[0]); // p1 → B
    fireEvent.click(bButtons[1]); // p2 → B

    expect(screen.getByText(/Team B \(2\/2\)/)).toBeInTheDocument();
    expect(bButtons[2]).toBeDisabled();
  });
});

// ── C. Preset rendering ─────────────────────────────────────────────────────

describe("C. Preset rendering", () => {
  it("renders target presets from sportConfig when picker is open", () => {
    renderForm();

    // Open rule picker
    const ruleChip = screen.getByRole("button", { name: /Game to 11/i });
    fireEvent.click(ruleChip);

    // All three presets should be visible
    expect(screen.getByRole("button", { name: "11" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "21" })).toBeInTheDocument();
  });

  it("renders only the presets passed via sportConfig", () => {
    renderForm({ sportConfig: { targetPresets: [7, 11], playersPerTeam: 2 } });

    const ruleChip = screen.getByRole("button", { name: /Game to 11/i });
    fireEvent.click(ruleChip);

    expect(screen.getByRole("button", { name: "7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "15" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "21" })).not.toBeInTheDocument();
  });
});
