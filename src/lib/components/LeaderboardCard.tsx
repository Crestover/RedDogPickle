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
      return { color: "bg-green-500", text: "Active" };
    case "Rusty":
      return { color: "bg-amber-400", text: "Rusty" };
    case "Returning":
      return { color: "bg-amber-400", text: "Returning" };
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
      className="bg-white rounded-[14px] cursor-pointer hover:bg-[#FAFAFA] transition-all duration-200"
      style={{
        border: "1px solid rgba(17,17,17,0.05)",
        borderLeft: isFirst ? "4px solid #0F7B53" : "1px solid rgba(17,17,17,0.05)",
        padding: isFirst ? "14px 16px 14px 12px" : "14px 16px",
        marginBottom: 10,
      }}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3">
        {/* Rank */}
        <span
          className="font-bold text-right shrink-0"
          style={{ fontSize: 18, color: "#2B2F33", width: 28 }}
        >
          {rank}
        </span>

        {/* Avatar */}
        <div
          className="rounded-full flex items-center justify-center font-bold shrink-0"
          style={{
            width: 38,
            height: 38,
            fontSize: 12,
            backgroundColor: isFirst ? "#DDEBE4" : "#F1F3F5",
            color: isFirst ? "#1E5E47" : "#6B7280",
          }}
        >
          {getInitials(player.display_name)}
        </div>

        {/* Name + Tier */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center min-w-0 gap-1.5">
            <span
              className="font-bold truncate"
              style={{ fontSize: 16, color: "#1C1F23", lineHeight: 1.2 }}
            >
              {player.display_name}
            </span>
            {isReigningGoat && (
              <span className="inline-flex items-center text-xs font-semibold tracking-wide text-zinc-700 shrink-0">
                <svg style={{ width: 14, height: 14, marginRight: 2 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                  <path d="M5 21h14" />
                </svg>
                GOAT
              </span>
            )}
            {isAllTimeGoat && (
              <span className="inline-flex items-center text-xs font-semibold tracking-wide text-zinc-700 shrink-0">
                <svg style={{ width: 14, height: 14, marginRight: 2 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
                  <path d="M5 21h14" />
                </svg>
                ALL-TIME
              </span>
            )}
          </div>
          {tier && (
            <span
              className={`inline-flex items-center rounded-full font-bold ${tierBadgeClasses(tier)}`}
              style={{ height: 20, padding: "0 8px", fontSize: 10, letterSpacing: "0.02em", marginTop: 4 }}
            >
              {tier}
            </span>
          )}
        </div>

        {/* Right side: Avg Diff + Win % */}
        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end">
            <span
              className="font-bold"
              style={{
                fontSize: 18,
                color: player.avg_point_diff > 0
                  ? "#0F7B53"
                  : player.avg_point_diff < 0
                  ? "#B42318"
                  : "#6B7280",
              }}
            >
              {formatDiff(player.avg_point_diff)}
            </span>
            <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 4 }}>avg</span>
          </div>
          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
            {player.win_pct}% win
          </p>
        </div>

        {/* Chevron */}
        <svg
          style={{ width: 16, height: 16, flexShrink: 0, color: "#9CA3AF", transition: "transform 0.2s ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
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
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F3F4F6" }}>
          <div className="grid grid-cols-2" style={{ gap: "10px 16px" }}>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>Games</p>
              <p className="font-semibold" style={{ fontSize: 14, color: "#1F2937" }}>{player.games_played}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>Points For</p>
              <p className="font-semibold" style={{ fontSize: 14, color: "#1F2937" }}>{player.points_for}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>Record</p>
              <p className="font-semibold" style={{ fontSize: 14, color: "#1F2937" }}>{player.games_won}W&ndash;{losses}L</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>Points Against</p>
              <p className="font-semibold" style={{ fontSize: 14, color: "#1F2937" }}>{player.points_against}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>Win %</p>
              <p className="font-semibold" style={{ fontSize: 14, color: "#1F2937" }}>{player.win_pct}%</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>Avg Diff</p>
              <p
                className="font-semibold"
                style={{
                  fontSize: 14,
                  color: player.avg_point_diff > 0
                    ? "#0F7B53"
                    : player.avg_point_diff < 0
                    ? "#B42318"
                    : "#1F2937",
                }}
              >
                {formatDiff(player.avg_point_diff)}
              </p>
            </div>
          </div>

          {/* Footer: Status + RDR */}
          <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
            {status && (
              <div className="flex items-center">
                <span
                  className={`rounded-full ${status.color}`}
                  style={{ width: 6, height: 6, marginRight: 6 }}
                />
                <span style={{ fontSize: 12, color: "#6B7280" }}>{status.text}</span>
              </div>
            )}
            {rating != null && (
              <span style={{ fontSize: 12, fontWeight: 500, color: "#6B7280" }}>
                {Math.round(rating)} RDR
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
