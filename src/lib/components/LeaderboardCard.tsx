"use client";

/**
 * LeaderboardCard — Expandable card for leaderboard rankings.
 *
 * Collapsed: Rank, Avatar, Name + Tier, Avg Diff, Win %
 * Expanded: Full stat grid, status indicator, RDR
 *
 * Used by LeaderboardCardList which manages accordion state.
 */

import type { PlayerStats } from "@/lib/types";
import { formatDiff } from "@/lib/formatting";
import { getTier, getConfidence, getConfidenceLabel } from "@/lib/rdr";
import type { RdrTier, ConfidenceLabel as ConfidenceLabelType } from "@/lib/rdr";

interface LeaderboardCardProps {
  rank: number;
  player: PlayerStats;
  rating?: number | null;
  provisional?: boolean;
  ratingDeviation?: number | null;
  isReigningGoat?: boolean;
  isAllTimeGoat?: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tierBadgeClasses(tier: RdrTier): string {
  switch (tier) {
    case "Elite":
      return "bg-[#E8F3ED] text-[#17684A]";
    case "All-Star":
      return "bg-[#F3F4F6] text-[#374151]";
    case "Contender":
      return "bg-[#F8F8F8] text-[#6B7280]";
    case "Challenger":
      return "bg-[#F8F8F8] text-[#6B7280]";
    case "Walk-On":
      return "bg-transparent border border-[rgba(17,17,17,0.08)] text-[#8B949E]";
  }
}

function statusDot(label: ConfidenceLabelType): { color: string; text: string } {
  switch (label) {
    case "Locked In":
    case "Active":
      return { color: "bg-[#22C55E]", text: "Active" };
    case "Rusty":
      return { color: "bg-[#F59E0B]", text: "Rusty" };
    case "Returning":
      return { color: "bg-[#F59E0B]", text: "Returning" };
  }
}

export default function LeaderboardCard({
  rank,
  player,
  rating,
  ratingDeviation,
  isReigningGoat,
  isAllTimeGoat,
  expanded,
  onToggle,
}: LeaderboardCardProps) {
  const losses = player.games_played - player.games_won;
  const isFirst = rank === 1;
  const tier = rating != null ? getTier(rating) : null;
  const conf = ratingDeviation != null ? getConfidence(ratingDeviation) : null;
  const confLabel = conf != null ? getConfidenceLabel(conf) : null;
  const status = confLabel ? statusDot(confLabel) : null;

  return (
    <div
      onClick={onToggle}
      className={`
        bg-white border rounded-[14px] transition-all duration-200 cursor-pointer
        ${isFirst ? "border-l-4 border-l-[#0F7B53] border-t border-r border-b border-t-[rgba(17,17,17,0.05)] border-r-[rgba(17,17,17,0.05)] border-b-[rgba(17,17,17,0.05)] pl-3 pr-4 py-[14px]" : "border-[rgba(17,17,17,0.05)] px-4 py-[14px]"}
        hover:bg-[#FAFAFA]
      `}
      style={{ marginBottom: 10 }}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3">
        {/* Rank */}
        <span className="text-[18px] font-bold text-[#2B2F33] w-7 text-right shrink-0">
          {rank}
        </span>

        {/* Avatar */}
        <div
          className={`w-[38px] h-[38px] rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            isFirst
              ? "bg-[#DDEBE4] text-[#1E5E47]"
              : "bg-[#F1F3F5] text-[#6B7280]"
          }`}
        >
          {getInitials(player.display_name)}
        </div>

        {/* Name + Tier */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center min-w-0 gap-1.5">
            <span className="text-[16px] font-bold text-[#1C1F23] leading-[1.2] truncate">
              {player.display_name}
            </span>
            {isReigningGoat && (
              <span className="inline-flex items-center text-xs font-semibold tracking-wide text-zinc-700 shrink-0">
                <svg className="w-3.5 h-3.5 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                  <path d="M5 21h14" />
                </svg>
                GOAT
              </span>
            )}
            {isAllTimeGoat && (
              <span className="inline-flex items-center text-xs font-semibold tracking-wide text-zinc-700 shrink-0">
                <svg className="w-3.5 h-3.5 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                  <path d="M5 21h14" />
                </svg>
                ALL-TIME
              </span>
            )}
          </div>
          {tier && (
            <span
              className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold tracking-[0.02em] mt-1 ${tierBadgeClasses(tier)}`}
            >
              {tier}
            </span>
          )}
        </div>

        {/* Right side: Avg Diff + Win % */}
        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end">
            <span
              className={`text-[18px] font-bold ${
                player.avg_point_diff > 0
                  ? "text-[#0F7B53]"
                  : player.avg_point_diff < 0
                  ? "text-[#B42318]"
                  : "text-[#6B7280]"
              }`}
            >
              {formatDiff(player.avg_point_diff)}
            </span>
            <span className="text-[11px] text-[#9CA3AF] ml-1">avg</span>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            {player.win_pct}% win
          </p>
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-[#9CA3AF] shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
          <div className="grid grid-cols-2 gap-y-[10px] gap-x-4">
            {/* Left column */}
            <div>
              <p className="text-[11px] text-[#9CA3AF]">Games</p>
              <p className="text-sm font-semibold text-[#1F2937]">{player.games_played}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF]">Points For</p>
              <p className="text-sm font-semibold text-[#1F2937]">{player.points_for}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF]">Record</p>
              <p className="text-sm font-semibold text-[#1F2937]">{player.games_won}W&ndash;{losses}L</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF]">Points Against</p>
              <p className="text-sm font-semibold text-[#1F2937]">{player.points_against}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF]">Win %</p>
              <p className="text-sm font-semibold text-[#1F2937]">{player.win_pct}%</p>
            </div>
            <div>
              <p className="text-[11px] text-[#9CA3AF]">Avg Diff</p>
              <p className={`text-sm font-semibold ${
                player.avg_point_diff > 0
                  ? "text-[#0F7B53]"
                  : player.avg_point_diff < 0
                  ? "text-[#B42318]"
                  : "text-[#1F2937]"
              }`}>
                {formatDiff(player.avg_point_diff)}
              </p>
            </div>
          </div>

          {/* Footer: Status + RDR */}
          <div className="mt-[10px] flex items-center justify-between">
            {status && (
              <div className="flex items-center">
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status.color}`} />
                <span className="text-xs text-[#6B7280]">{status.text}</span>
              </div>
            )}
            {rating != null && (
              <span className="text-xs font-medium text-[#6B7280]">
                {Math.round(rating)} RDR
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
