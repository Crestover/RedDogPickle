"use client";

/**
 * EndedSessionGames — Game list for ended sessions with voided toggle.
 *
 * Card layout (v2):
 *   [G#] badge top-left, timestamp top-right
 *   Winner names (bold) + score right-aligned
 *   Loser names (muted) below
 *
 * Default: voided games hidden.
 * Toggle: "Show voided" reveals voided games with reduced opacity + badge.
 */

import { useState } from "react";
import { formatTime } from "@/lib/datetime";
import { shortName } from "@/lib/formatting";
import { deriveOutcome } from "@/lib/sports/validators";

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

          const isTied = game.team_a_score === game.team_b_score;
          const { winner } = !isTied ? deriveOutcome(game.team_a_score, game.team_b_score) : { winner: null };
          const aWins = winner === "A";
          const bWins = winner === "B";

          // Determine winner/loser teams and scores
          const winnerNames = aWins ? aNamesArr : bWins ? bNamesArr : aNamesArr;
          const loserNames = aWins ? bNamesArr : bWins ? aNamesArr : bNamesArr;
          const winnerScore = aWins ? game.team_a_score : bWins ? game.team_b_score : game.team_a_score;
          const loserScore = aWins ? game.team_b_score : bWins ? game.team_a_score : game.team_b_score;

          return (
            <div
              key={game.id}
              className={`rounded-xl bg-white border border-gray-200 px-4 py-3${isVoided ? " opacity-50" : ""}`}
            >
              {/* Header row: Game badge + voided tag + time */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">
                    G{game.sequence_num}
                  </span>
                  {isVoided && (
                    <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-500 uppercase">
                      Voided
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-400">{time}</span>
              </div>

              {/* Winner row: names + score */}
              <div className="flex items-baseline justify-between">
                <span className={`text-sm font-semibold ${isVoided ? "text-gray-500" : "text-gray-900"}`}>
                  {winnerNames.join(" / ")}
                </span>
                <span className={`text-lg font-bold tabular-nums ${isVoided ? "text-gray-500" : "text-gray-900"}`}>
                  {winnerScore} - {loserScore}
                </span>
              </div>

              {/* Loser row */}
              <p className={`text-xs mt-0.5 ${isVoided ? "text-gray-400" : "text-gray-400"}`}>
                {loserNames.join(" / ")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
