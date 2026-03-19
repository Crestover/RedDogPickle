"use client";

import { useState } from "react";
import type { PlayerStats } from "@/lib/types";
import PlayerStatsRow from "@/lib/components/PlayerStatsRow";

/**
 * Session Standings — Client Component (collapsible).
 *
 * ⚠️  CURRENTLY UNUSED — This component is not imported anywhere.
 * The session detail page renders PlayerStatsRow directly.
 * Kept for potential future use (e.g., dedicated standings route).
 *
 * If wiring this up, note that:
 * - RatingInfo uses camelCase (`ratingDeviation`), but Supabase
 *   returns snake_case (`rating_deviation`). The caller must map
 *   fields when constructing the Record<string, RatingInfo>.
 * - Consider using SessionRatingInfo from types.ts as the source
 *   and mapping to RatingInfo at the boundary.
 */

interface RatingInfo {
  rating: number;
  provisional: boolean;
  ratingDeviation?: number;
}

interface SessionStandingsProps {
  standings: PlayerStats[];
  ratings?: Record<string, RatingInfo>;
}

export default function SessionStandings({ standings, ratings }: SessionStandingsProps) {
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
          {standings.map((player, index) => {
            const pr = ratings?.[player.player_id];
            return (
              <PlayerStatsRow
                key={player.player_id}
                rank={index + 1}
                player={player}
                rating={pr?.rating ?? null}
                provisional={pr?.provisional ?? false}
                ratingDeviation={pr?.ratingDeviation ?? null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
