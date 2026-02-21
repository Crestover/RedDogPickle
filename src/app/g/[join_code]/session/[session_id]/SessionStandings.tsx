"use client";

import { useState } from "react";

/**
 * Session Standings — Client Component (collapsible).
 *
 * Displays ranked player standings for a session using the same
 * card layout as the group leaderboard. Collapsed/expanded via
 * chevron toggle for fast courtside flow.
 */

interface PlayerStats {
  player_id: string;
  display_name: string;
  code: string;
  games_played: number;
  games_won: number;
  win_pct: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  avg_point_diff: number;
}

interface SessionStandingsProps {
  standings: PlayerStats[];
}

function formatDiff(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
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
          {standings.map((player, index) => {
            const losses = player.games_played - player.games_won;
            return (
              <div
                key={player.player_id}
                className="rounded-xl bg-white border border-gray-200 px-4 py-3"
              >
                {/* Top row: rank, code badge, name, W-L */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-6 text-right shrink-0">
                    #{index + 1}
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800 font-mono">
                    {player.code}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {player.display_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {player.games_won}W–{losses}L
                      <span className="mx-1.5 text-gray-300">·</span>
                      {player.win_pct}%
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold ${
                        player.point_diff > 0
                          ? "text-green-700"
                          : player.point_diff < 0
                          ? "text-red-600"
                          : "text-gray-500"
                      }`}
                    >
                      {formatDiff(player.point_diff)}
                    </p>
                    <p className="text-xs text-gray-400">pt diff</p>
                  </div>
                </div>

                {/* Detail row */}
                <div className="mt-2 flex items-center gap-4 pl-9 text-xs text-gray-400">
                  <span>{player.games_played} games</span>
                  <span>
                    PF {player.points_for} / PA {player.points_against}
                  </span>
                  <span>
                    Avg {formatDiff(player.avg_point_diff)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
