/**
 * Shared sport-aware stat labels for leaderboard-style displays.
 *
 * Padel's recorded unit is a set (with games won/lost inside it), not a
 * pickleball game/points pair — see sports/padel.ts. Used by LeaderboardCard
 * and the per-player game history page so the two stay in sync.
 */

import type { Sport } from "@/lib/types";

export interface StatLabels {
  unitSingular: string;
  unitPlural: string;
  unitHeader: string;
  for: string;
  against: string;
}

export function getStatLabels(sport: Sport = "pickleball"): StatLabels {
  return sport === "padel"
    ? { unitSingular: "set", unitPlural: "sets", unitHeader: "Sets", for: "Games For", against: "Games Against" }
    : { unitSingular: "game", unitPlural: "games", unitHeader: "Games", for: "Points For", against: "Points Against" };
}
