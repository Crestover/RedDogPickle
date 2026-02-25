import { getServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/datetime";
import { notFound } from "next/navigation";
import Link from "next/link";
import GamesList from "./GamesList";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
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
  const activeCount = games.filter((g) => !(g as { voided_at?: string | null }).voided_at).length;

  // Format session date
  const sessionDate = formatDate(session.started_at, {
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
            {sessionDate}
          </p>
        </div>

        {/* Game list with voided toggle */}
        <GamesList
          games={games as Parameters<typeof GamesList>[0]["games"]}
          activeCount={activeCount}
          totalCount={games.length}
        />
      </div>
    </div>
  );
}
