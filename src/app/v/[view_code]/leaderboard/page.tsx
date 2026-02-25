import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import type { PlayerStats, PlayerRating } from "@/lib/types";
import PlayerStatsRow from "@/lib/components/PlayerStatsRow";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * View-Only Leaderboard — Server Component.
 *
 * Read-only mirror of /g/[join_code]/leaderboard/page.tsx.
 * Resolves group by view_code. Same data, no write CTAs.
 */

interface PageProps {
  params: Promise<{ view_code: string }>;
  searchParams: Promise<{ range?: string }>;
}

type RangeMode = "all" | "30d" | "last";

async function getGroupByViewCode(viewCode: string) {
  const supabase = getServerClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, view_code")
    .eq("view_code", viewCode.toLowerCase())
    .maybeSingle();
  return group;
}

// join_code used server-side only for RPC params; must never be rendered in /v
async function getGroupStats(joinCode: string, days: number | null, sortBy: string = "rdr") {
  const supabase = getServerClient();
  const { data: stats, error } = await supabase.rpc(RPC.GET_GROUP_STATS, {
    p_join_code: joinCode,
    p_days: days,
    p_sort_by: sortBy,
  });
  if (error) {
    console.error("get_group_stats error:", error);
    return [] as PlayerStats[];
  }
  return (stats ?? []) as PlayerStats[];
}

async function getLastSessionStats(joinCode: string) {
  const supabase = getServerClient();

  const { data: sessionId, error: idError } = await supabase.rpc(
    RPC.GET_LAST_SESSION_ID,
    { p_join_code: joinCode }
  );

  if (idError) {
    console.error("get_last_session_id error:", idError);
    return [] as PlayerStats[];
  }

  if (!sessionId) return [] as PlayerStats[];

  const { data: stats, error: statsError } = await supabase.rpc(
    RPC.GET_SESSION_STATS,
    { p_session_id: sessionId }
  );

  if (statsError) {
    console.error("get_session_stats error:", statsError);
    return [] as PlayerStats[];
  }

  return (stats ?? []) as PlayerStats[];
}

async function getGroupRatings(groupId: string): Promise<Map<string, PlayerRating>> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("player_ratings")
    .select("group_id, player_id, rating, games_rated, provisional")
    .eq("group_id", groupId);

  if (error) {
    console.error("player_ratings query error:", error);
    return new Map();
  }

  const map = new Map<string, PlayerRating>();
  for (const row of data ?? []) {
    map.set(row.player_id, row as PlayerRating);
  }
  return map;
}

function parseRange(range?: string): RangeMode {
  if (range === "30d") return "30d";
  if (range === "last") return "last";
  return "all";
}

function emptyMessage(mode: RangeMode): string {
  if (mode === "30d") return "No games in the last 30 days.";
  if (mode === "last") return "No completed sessions yet.";
  return "No games recorded yet.";
}

export default async function ViewLeaderboardPage({ params, searchParams }: PageProps) {
  const { view_code } = await params;
  const { range } = await searchParams;

  const group = await getGroupByViewCode(view_code);
  if (!group) notFound();

  const mode = parseRange(range);

  let stats: PlayerStats[];
  if (mode === "last") {
    stats = await getLastSessionStats(group.join_code);
  } else {
    const days = mode === "30d" ? 30 : null;
    stats = await getGroupStats(group.join_code, days, "rdr");
  }

  const ratingsMap = await getGroupRatings(group.id);

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href={`/v/${group.view_code}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr; {group.name}
          </Link>
          <h1 className="mt-3 text-2xl font-bold">Leaderboard</h1>
        </div>

        {/* Toggle — 3 pills */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          <Link
            href={`/v/${group.view_code}/leaderboard`}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors ${
              mode === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All-time
          </Link>
          <Link
            href={`/v/${group.view_code}/leaderboard?range=30d`}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors ${
              mode === "30d"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            30 Days
          </Link>
          <Link
            href={`/v/${group.view_code}/leaderboard?range=last`}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors ${
              mode === "last"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Last Session
          </Link>
        </div>

        {/* Stats */}
        {stats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500 text-sm">{emptyMessage(mode)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.map((player, index) => {
              const pr = ratingsMap.get(player.player_id);
              const rating = player.rdr != null
                ? Number(player.rdr)
                : (pr?.rating ?? null);
              return (
                <PlayerStatsRow
                  key={player.player_id}
                  rank={index + 1}
                  player={player}
                  rating={rating}
                  provisional={pr?.provisional ?? false}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
