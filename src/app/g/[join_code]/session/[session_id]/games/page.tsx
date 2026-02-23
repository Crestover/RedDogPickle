import { getServerClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/helpers";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
}

/** Derive first name from display_name: "Joe Smith" → "Joe", "Ignacio" → "Ignacio" */
function firstName(displayName: string): string {
  const space = displayName.indexOf(" ");
  return space > 0 ? displayName.substring(0, space) : displayName;
}

/** Extract first names for a given team, sorted. */
function teamNames(
  gamePlayers: unknown[],
  team: "A" | "B"
): string[] {
  return gamePlayers
    .filter((gp) => (gp as { team: string }).team === team)
    .map((gp) => {
      const player = one(
        (gp as { players?: { display_name?: string } | { display_name?: string }[] | null }).players
      ) as { display_name?: string } | null;
      return player?.display_name ? firstName(player.display_name) : "?";
    })
    .sort();
}

async function getGamesData(joinCode: string, sessionId: string) {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, started_at, ended_at")
    .eq("id", sessionId)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!session) return null;

  const { data: games } = await supabase
    .from("games")
    .select(
      "id, sequence_num, team_a_score, team_b_score, played_at, voided_at, game_players(player_id, team, players(id, display_name, code))"
    )
    .eq("session_id", sessionId)
    .order("sequence_num", { ascending: false });

  return {
    group,
    session,
    games: games ?? [],
  };
}

export default async function SessionGamesPage({ params }: PageProps) {
  const { join_code, session_id } = await params;
  const data = await getGamesData(join_code, session_id);

  if (!data) notFound();

  const { group, session, games } = data;
  const activeGames = games.filter((g) => !(g as { voided_at?: string | null }).voided_at);

  // Format session date
  const sessionDate = new Date(session.started_at).toLocaleDateString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Back link */}
        <Link
          href={`/g/${group.join_code}/session/${session.id}`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold leading-tight font-mono">
            All Games
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {sessionDate} &middot; {activeGames.length} game{activeGames.length !== 1 ? "s" : ""}
            {activeGames.length !== games.length && (
              <span> ({games.length} total incl. voided)</span>
            )}
          </p>
        </div>

        {/* Game list */}
        {games.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No games recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {games.map((game) => {
              const isVoided = !!(game as { voided_at?: string | null }).voided_at;
              const gamePlayers = Array.isArray(game.game_players)
                ? game.game_players
                : [];
              const aNamesArr = teamNames(gamePlayers, "A");
              const bNamesArr = teamNames(gamePlayers, "B");
              const time = new Date(game.played_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

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
      </div>
    </div>
  );
}
