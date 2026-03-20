/**
 * GamesList Regression Tests
 *
 * Proves scoreboard layout, winner/loser hierarchy, colored scores,
 * and voided-game behavior remain correct.
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

  it("loser names appear in muted style below winner", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    const gameCard = container.querySelector(".rounded-xl");
    const loserLine = gameCard?.querySelector(".text-xs.text-gray-500");
    expect(loserLine).not.toBeNull();
    expect(loserLine!.textContent).toContain("Carol");
    expect(loserLine!.textContent).not.toContain("Alice");
  });
});

// ── B. Score styling ────────────────────────────────────────────────────────

describe("B. Score styling", () => {
  it("winner score is green, loser score is gray", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 7 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    // Score container is text-lg font-extrabold tabular-nums
    const scoreContainer = container.querySelector(".text-lg.font-extrabold.tabular-nums");
    expect(scoreContainer).not.toBeNull();
    const scoreSpans = scoreContainer!.querySelectorAll("span");
    // First span = winner score (emerald), second = separator, third = loser score (gray)
    expect(scoreSpans[0].textContent).toBe("11");
    expect((scoreSpans[0] as HTMLElement).style.color).toBe("rgb(22, 118, 89)");
    expect(scoreSpans[2].textContent).toBe("07");
    expect(scoreSpans[2].classList.contains("text-gray-400")).toBe(true);
  });

  it("scores are zero-padded", () => {
    const game = makeGame({ team_a_score: 11, team_b_score: 3 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    const grayScore = container.querySelector("span.text-lg span.text-gray-400");
    expect(grayScore!.textContent).toBe("03");
  });

  it("does not use 'vs' between teams", () => {
    const game = makeGame();
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);
    expect(container.textContent).not.toContain(" vs ");
  });
});

// ── C. Game badge ───────────────────────────────────────────────────────────

describe("C. Game badge", () => {
  it("renders green game badge with G prefix", () => {
    const game = makeGame({ sequence_num: 12 });
    const { container } = render(<GamesList games={[game]} activeCount={1} totalCount={1} />);

    const badge = container.querySelector(".rounded-lg.font-extrabold.tracking-tight");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("G12");
    expect((badge as HTMLElement).style.backgroundColor).toBe("rgb(213, 230, 236)");
    expect((badge as HTMLElement).style.color).toBe("rgb(22, 118, 89)");
  });
});

// ── D. Voided-game behavior ─────────────────────────────────────────────────

describe("D. Voided-game behavior", () => {
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

    const gameCard = container.querySelector(".opacity-60");
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

    // Score visible (padded)
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("07")).toBeInTheDocument();
    // Winner names visible
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    // Loser names visible
    expect(screen.getByText(/Carol/)).toBeInTheDocument();
  });

  it("voided cards use muted styling for scores (no green)", () => {
    const voided = makeGame({
      id: "g1", sequence_num: 1,
      team_a_score: 11, team_b_score: 7,
      voided_at: "2025-06-01T11:00:00Z",
    });

    const { container } = render(<GamesList games={[voided]} activeCount={0} totalCount={1} />);
    fireEvent.click(screen.getByText("Show voided"));

    // Score container inside voided card should use gray, not emerald
    const scoreContainer = container.querySelector(".opacity-60 .text-lg.font-extrabold.tabular-nums");
    expect(scoreContainer).not.toBeNull();
    const winnerScoreSpan = scoreContainer!.querySelectorAll("span")[0];
    expect(winnerScoreSpan.classList.contains("text-gray-500")).toBe(true);
    // Should NOT have inline green color when voided
    expect((winnerScoreSpan as HTMLElement).style.color).toBe("");
  });
});

// ── E. Toggle round-trip ─────────────────────────────────────────────────

describe("E. Toggle round-trip", () => {
  it("clicking toggle twice hides voided games again", () => {
    const active = makeGame({ id: "g1", sequence_num: 1 });
    const voided = makeGame({ id: "g2", sequence_num: 2, voided_at: "2025-06-01T11:00:00Z" });

    render(<GamesList games={[active, voided]} activeCount={1} totalCount={2} />);

    expect(screen.queryByText("G2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Show voided"));
    expect(screen.getByText("G2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hide voided"));
    expect(screen.queryByText("G2")).not.toBeInTheDocument();
  });
});
