/**
 * PlayerStatsRow — Presentational component for a single ranked player.
 *
 * Used by both the group leaderboard and session standings.
 * Renders identical markup/classes in both contexts.
 */

import type { PlayerStats } from "@/lib/types";
import { formatDiff } from "@/lib/formatting";
import { getTier, tierColor, getConfidence, getConfidenceLabel, confidenceColor, confidenceHint } from "@/lib/rdr";

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
    <div
      className="rounded-xl bg-white border px-4 py-3"
      style={isReigningGoat
        ? { border: "1.5px solid rgba(245, 197, 66, 0.5)", background: "rgba(255, 215, 0, 0.035)" }
        : { borderColor: "#e5e7eb" }
      }
    >
      {/* Top row: rank, code badge, name, W-L */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-400 w-6 text-right shrink-0">
          #{rank}
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800 font-mono">
          {player.code}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-gray-900 truncate ${isReigningGoat ? "font-semibold" : "font-medium"}`}>
            {player.display_name}
            {isReigningGoat && (
              <span
                className="ml-3 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
                style={{
                  background: "linear-gradient(135deg, #FFD700 0%, #F5C542 40%, #E0AC00 100%)",
                  color: "#1A1A1A",
                  letterSpacing: "0.3px",
                  boxShadow: "0 0 0 1px rgba(245, 197, 66, 0.4), 0 2px 6px rgba(245, 197, 66, 0.25)",
                }}
              >
                👑 GOAT
              </span>
            )}
            {isAllTimeGoat && (
              <span
                className="ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-600"
                style={{ border: "1.5px solid #F5C542", background: "rgba(255, 215, 0, 0.04)" }}
              >
                ALL-TIME
              </span>
            )}
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
          {rating != null && (() => {
            const tier = getTier(rating);
            const conf = ratingDeviation != null ? getConfidence(ratingDeviation) : null;
            const confLabel = conf != null ? getConfidenceLabel(conf) : null;
            return (
              <>
                <div className="mt-0.5 flex items-center gap-1.5 justify-end">
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${tierColor(tier)}`}>
                    {tier}
                  </span>
                  <span className={`text-xs ${isReigningGoat ? "font-bold text-gray-700" : "text-gray-400"}`}>
                    {Math.round(rating)}{provisional && ratingDeviation == null ? "*" : ""} RDR
                  </span>
                </div>
                {confLabel && (
                  <p
                    className={`text-[10px] font-medium text-right ${confidenceColor(confLabel)}`}
                    title={confidenceHint(confLabel)}
                  >
                    {confLabel}
                  </p>
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
