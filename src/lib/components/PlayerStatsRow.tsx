/**
 * PlayerStatsRow — Presentational component for a single ranked player.
 *
 * Used by both the group leaderboard and session standings.
 * Renders identical markup/classes in both contexts.
 */

import type { PlayerStats } from "@/lib/types";
import { formatDiff } from "@/lib/formatting";
import { getTier, tierColor, getConfidence, getConfidenceLabel } from "@/lib/rdr";
import ConfidenceLabel from "@/lib/components/ConfidenceLabel";

interface PlayerStatsRowProps {
  rank: number;
  player: PlayerStats;
  rating?: number | null;
  provisional?: boolean;
  ratingDeviation?: number | null;
  isReigningGoat?: boolean;
  isAllTimeGoat?: boolean;
}

export default function PlayerStatsRow({ rank, player, rating, provisional, ratingDeviation, isReigningGoat, isAllTimeGoat }: PlayerStatsRowProps) {
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
          {(isReigningGoat || isAllTimeGoat) && (
            <div className="flex items-center gap-2 mt-0.5">
              {isReigningGoat && (
                <span className="inline-flex items-center text-xs font-semibold tracking-wide text-zinc-500 shrink-0">
                  <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 4l3 12h14l3-12-5 4-5-4-5 4-1 0z" />
                    <path d="M5 16h14v2H5z" />
                  </svg>
                  GOAT
                </span>
              )}
              {isAllTimeGoat && (
                <span className="inline-flex items-center text-xs font-semibold tracking-wide text-zinc-500 shrink-0">
                  <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 4l3 12h14l3-12-5 4-5-4-5 4-1 0z" />
                    <path d="M5 16h14v2H5z" />
                  </svg>
                  ALL-TIME
                </span>
              )}
            </div>
          )}
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
          {rating != null && (() => {
            const tier = getTier(rating);
            const conf = ratingDeviation != null ? getConfidence(ratingDeviation) : null;
            const confLabel = conf != null ? getConfidenceLabel(conf) : null;
            return (
              <>
                <div className="mt-0.5 flex items-center gap-1.5 justify-end">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs leading-none ${tierColor(tier)}`}>
                    {tier}
                  </span>
                  <span className="text-xs text-gray-400">
                    {Math.round(rating)}{provisional && ratingDeviation == null ? "*" : ""} RDR
                  </span>
                </div>
                {confLabel && (
                  <ConfidenceLabel label={confLabel} />
                )}
              </>
            );
          })()}
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
