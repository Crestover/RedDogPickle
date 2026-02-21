/**
 * PlayerStatsRow — Presentational component for a single ranked player.
 *
 * Used by both the group leaderboard and session standings.
 * Renders identical markup/classes in both contexts.
 */

import type { PlayerStats } from "@/lib/types";
import { formatDiff } from "@/lib/formatting";

interface PlayerStatsRowProps {
  rank: number;
  player: PlayerStats;
}

export default function PlayerStatsRow({ rank, player }: PlayerStatsRowProps) {
  const losses = player.games_played - player.games_won;

  return (
    <div className="rounded-xl bg-white border border-gray-200 px-4 py-3">
      {/* Top row: rank, code badge, name, W-L */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-400 w-6 text-right shrink-0">
          #{rank}
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
}
