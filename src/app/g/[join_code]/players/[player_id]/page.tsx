import { getServerClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/helpers";
import { getStatLabels } from "@/lib/statLabels";
import { getTier, tierColor } from "@/lib/rdr";
import { formatDiff } from "@/lib/formatting";
import type { Sport } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerGameHistoryList, { type PlayerGame } from "./PlayerGameHistoryList";

interface PageProps {
  params: Promise<{ join_code: string; player_id: string }>;
}

async function getData(joinCode: string, playerId: string) {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, sport")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  const { data: player } = await supabase
    .from("players")
    .select("id, display_name, code, group_id, hidden")
    .eq("id", playerId)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!player) return null;

  const { data: rating } = await supabase
    .from("player_ratings")
    .select("rating, games_rated, provisional, rating_deviation")
    .eq("group_id", group.id)
    .eq("player_id", playerId)
    .maybeSingle();

  // Cross-session game history: find every game this player appeared in,
  // then fetch full game + all 4 players + session name for each.
  const { data: gamePlayerRows } = await supabase
    .from("game_players")
    .select("game_id")
    .eq("player_id", playerId);

  const gameIds = (gamePlayerRows ?? []).map((r) => r.game_id);

  let games: PlayerGame[] = [];
  if (gameIds.length > 0) {
    const { data: gameRows } = await supabase
      .from("games")
      .select(
        "id, session_id, team_a_score, team_b_score, played_at, voided_at, game_players(player_id, team, players(id, display_name, code)), sessions(name)"
      )
      .in("id", gameIds)
      .order("played_at", { ascending: false });

    games = (gameRows ?? []).map((g) => {
      const session = one((g as { sessions: unknown }).sessions) as { name?: string } | null;
      return {
        id: g.id,
        session_id: g.session_id,
        session_name: session?.name ?? "Session",
        team_a_score: g.team_a_score,
        team_b_score: g.team_b_score,
        played_at: g.played_at,
        voided_at: g.voided_at,
        game_players: g.game_players as PlayerGame["game_players"],
      };
    });
  }

  return { group, player, rating, games };
}

/** Compute this player's aggregate stats from their own (non-voided) game rows. */
function computeStats(playerId: string, games: PlayerGame[]) {
  const active = games.filter((g) => !g.voided_at);
  let wins = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;

  for (const g of active) {
    const myTeam = g.game_players.find((gp) => gp.player_id === playerId)?.team === "B" ? "B" : "A";
    const myScore = myTeam === "A" ? g.team_a_score : g.team_b_score;
    const oppScore = myTeam === "A" ? g.team_b_score : g.team_a_score;
    pointsFor += myScore;
    pointsAgainst += oppScore;
    if (myScore > oppScore) wins++;
  }

  const played = active.length;
  const losses = played - wins;
  const winPct = played > 0 ? Math.round((wins / played) * 1000) / 10 : 0;
  const avgDiff = played > 0 ? Math.round(((pointsFor - pointsAgainst) / played) * 10) / 10 : 0;

  return { played, wins, losses, winPct, pointsFor, pointsAgainst, avgDiff };
}

export default async function PlayerHistoryPage({ params }: PageProps) {
  const { join_code, player_id } = await params;
  const data = await getData(join_code, player_id);

  if (!data) notFound();

  const { group, player, rating, games } = data;
  const sport = group.sport as Sport;
  const labels = getStatLabels(sport);
  const stats = computeStats(player.id, games);

  const tier = rating?.rating != null ? getTier(rating.rating) : null;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <Link
          href={`/g/${group.join_code}/leaderboard`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Leaderboard
        </Link>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800 font-mono">
              {player.code}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{player.display_name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                {tier && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${tierColor(tier)}`}>
                    {tier}
                  </span>
                )}
                {rating?.rating != null && (
                  <span className="text-xs text-gray-400">
                    {Math.round(rating.rating)} RDR
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stat summary */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div>
            <p className="text-[11px] text-gray-400">{labels.unitHeader}</p>
            <p className="text-sm font-semibold text-gray-900">{stats.played}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">Record</p>
            <p className="text-sm font-semibold text-gray-900">{stats.wins}W&ndash;{stats.losses}L</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">Win %</p>
            <p className="text-sm font-semibold text-gray-900">{stats.winPct}%</p>
          </div>
          <div>
            <p className={`text-sm font-semibold ${stats.avgDiff > 0 ? "text-emerald-700" : stats.avgDiff < 0 ? "text-red-600" : "text-gray-900"}`}>
              {formatDiff(stats.avgDiff)}
            </p>
            <p className="text-[11px] text-gray-400 -mt-0.5">Avg Diff</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">{labels.for}</p>
            <p className="text-sm font-semibold text-gray-900">{stats.pointsFor}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">{labels.against}</p>
            <p className="text-sm font-semibold text-gray-900">{stats.pointsAgainst}</p>
          </div>
        </div>

        {/* Game history */}
        <PlayerGameHistoryList playerId={player.id} joinCode={group.join_code} games={games} />
      </div>
    </div>
  );
}
