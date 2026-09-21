/**
 * LeaderboardCard Sport-Label Regression Tests
 *
 * Padel's recorded unit is a set (with games won/lost inside it), not a
 * pickleball game/points pair. Proves the sport-aware label swap
 * (games -> sets, Points For/Against -> Games For/Against) stays correct
 * as the component evolves. Pickleball must remain unaffected.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LeaderboardCard from "@/lib/components/LeaderboardCard";
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
  it("shows 'games' as the collapsed played-count unit", () => {
    render(<LeaderboardCard rank={1} player={makePlayer({ games_played: 9 })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("9 games")).toBeInTheDocument();
  });

  it("uses singular 'game' for a count of 1", () => {
    render(<LeaderboardCard rank={1} player={makePlayer({ games_played: 1 })} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("1 game")).toBeInTheDocument();
  });

  it("expanded grid shows Games / Points For / Points Against", () => {
    render(<LeaderboardCard rank={1} player={makePlayer()} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText("Games")).toBeInTheDocument();
    expect(screen.getByText("Points For")).toBeInTheDocument();
    expect(screen.getByText("Points Against")).toBeInTheDocument();
  });
});

describe("B. Pickleball labels (explicit sport=\"pickleball\")", () => {
  it("behaves identically to the default", () => {
    render(<LeaderboardCard rank={1} player={makePlayer()} sport="pickleball" expanded={true} onToggle={() => {}} />);
    expect(screen.getByText("Games")).toBeInTheDocument();
    expect(screen.getByText("Points For")).toBeInTheDocument();
    expect(screen.getByText("Points Against")).toBeInTheDocument();
  });
});

describe("C. Padel labels", () => {
  it("shows 'sets' as the collapsed played-count unit", () => {
    render(<LeaderboardCard rank={1} player={makePlayer({ games_played: 9 })} sport="padel" expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("9 sets")).toBeInTheDocument();
  });

  it("uses singular 'set' for a count of 1", () => {
    render(<LeaderboardCard rank={1} player={makePlayer({ games_played: 1 })} sport="padel" expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("1 set")).toBeInTheDocument();
  });

  it("expanded grid shows Sets / Games For / Games Against", () => {
    render(<LeaderboardCard rank={1} player={makePlayer()} sport="padel" expanded={true} onToggle={() => {}} />);
    expect(screen.getByText("Sets")).toBeInTheDocument();
    expect(screen.getByText("Games For")).toBeInTheDocument();
    expect(screen.getByText("Games Against")).toBeInTheDocument();
  });

  it("does not show pickleball's Points For/Against labels", () => {
    render(<LeaderboardCard rank={1} player={makePlayer()} sport="padel" expanded={true} onToggle={() => {}} />);
    expect(screen.queryByText("Points For")).not.toBeInTheDocument();
    expect(screen.queryByText("Points Against")).not.toBeInTheDocument();
  });

  it("Record (W-L) label is unaffected by sport", () => {
    render(<LeaderboardCard rank={1} player={makePlayer({ games_won: 6, games_played: 9 })} sport="padel" expanded={true} onToggle={() => {}} />);
    expect(screen.getByText("Record")).toBeInTheDocument();
    expect(screen.getByText("6W–3L")).toBeInTheDocument();
  });
});
