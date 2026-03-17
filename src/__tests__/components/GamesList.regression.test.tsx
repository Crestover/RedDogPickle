/**
 * GamesList Regression Tests
 *
 * Proves winner highlighting and voided-game behavior remain correct
 * after Phase 1 sport abstraction.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GamesList from "@/app/g/[join_code]/session/[session_id]/games/GamesList";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<{
  id: string;
  sequence_num: number;
  team_a_score: number;
  team_b_score: number;
  played_at: string;
  voided_at: string | null;
  game_players: { player_id: string; team: string; players: { id: string; display_name: string; code: string } }[];
}> = {}) {
  return {
    id: "g1",
    sequence_num: 1,
    team_a_score: 11,
    team_b_score: 7,
    played_at: "2025-06-01T10:00:00Z",
    voided_at: null,
    game_players: [
      { player_id: "p1", team: "A", players: { id: "p1", display_name: "Alice Smith", code: "AS" } },
      { player_id: "p2", team: "A", players: { id: "p2", display_name: "Bob Jones", code: "BJ" } },
      { player_id: "p3", team: "B", players: { id: "p3", display_name: "Carol Lee", code: "CL" } },
      { player_id: "p4", team: "B", players: { id: "p4", display_name: "Dave Kim", code: "DK" } },
    ],
    ...overrides,
  };
}

// ── A. Winner highlighting ──────────────────────────────────────────────────

describe("A. Winner highlighting", () => {
  it("11-7 highlights team A names with emerald", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    // Team A names should have emerald class
    const teamANames = container.querySelector(".text-emerald-600.font-medium");
    expect(teamANames).not.toBeNull();
    expect(teamANames!.textContent).toContain("Alice");
  });

  it("7-11 highlights team B names with emerald", () => {
    const game = makeGame({ team_a_score: 7, team_b_score: 11 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    // Find all emerald-colored name spans
    const emeraldNames = container.querySelectorAll(".text-emerald-600.font-medium");
    expect(emeraldNames).toHaveLength(1);
    expect(emeraldNames[0].textContent).toContain("Carol");
  });

  it("winner score is emerald, loser score is gray", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    // Score display: emerald for winner, gray for loser
    const emeraldScores = container.querySelectorAll(".text-emerald-600");
    const grayScores = container.querySelectorAll("span.text-gray-700");
    expect(emeraldScores.length).toBeGreaterThan(0);
    expect(grayScores.length).toBeGreaterThan(0);
  });
});

// ── B. Voided-game behavior ─────────────────────────────────────────────────

describe("B. Voided-game behavior", () => {
  it("voided games are hidden by default", () => {
    const active = makeGame({ id: "g1", sequence_num: 1 });
    const voided = makeGame({ id: "g2", sequence_num: 2, voided_at: "2025-06-01T11:00:00Z" });

    render(<GamesList games={[active, voided]} activeCount={1} totalCount={2} />);

    expect(screen.getByText("Game #1")).toBeInTheDocument();
    expect(screen.queryByText("Game #2")).not.toBeInTheDocument();
  });

  it("shows voided games when toggle is clicked", () => {
    const active = makeGame({ id: "g1", sequence_num: 1 });
    const voided = makeGame({ id: "g2", sequence_num: 2, voided_at: "2025-06-01T11:00:00Z" });

    render(<GamesList games={[active, voided]} activeCount={1} totalCount={2} />);

    fireEvent.click(screen.getByText("Show voided"));
    expect(screen.getByText("Game #2")).toBeInTheDocument();
  });

  it("voided games show Voided badge", () => {
    const voided = makeGame({ id: "g1", sequence_num: 1, voided_at: "2025-06-01T11:00:00Z" });

    render(<GamesList games={[voided]} activeCount={0} totalCount={1} />);
    fireEvent.click(screen.getByText("Show voided"));

    expect(screen.getByText("Voided")).toBeInTheDocument();
  });

  it("voided games have reduced opacity", () => {
    const voided = makeGame({ id: "g1", sequence_num: 1, voided_at: "2025-06-01T11:00:00Z" });

    const { container } = render(<GamesList games={[voided]} activeCount={0} totalCount={1} />);
    fireEvent.click(screen.getByText("Show voided"));

    const gameCard = container.querySelector(".opacity-60");
    expect(gameCard).not.toBeNull();
  });
});

// ── C. Score display ────────────────────────────────────────────────────────

describe("C. Score display", () => {
  it("renders score text correctly", () => {
    const game = makeGame({ team_a_score: 15, team_b_score: 13 });
    render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
  });

  it("renders game sequence number", () => {
    const game = makeGame({ sequence_num: 5 });
    render(<GamesList games={[game]} activeCount={1} totalCount={1} />);
    expect(screen.getByText("Game #5")).toBeInTheDocument();
  });
});
