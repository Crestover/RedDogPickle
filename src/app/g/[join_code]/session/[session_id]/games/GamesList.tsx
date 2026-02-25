"use client";

/**
 * GamesList — Client component for displaying session games
 * with a toggle to show/hide voided games.
 *
 * Default: voided games hidden.
 * Toggle: "Show voided" reveals voided games with reduced opacity + badge.
 *
 * Tech debt: Client-side filtering. Server-side optimization
 * (exclude voided rows from query when showVoided=false) planned for large sessions.
 */

import { useState } from "react";
import { formatTime } from "@/lib/datetime";

interface GamePlayer {
  player_id: string;
  team: string;
  players: { id: string; display_name: string; code: string } | { id: string; display_name: string; code: string }[] | null;
}

interface Game {
  id: string;
  sequence_num: number;
  team_a_score: number;
  team_b_score: number;
  played_at: string;
  voided_at: string | null;
  game_players: GamePlayer[];
}

interface Props {
  games: Game[];
  activeCount: number;
  totalCount: number;
}

/** Derive first name from display_name: "Joe Smith" → "Joe" */
function firstName(displayName: string): string {
  const space = displayName.indexOf(" ");
  return space > 0 ? displayName.substring(0, space) : displayName;
}

/** Unwrap Supabase one-or-array relation. */
function one<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

/** Extract first names for a given team, sorted. */
function teamNames(gamePlayers: GamePlayer[], team: "A" | "B"): string[] {
  return gamePlayers
    .filter((gp) => gp.team === team)
    .map((gp) => {
      const player = one(gp.players) as { display_name?: string } | null;
      return player?.display_name ? firstName(player.display_name) : "?";
    })
    .sort();
}

export default function GamesList({ games, activeCount, totalCount }: Props) {
  const [showVoided, setShowVoided] = useState(false);

  const displayGames = showVoided ? games : games.filter((g) => !g.voided_at);
  const hasVoided = activeCount !== totalCount;

  return (
    <>
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {activeCount} game{activeCount !== 1 ? "s" : ""}
          {hasVoided && !showVoided && (
            <span> ({totalCount} total incl. voided)</span>
          )}
        </p>
        {hasVoided && (
          <button
            type="button"
            onClick={() => setShowVoided(!showVoided)}
            className="text-[10px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showVoided ? "Hide voided" : "Show voided"}
          </button>
        )}
      </div>

      {/* Game list */}
      {displayGames.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          No games recorded yet.
        </p>
      ) : (
        <div className="space-y-3">
          {displayGames.map((game) => {
            const isVoided = !!game.voided_at;
            const gamePlayers = Array.isArray(game.game_players)
              ? game.game_players
              : [];
            const aNamesArr = teamNames(gamePlayers, "A");
            const bNamesArr = teamNames(gamePlayers, "B");
            const time = formatTime(game.played_at);

            const aWins = game.team_a_score > game.team_b_score;
            const bWins = game.team_b_score > game.team_a_score;

            // Color classes for winner highlighting (non-voided only)
            const scoreAClass = !isVoided && aWins ? "text-emerald-600" : "text-gray-700";
            const scoreBClass = !isVoided && bWins ? "text-emerald-600" : "text-gray-700";
            const namesAClass = !isVoided && aWins ? "text-emerald-600 font-medium" : "text-gray-700";
            const namesBClass = !isVoided && bWins ? "text-emerald-600 font-medium" : "text-gray-700";

            return (
              <div
                key={game.id}
                className={`rounded-xl bg-white border border-gray-200 px-4 py-3${isVoided ? " opacity-60" : ""}`}
              >
                {/* Header row: Game # + badge + time */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">
                    Game #{game.sequence_num}
                    {isVoided && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase">
                        Voided
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400">{time}</span>
                </div>

                {/* Score */}
                <p className="text-xl font-semibold font-mono mb-1">
                  <span className={scoreAClass}>{game.team_a_score}</span>
                  <span className="text-gray-300">&ndash;</span>
                  <span className={scoreBClass}>{game.team_b_score}</span>
                </p>

                {/* Teams (first names) */}
                <p className="text-sm leading-snug">
                  <span className={namesAClass}>{aNamesArr.join(" / ")}</span>
                  <span className="text-gray-400"> vs </span>
                  <span className={namesBClass}>{bNamesArr.join(" / ")}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
