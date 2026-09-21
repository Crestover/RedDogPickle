/**
 * PlayerStatsRow Sport-Label Regression Tests
 *
 * Legacy component still used by the view-only session detail page's
 * Standings tab (/v/[view_code]/session/[session_id]). Same sport-aware
 * label concern as LeaderboardCard: padel counts sets, not games/points.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayerStatsRow from "@/lib/components/PlayerStatsRow";
import type { PlayerStats } from "@/lib/types";

function makePlayer(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    player_id: "p1",
    display_name: "Alice Smith",
    code: "AS",
    games_played: 9,
    games_won: 6,
    win_pct: 66.7,
    points_for: 90,
    points_against: 70,
    point_diff: 20,
    avg_point_diff: 2.2,
    ...overrides,
  };
}

describe("A. Pickleball labels (default — no sport prop)", () => {
  it("shows 'games' as the played-count unit", () => {
    render(<PlayerStatsRow rank={1} player={makePlayer({ games_played: 9 })} />);
    expect(screen.getByText("9 games")).toBeInTheDocument();
  });

  it("shows PF/PA for points for/against", () => {
    render(<PlayerStatsRow rank={1} player={makePlayer({ points_for: 90, points_against: 70 })} />);
    expect(screen.getByText(/PF 90 \/ PA 70/)).toBeInTheDocument();
  });

  it("labels the point-diff stat 'pt diff'", () => {
    render(<PlayerStatsRow rank={1} player={makePlayer()} />);
    expect(screen.getByText("pt diff")).toBeInTheDocument();
  });
});

describe("B. Padel labels", () => {
  it("shows 'sets' as the played-count unit", () => {
    render(<PlayerStatsRow rank={1} player={makePlayer({ games_played: 9 })} sport="padel" />);
    expect(screen.getByText("9 sets")).toBeInTheDocument();
  });

  it("shows GF/GA for games for/against", () => {
    render(<PlayerStatsRow rank={1} player={makePlayer({ points_for: 90, points_against: 70 })} sport="padel" />);
    expect(screen.getByText(/GF 90 \/ GA 70/)).toBeInTheDocument();
  });

  it("labels the point-diff stat 'game diff'", () => {
    render(<PlayerStatsRow rank={1} player={makePlayer()} sport="padel" />);
    expect(screen.getByText("game diff")).toBeInTheDocument();
  });

  it("does not show pickleball's PF/PA or 'pt diff'", () => {
    render(<PlayerStatsRow rank={1} player={makePlayer()} sport="padel" />);
    expect(screen.queryByText(/PF /)).not.toBeInTheDocument();
    expect(screen.queryByText("pt diff")).not.toBeInTheDocument();
  });
});
