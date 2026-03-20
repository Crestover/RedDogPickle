"use client";

/**
 * EndedSessionGames — Game list for ended sessions with voided toggle.
 *
 * Card layout (scoreboard v2):
 *   [G#] badge left | Winner names + score (green/gray) right-aligned
 *                    | Loser names + timestamp right-aligned
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

/** Zero-pad a score to 2 digits. */
function padScore(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
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
      <div className="space-y-2.5">
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
              className={`rounded-xl bg-white border border-gray-200 px-3 py-2.5${isVoided ? " opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                {/* Game badge — left anchor */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className="inline-flex items-center justify-center rounded-lg bg-emerald-50 px-3 py-1.5 text-base font-bold text-emerald-700">
                    G{game.sequence_num}
                  </span>
                  {isVoided && (
                    <span className="inline-flex items-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-500 uppercase">
                      Voided
                    </span>
                  )}
                </div>

                {/* Content — names + score + time */}
                <div className="flex-1 min-w-0">
                  {/* Winner row */}
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-semibold truncate ${isVoided ? "text-gray-500" : "text-gray-900"}`}>
                      {winnerNames.join(" / ")}
                    </span>
                    <span className="text-base font-bold tabular-nums shrink-0 ml-2">
                      <span className={isVoided ? "text-gray-500" : "text-emerald-700"}>{padScore(winnerScore)}</span>
                      <span className="text-gray-300"> - </span>
                      <span className={isVoided ? "text-gray-400" : "text-gray-400"}>{padScore(loserScore)}</span>
                    </span>
                  </div>

                  {/* Loser row */}
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className={`text-xs truncate ${isVoided ? "text-gray-400" : "text-gray-500"}`}>
                      {loserNames.join(" / ")}
                    </span>
                    <span className="text-[11px] text-gray-400 shrink-0 ml-2">{time}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
