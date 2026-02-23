import { getServerClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/helpers";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
}

/** Extract player codes for a given team from the game_players join. */
function teamCodes(
  gamePlayers: unknown[],
  team: "A" | "B"
): string[] {
  return gamePlayers
    .filter((gp) => (gp as { team: string }).team === team)
    .map((gp) => {
      const player = one(
        (gp as { players?: { code?: string } | { code?: string }[] | null }).players
      ) as { code?: string } | null;
      return player?.code ?? "?";
    })
    .sort();
}

async function getGamesData(joinCode: string, sessionId: string) {
  const supabase = getServerClient();

  // Fetch the group
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  // Fetch the session (must belong to this group)
  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, started_at, ended_at")
    .eq("id", sessionId)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!session) return null;

  // Fetch games for this session, newest first
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
            {session.name} &middot; {activeGames.length} game{activeGames.length !== 1 ? "s" : ""}
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
          <div className="space-y-2">
            {games.map((game) => {
              const isVoided = !!(game as { voided_at?: string | null }).voided_at;
              const gamePlayers = Array.isArray(game.game_players)
                ? game.game_players
                : [];
              const aCodes = teamCodes(gamePlayers, "A").join("/");
              const bCodes = teamCodes(gamePlayers, "B").join("/");
              const time = new Date(game.played_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={game.id}
                  className={`rounded-lg bg-white border border-gray-200 px-3 py-2.5${isVoided ? " opacity-40" : ""}`}
                >
                  {/* Top row: game number + voided badge + time */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-400">
                      Game #{game.sequence_num}
                      {isVoided && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 uppercase">
                          Voided
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-300">{time}</span>
                  </div>
                  {/* Score + teams row */}
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-gray-800 shrink-0">
                      {game.team_a_score}&ndash;{game.team_b_score}
                    </span>
                    <span className="text-xs font-mono text-gray-500 truncate">
                      {aCodes} vs {bCodes}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
