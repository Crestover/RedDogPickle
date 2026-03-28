"use client";

/**
 * LeaderboardCard — Expandable card for leaderboard rankings.
 *
 * Collapsed: Rank, Avatar, Name + Tier + GOAT, Avg Diff, Win %, Chevron
 * Expanded: 2-column stat grid, status indicator, RDR
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

/** Crown icon SVG for GOAT badges — monochrome, 12px. */
function CrownIcon() {
  return (
    <svg
      style={{ width: 12, height: 12 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  );
}

function tierBadgeStyle(tier: RdrTier): React.CSSProperties {
  const base: React.CSSProperties = {
    height: 20,
    padding: "0 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
    display: "inline-flex",
    alignItems: "center",
    marginTop: 4,
  };
  switch (tier) {
    case "Elite":
      return { ...base, backgroundColor: "#E6F2EC", color: "#17684A" };
    case "All-Star":
      return { ...base, backgroundColor: "#F3F4F6", color: "#374151" };
    case "Contender":
      return { ...base, backgroundColor: "#F3F4F6", color: "#4B5563" };
    case "Challenger":
      return { ...base, backgroundColor: "transparent", border: "1px solid rgba(17,17,17,0.08)", color: "#4B5563" };
    case "Walk-On":
      return { ...base, backgroundColor: "transparent", border: "1px solid rgba(17,17,17,0.06)", color: "#6B7280", opacity: 0.85 };
  }
}

function statusDot(label: ConfidenceLabelType): { color: string; text: string } {
  switch (label) {
    case "Locked In":
    case "Active":
      return { color: "#22C55E", text: "Active" };
    case "Rusty":
      return { color: "#F59E0B", text: "Rusty" };
    case "Returning":
      return { color: "#F59E0B", text: "Returning" };
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
      className="bg-white cursor-pointer hover:bg-[#FAFAFA] transition-all duration-200"
      style={{
        border: "1px solid rgba(17,17,17,0.05)",
        borderLeft: isFirst ? "4px solid #0F7B53" : "1px solid rgba(17,17,17,0.05)",
        borderRadius: isFirst ? "14px" : 14,
        padding: isFirst ? "12px 16px 12px 12px" : "12px 16px",
        marginBottom: 10,
      }}
    >
      {/* Collapsed row — 3-zone: Left (rank+avatar) | Center (name+tier) | Right (metrics+chevron) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Rank */}
        <span
          style={{ fontSize: 18, fontWeight: 800, color: "#2B2F33", width: 28, textAlign: "right", flexShrink: 0, letterSpacing: "-0.025em" }}
        >
          {rank}
        </span>

        {/* Avatar */}
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
            backgroundColor: isFirst ? "#DDEBE4" : "#ECEFF1",
            color: isFirst ? "#1E5E47" : "#6B7280",
          }}
        >
          {getInitials(player.display_name)}
        </div>

        {/* Center: Name + Tier + GOAT */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#111111",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {player.display_name}
            </span>
            {isReigningGoat && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginLeft: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: "#111111",
                  opacity: 0.8,
                  flexShrink: 0,
                }}
              >
                <CrownIcon />
                GOAT
              </span>
            )}
            {isAllTimeGoat && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginLeft: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: "#111111",
                  opacity: 0.8,
                  flexShrink: 0,
                }}
              >
                <CrownIcon />
                ALL-TIME
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            {tier && <span style={{ ...tierBadgeStyle(tier), marginTop: 0 }}>{tier}</span>}
            {player.games_played != null && (
              <span style={{ fontSize: 10, color: "#6B7280" }}>
                {player.games_played} {player.games_played === 1 ? "game" : "games"}
              </span>
            )}
          </div>
        </div>

        {/* Right: Metrics + Chevron */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end" }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "-0.025em",
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
          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2, margin: 0, marginBlockStart: 2 }}>
            {player.win_pct}% win
          </p>
        </div>

        {/* Chevron */}
        <svg
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            color: "#9CA3AF",
            opacity: 0.6,
            marginLeft: 8,
            transition: "transform 0.2s ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px 16px",
            }}
          >
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Games</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", margin: 0 }}>{player.games_played}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Points For</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", margin: 0 }}>{player.points_for}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Record</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", margin: 0 }}>{player.games_won}W&ndash;{losses}L</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Points Against</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", margin: 0 }}>{player.points_against}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Win %</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", margin: 0 }}>{player.win_pct}%</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Avg Diff</p>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
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
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {status && (
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    marginRight: 6,
                    backgroundColor: status.color,
                  }}
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
