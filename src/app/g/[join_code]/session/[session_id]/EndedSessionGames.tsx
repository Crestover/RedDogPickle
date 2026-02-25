"use client";

/**
 * EndedSessionGames — Game list for ended sessions with voided toggle.
 *
 * Default: voided games hidden.
 * Toggle: "Show voided" reveals voided games with reduced opacity + badge.
 */

import { useState } from "react";
import { formatTime } from "@/lib/datetime";

interface GamePlayer {
  player_id: string;
  team: string;
  players: { code?: string } | { code?: string }[] | null;
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

/** Extract player codes for a given team from the game_players join. */
function teamCodes(gamePlayers: GamePlayer[], team: "A" | "B"): string[] {
  return gamePlayers
    .filter((gp) => gp.team === team)
    .map((gp) => {
      const player = one(gp.players) as { code?: string } | null;
      return player?.code ?? "?";
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
      <div className="space-y-2">
        {displayGames.map((game) => {
          const isVoided = !!game.voided_at;
          const gamePlayers = Array.isArray(game.game_players)
            ? game.game_players
            : [];

          const teamAPlayers = teamCodes(gamePlayers, "A");
          const teamBPlayers = teamCodes(gamePlayers, "B");

          const winnerTeam =
            game.team_a_score > game.team_b_score ? "A" : "B";

          return (
            <div
              key={game.id}
              className={`rounded-xl bg-white border border-gray-200 px-4 py-3${isVoided ? " opacity-40" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400">
                  Game #{game.sequence_num}
                  {isVoided && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase">
                      Voided
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  {formatTime(game.played_at)}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center text-center">
                <div>
                  <p className="text-xs text-blue-600 font-semibold mb-0.5">
                    Team A {!isVoided && winnerTeam === "A" && "\u{1F3C6}"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {teamAPlayers.join(" ")}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      !isVoided && winnerTeam === "A" ? "text-green-700" : "text-gray-500"
                    }`}
                  >
                    {game.team_a_score}
                  </p>
                </div>
                <div className="text-gray-300 text-lg font-bold">vs</div>
                <div>
                  <p className="text-xs text-orange-600 font-semibold mb-0.5">
                    Team B {!isVoided && winnerTeam === "B" && "\u{1F3C6}"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {teamBPlayers.join(" ")}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      !isVoided && winnerTeam === "B" ? "text-green-700" : "text-gray-500"
                    }`}
                  >
                    {game.team_b_score}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
