import { getServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/datetime";
import { notFound } from "next/navigation";
import Link from "next/link";
import GamesList from "@/app/g/[join_code]/session/[session_id]/games/GamesList";

/**
 * View-Only Games Page — Server Component.
 *
 * Read-only mirror of /g/[join_code]/session/[session_id]/games/page.tsx.
 * Same game query + GamesList component (already read-only).
 */

interface PageProps {
  params: Promise<{ view_code: string; session_id: string }>;
}

async function getGamesData(viewCode: string, sessionId: string) {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, view_code")
    .eq("view_code", viewCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, started_at, ended_at")
    .eq("id", sessionId)
    .eq("group_id", group.id)
    .maybeSingle();

  // Mismatch protection: session must belong to this group
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

export default async function ViewSessionGamesPage({ params }: PageProps) {
  const { view_code, session_id } = await params;
  const data = await getGamesData(view_code, session_id);

  if (!data) notFound();

  const { group, session, games } = data;
  const activeCount = games.filter((g) => !(g as { voided_at?: string | null }).voided_at).length;

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
          href={`/v/${group.view_code}/session/${session.id}`}
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
