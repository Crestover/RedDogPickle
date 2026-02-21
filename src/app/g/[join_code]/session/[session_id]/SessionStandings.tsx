"use client";

import { useState } from "react";
import type { PlayerStats } from "@/lib/types";
import PlayerStatsRow from "@/lib/components/PlayerStatsRow";

/**
 * Session Standings — Client Component (collapsible).
 *
 * Displays ranked player standings for a session using the same
 * card layout as the group leaderboard. Collapsed/expanded via
 * chevron toggle for fast courtside flow.
 */

interface SessionStandingsProps {
  standings: PlayerStats[];
}

export default function SessionStandings({ standings }: SessionStandingsProps) {
  const [open, setOpen] = useState(true);

  if (standings.length === 0) return null;

  return (
    <div>
      {/* Header with toggle */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between mb-3"
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Session Standings
        </h2>
        <span className="text-xs text-gray-400">
          {open ? "▼" : "▶"}
        </span>
      </button>

      {/* Standings list */}
      {open && (
        <div className="space-y-2">
          {standings.map((player, index) => (
            <PlayerStatsRow
              key={player.player_id}
              rank={index + 1}
              player={player}
            />
          ))}
        </div>
      )}
    </div>
  );
}
