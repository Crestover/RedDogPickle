/**
 * EndedSessionGames Regression Tests
 *
 * Proves winner/loser hierarchy and score rendering remain correct
 * after scoreboard v2 layout update.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EndedSessionGames from "@/app/g/[join_code]/session/[session_id]/EndedSessionGames";

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

// ── A. Winner/loser hierarchy ───────────────────────────────────────────

describe("A. Winner/loser hierarchy", () => {
  it("11-7 → team A names shown as winner (bold, first line)", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<EndedSessionGames games={[game]} />);

    const winnerLine = container.querySelector(".text-sm.font-semibold.text-gray-900");
    expect(winnerLine).not.toBeNull();
    expect(winnerLine!.textContent).toContain("Alice");
  });

  it("7-11 → team B names shown as winner (bold, first line)", () => {
    const game = makeGame({ team_a_score: 7, team_b_score: 11 });
    const { container } = render(<EndedSessionGames games={[game]} />);

    const winnerLine = container.querySelector(".text-sm.font-semibold.text-gray-900");
    expect(winnerLine).not.toBeNull();
    expect(winnerLine!.textContent).toContain("Carol");
  });
});

// ── B. Ended-session rendering parity ───────────────────────────────────────

describe("B. Ended-session rendering parity", () => {
  it("renders score correctly", () => {
    const game = makeGame({ team_a_score: 15, team_b_score: 13 });
    render(<EndedSessionGames games={[game]} />);

    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
  });

  it("renders team names correctly", () => {
    const game = makeGame();
    render(<EndedSessionGames games={[game]} />);

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Carol/)).toBeInTheDocument();
  });

  it("renders game count header", () => {
    const games = [
      makeGame({ id: "g1", sequence_num: 1 }),
      makeGame({ id: "g2", sequence_num: 2 }),
    ];
    render(<EndedSessionGames games={games} />);

    expect(screen.getByText(/Games \(2\)/)).toBeInTheDocument();
  });

  it("no display regression — voided games excluded from count", () => {
    const games = [
      makeGame({ id: "g1", sequence_num: 1 }),
      makeGame({ id: "g2", sequence_num: 2, voided_at: "2025-06-01T11:00:00Z" }),
    ];
    render(<EndedSessionGames games={games} />);

    expect(screen.getByText(/Games \(1/)).toBeInTheDocument();
  });

  it("multiple games rendered in order", () => {
    const games = [
      makeGame({ id: "g1", sequence_num: 1, team_a_score: 11, team_b_score: 7 }),
      makeGame({ id: "g2", sequence_num: 2, team_a_score: 15, team_b_score: 13 }),
      makeGame({ id: "g3", sequence_num: 3, team_a_score: 11, team_b_score: 9 }),
    ];
    render(<EndedSessionGames games={games} />);

    expect(screen.getByText(/Games \(3/)).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
  });
});

// ── C. Winner/loser styling exclusivity ─────────────────────────────────────

describe("C. Winner/loser styling exclusivity", () => {
  it("loser team names appear in muted style, not bold", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<EndedSessionGames games={[game]} />);

    const gameCard = container.querySelector(".rounded-xl");
    const loserLine = gameCard?.querySelector(".text-xs.text-gray-500");
    expect(loserLine).not.toBeNull();
    expect(loserLine!.textContent).toContain("Carol");
    expect(loserLine!.textContent).not.toContain("Alice");
  });
});
