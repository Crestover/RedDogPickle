/**
 * GamesList Regression Tests
 *
 * Proves winner/loser hierarchy and voided-game behavior remain correct
 * after v2 card layout update.
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

// ── A. Winner/loser hierarchy ─────────────────────────────────────────────

describe("A. Winner/loser hierarchy", () => {
  it("11-7 shows team A names as winner (bold, first line)", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    // Winner line should be font-semibold and dark
    const winnerLine = container.querySelector(".text-sm.font-semibold.text-gray-900");
    expect(winnerLine).not.toBeNull();
    expect(winnerLine!.textContent).toContain("Alice");
  });

  it("7-11 shows team B names as winner (bold, first line)", () => {
    const game = makeGame({ team_a_score: 7, team_b_score: 11 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    const winnerLine = container.querySelector(".text-sm.font-semibold.text-gray-900");
    expect(winnerLine).not.toBeNull();
    expect(winnerLine!.textContent).toContain("Carol");
  });

  it("winner score appears before loser score", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    // Score should render as "11 - 7" (winner first)
    expect(screen.getByText("11 - 7")).toBeInTheDocument();
  });
});

// ── B. Voided-game behavior ─────────────────────────────────────────────────

describe("B. Voided-game behavior", () => {
  it("voided games are hidden by default", () => {
    const active = makeGame({ id: "g1", sequence_num: 1 });
    const voided = makeGame({ id: "g2", sequence_num: 2, voided_at: "2025-06-01T11:00:00Z" });

    render(<GamesList games={[active, voided]} activeCount={1} totalCount={2} />);

    expect(screen.getByText("G1")).toBeInTheDocument();
    expect(screen.queryByText("G2")).not.toBeInTheDocument();
  });

  it("shows voided games when toggle is clicked", () => {
    const active = makeGame({ id: "g1", sequence_num: 1 });
    const voided = makeGame({ id: "g2", sequence_num: 2, voided_at: "2025-06-01T11:00:00Z" });

    render(<GamesList games={[active, voided]} activeCount={1} totalCount={2} />);

    fireEvent.click(screen.getByText("Show voided"));
    expect(screen.getByText("G2")).toBeInTheDocument();
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

    const gameCard = container.querySelector(".opacity-50");
    expect(gameCard).not.toBeNull();
  });

  it("voided cards still show player names and score", () => {
    const voided = makeGame({
      id: "g1", sequence_num: 1,
      team_a_score: 11, team_b_score: 7,
      voided_at: "2025-06-01T11:00:00Z",
    });

    render(<GamesList games={[voided]} activeCount={0} totalCount={1} />);
    fireEvent.click(screen.getByText("Show voided"));

    // Score visible
    expect(screen.getByText("11 - 7")).toBeInTheDocument();
    // Winner names visible
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    // Loser names visible
    expect(screen.getByText(/Carol/)).toBeInTheDocument();
  });
});

// ── C. Score display ────────────────────────────────────────────────────────

describe("C. Score display", () => {
  it("renders score as winner-loser with hyphen", () => {
    const game = makeGame({ team_a_score: 15, team_b_score: 13 });
    render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    expect(screen.getByText("15 - 13")).toBeInTheDocument();
  });

  it("renders game badge with G prefix", () => {
    const game = makeGame({ sequence_num: 5 });
    render(<GamesList games={[game]} activeCount={1} totalCount={1} />);
    expect(screen.getByText("G5")).toBeInTheDocument();
  });

  it("does not use 'vs' between teams", () => {
    const game = makeGame();
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);
    expect(container.textContent).not.toContain(" vs ");
  });
});

// ── D. Toggle round-trip ─────────────────────────────────────────────────

describe("D. Toggle round-trip", () => {
  it("clicking toggle twice hides voided games again", () => {
    const active = makeGame({ id: "g1", sequence_num: 1 });
    const voided = makeGame({ id: "g2", sequence_num: 2, voided_at: "2025-06-01T11:00:00Z" });

    render(<GamesList games={[active, voided]} activeCount={1} totalCount={2} />);

    // Initially hidden
    expect(screen.queryByText("G2")).not.toBeInTheDocument();

    // Show
    fireEvent.click(screen.getByText("Show voided"));
    expect(screen.getByText("G2")).toBeInTheDocument();

    // Hide again
    fireEvent.click(screen.getByText("Hide voided"));
    expect(screen.queryByText("G2")).not.toBeInTheDocument();
  });
});

// ── E. Winner/loser styling exclusivity ──────────────────────────────────

describe("E. Winner/loser styling exclusivity", () => {
  it("loser team names appear in muted style below winner", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    // Loser names in muted text-xs style (inside game card, not header)
    const gameCard = container.querySelector(".rounded-xl");
    const loserLine = gameCard?.querySelector("p.text-xs");
    expect(loserLine).not.toBeNull();
    expect(loserLine!.textContent).toContain("Carol");
    expect(loserLine!.textContent).not.toContain("Alice");
  });

  it("voided cards use muted styling for both winner and loser", () => {
    const voided = makeGame({
      id: "g1", sequence_num: 1,
      team_a_score: 11, team_b_score: 7,
      voided_at: "2025-06-01T11:00:00Z",
    });

    const { container } = render(<GamesList games={[voided]} activeCount={0} totalCount={1} />);
    fireEvent.click(screen.getByText("Show voided"));

    // Voided card should have opacity and muted text
    const gameCard = container.querySelector(".opacity-50");
    expect(gameCard).not.toBeNull();

    // Winner line uses gray-500 (muted) instead of gray-900
    const winnerLine = container.querySelector(".text-sm.font-semibold.text-gray-500");
    expect(winnerLine).not.toBeNull();
  });
});
