"use client";

/**
 * EndedSessionGames — Game list for ended sessions with voided toggle.
 *
 * Card layout matches GamesList (All Games page):
 *   Game # + time → score (winner in emerald) → team names
 *
 * Default: voided games hidden.
 * Toggle: "Show voided" reveals voided games with reduced opacity + badge.
 */

import { useState } from "react";
import { formatTime } from "@/lib/datetime";
import { shortName } from "@/lib/formatting";

interface GamePlayer {
  player_id: string;
  team: string;
  players: { id?: string; display_name?: string; code?: string } | { id?: string; display_name?: string; code?: string }[] | null;
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
}

/** Unwrap Supabase one-or-array relation. */
function one<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

/** Extract short names for a given team, sorted. */
function teamNames(gamePlayers: GamePlayer[], team: "A" | "B"): string[] {
  return gamePlayers
    .filter((gp) => gp.team === team)
    .map((gp) => {
      const player = one(gp.players) as { display_name?: string } | null;
      return player?.display_name ? shortName(player.display_name) : "?";
    })
    .sort();
}

export default function EndedSessionGames({ games }: Props) {
  const [showVoided, setShowVoided] = useState(false);

  const activeGames = games.filter((g) => !g.voided_at);
  const displayGames = showVoided ? games : activeGames;
  const hasVoided = activeGames.length !== games.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Games ({activeGames.length}{hasVoided && showVoided ? ` / ${games.length} total` : ""})
        </h2>
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

              {/* Teams (short names) */}
              <p className="text-sm leading-snug">
                <span className={namesAClass}>{aNamesArr.join(" / ")}</span>
                <span className="text-gray-400"> vs </span>
                <span className={namesBClass}>{bNamesArr.join(" / ")}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
