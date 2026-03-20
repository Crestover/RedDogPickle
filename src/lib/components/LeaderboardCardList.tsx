"use client";

/**
 * LeaderboardCardList — Accordion wrapper for LeaderboardCard.
 *
 * Manages expand/collapse state so only one card is open at a time.
 * Receives serialized player data from the server component.
 */

import LeaderboardCard from "./LeaderboardCard";
import { useState } from "react";

interface CardData {
  playerId: string;
  rank: number;
  player: {
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
    rdr?: number | null;
    rating_deviation?: number | null;
    last_played_at?: string | null;
  };
  rating: number | null;
  provisional: boolean;
  ratingDeviation: number | null;
  isReigningGoat: boolean;
  isAllTimeGoat: boolean;
}

interface LeaderboardCardListProps {
  cards: CardData[];
}

export default function LeaderboardCardList({ cards }: LeaderboardCardListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      {cards.map((card) => (
        <LeaderboardCard
          key={card.playerId}
          rank={card.rank}
          player={card.player}
          rating={card.rating}
          provisional={card.provisional}
          ratingDeviation={card.ratingDeviation}
          isReigningGoat={card.isReigningGoat}
          isAllTimeGoat={card.isAllTimeGoat}
          expanded={expandedId === card.playerId}
          onToggle={() =>
            setExpandedId((prev) =>
              prev === card.playerId ? null : card.playerId
            )
          }
        />
      ))}
    </div>
  );
}
