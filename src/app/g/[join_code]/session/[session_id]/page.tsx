import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import { one } from "@/lib/supabase/helpers";
import type { PlayerStats, PairCount, Player, PlayerRating } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import EndSessionButton from "./EndSessionButton";
import PairingBalance from "./PairingBalance";
import RecordGameForm from "./RecordGameForm";
import SessionStandings from "./SessionStandings";

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

async function getSessionData(joinCode: string, sessionId: string) {
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
    .select("id, name, started_at, ended_at, closed_reason")
    .eq("id", sessionId)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!session) return null;

  // Fetch attendees (with player details)
  const { data: attendees } = await supabase
    .from("session_players")
    .select("player_id, players(id, display_name, code)")
    .eq("session_id", sessionId);

  // Fetch games for this session, newest first
  const { data: games } = await supabase
    .from("games")
    .select(
      "id, sequence_num, team_a_score, team_b_score, played_at, game_players(player_id, team, players(id, display_name, code))"
    )
    .eq("session_id", sessionId)
    .order("sequence_num", { ascending: false });

  // Fetch session standings via RPC
  const { data: standings, error: standingsError } = await supabase.rpc(
    RPC.GET_SESSION_STATS,
    { p_session_id: sessionId }
  );

  if (standingsError) {
    console.error("get_session_stats error:", standingsError);
  }

  // Fetch pairing balance via RPC
  const { data: pairCounts, error: pairError } = await supabase.rpc(
    RPC.GET_SESSION_PAIR_COUNTS,
    { p_session_id: sessionId }
  );

  if (pairError) {
    console.error("get_session_pair_counts error:", pairError);
  }

  // Fetch Elo ratings for this group
  const { data: ratingsData, error: ratingsError } = await supabase
    .from("player_ratings")
    .select("group_id, player_id, rating, games_rated, provisional")
    .eq("group_id", group.id);

  if (ratingsError) {
    console.error("player_ratings query error:", ratingsError);
  }

  return {
    group,
    session,
    attendees: attendees ?? [],
    games: games ?? [],
    standings: (standings ?? []) as PlayerStats[],
    pairCounts: (pairCounts ?? []) as PairCount[],
    ratings: (ratingsData ?? []) as PlayerRating[],
  };
}

function isActiveSession(session: {
  ended_at: string | null;
  started_at: string;
}): boolean {
  if (session.ended_at) return false;
  const startedAt = new Date(session.started_at).getTime();
  const fourHoursMs = 4 * 60 * 60 * 1000;
  return Date.now() - startedAt < fourHoursMs;
}

export default async function SessionPage({ params }: PageProps) {
  const { join_code, session_id } = await params;
  const data = await getSessionData(join_code, session_id);

  if (!data) notFound();

  const { group, session, attendees, games, standings, pairCounts, ratings } = data;
  const active = isActiveSession(session);

  // Build ratings record for SessionStandings (plain object for serialization)
  const ratingsRecord: Record<string, { rating: number; provisional: boolean }> = {};
  for (const r of ratings) {
    ratingsRecord[r.player_id] = { rating: r.rating, provisional: r.provisional };
  }

  // Format started_at for display
  const startedAt = new Date(session.started_at);
  const startedLabel = startedAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Flatten attendees into Player[] for RecordGameForm, sorted by code
  const players = attendees
    .map((row) => {
      const player = one(row.players) as Player | null;
      if (!player) return null;
      return player;
    })
    .filter((p): p is Player => p !== null)
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <main className="flex min-h-screen flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Back link */}
        <Link
          href={`/g/${group.join_code}`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← {group.name}
        </Link>

        {/* Session header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            {active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                Ended
              </span>
            )}
            <span className="text-xs text-gray-400">Started {startedLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold leading-tight font-mono">
              {session.name}
            </h1>
            {active && (
              <EndSessionButton sessionId={session.id} joinCode={group.join_code} />
            )}
          </div>
        </div>

        {/* Session Standings — collapsible */}
        <SessionStandings standings={standings} ratings={ratingsRecord} />

        {/* Pairing Balance — fewest games together first */}
        <PairingBalance pairs={pairCounts} />

        {/* Record Game form — only when session is active */}
        {active && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5">
            <RecordGameForm
              sessionId={session.id}
              joinCode={group.join_code}
              attendees={players}
            />
          </div>
        )}

        {/* Games recorded in this session */}
        {games.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Games ({games.length})
            </h2>
            <div className="space-y-2">
              {games.map((game) => {
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
                    className="rounded-xl bg-white border border-gray-200 px-4 py-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400">
                        Game #{game.sequence_num}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(game.played_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 items-center text-center">
                      <div>
                        <p className="text-xs text-blue-600 font-semibold mb-0.5">
                          Team A {winnerTeam === "A" && "🏆"}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                          {teamAPlayers.join(" ")}
                        </p>
                        <p
                          className={`text-2xl font-bold ${
                            winnerTeam === "A" ? "text-green-700" : "text-gray-500"
                          }`}
                        >
                          {game.team_a_score}
                        </p>
                      </div>
                      <div className="text-gray-300 text-lg font-bold">vs</div>
                      <div>
                        <p className="text-xs text-orange-600 font-semibold mb-0.5">
                          Team B {winnerTeam === "B" && "🏆"}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                          {teamBPlayers.join(" ")}
                        </p>
                        <p
                          className={`text-2xl font-bold ${
                            winnerTeam === "B" ? "text-green-700" : "text-gray-500"
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
        )}

        {/* Session history link */}
        <div className="pt-2 border-t border-gray-200">
          <Link
            href={`/g/${group.join_code}/sessions`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            View all sessions →
          </Link>
        </div>
      </div>
    </main>
  );
}
