import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import type { PlayerStats, PlayerRating } from "@/lib/types";
import { getGoatResult } from "@/lib/goat";
import type { GoatCandidate } from "@/lib/goat";
import LeaderboardCardList from "@/lib/components/LeaderboardCardList";
import RdrHelpLink from "@/lib/components/RdrHelpLink";
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
  searchParams: Promise<{ range?: string; session_id?: string }>;
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

/** Full PlayerRating rows — needed for GOAT computation. See /g/ leaderboard. */
async function getGroupRatings(groupId: string): Promise<Map<string, PlayerRating>> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("player_ratings")
    .select("group_id, player_id, rating, games_rated, provisional, peak_rating, peak_rating_achieved_at, rating_deviation, last_played_at, reacclimation_games_remaining, updated_at")
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
  return "No games yet. Once you start playing, ratings will track performance across your group.";
}

export default async function ViewLeaderboardPage({ params, searchParams }: PageProps) {
  const { view_code } = await params;
  const { range, session_id: sessionIdParam } = await searchParams;

  const group = await getGroupByViewCode(view_code);
  if (!group) notFound();

  const mode = parseRange(range);

  let stats: PlayerStats[];
  let targetSessionId: string | null = null;
  let prevSessionId: string | null = null;
  let nextSessionId: string | null = null;
  let sessionName: string | null = null;

  if (mode === "last" && sessionIdParam) {
    targetSessionId = sessionIdParam;
    const supabase = getServerClient();
    const { data: sessionStats } = await supabase.rpc(RPC.GET_SESSION_STATS, { p_session_id: sessionIdParam });
    stats = (sessionStats ?? []) as PlayerStats[];

    const { data: sessionRow } = await supabase.from("sessions").select("id, name").eq("id", sessionIdParam).maybeSingle();
    sessionName = sessionRow?.name ?? null;

    const { data: allSessions } = await supabase
      .from("sessions").select("id, started_at").eq("group_id", group.id)
      .not("ended_at", "is", null).order("started_at", { ascending: false });
    if (allSessions) {
      const idx = allSessions.findIndex((s) => s.id === sessionIdParam);
      if (idx >= 0) {
        nextSessionId = idx > 0 ? allSessions[idx - 1].id : null;
        prevSessionId = idx < allSessions.length - 1 ? allSessions[idx + 1].id : null;
      }
    }
  } else if (mode === "last") {
    const supabase = getServerClient();
    const { data: lastId } = await supabase.rpc(RPC.GET_LAST_SESSION_ID, { p_join_code: group.join_code });
    if (lastId) {
      targetSessionId = lastId;
      const { data: sessionStats } = await supabase.rpc(RPC.GET_SESSION_STATS, { p_session_id: lastId });
      stats = (sessionStats ?? []) as PlayerStats[];
      const { data: sessionRow } = await supabase.from("sessions").select("id, name").eq("id", lastId).maybeSingle();
      sessionName = sessionRow?.name ?? null;
      const { data: allSessions } = await supabase
        .from("sessions").select("id, started_at").eq("group_id", group.id)
        .not("ended_at", "is", null).order("started_at", { ascending: false });
      if (allSessions) {
        const idx = allSessions.findIndex((s) => s.id === lastId);
        if (idx >= 0) {
          nextSessionId = idx > 0 ? allSessions[idx - 1].id : null;
          prevSessionId = idx < allSessions.length - 1 ? allSessions[idx + 1].id : null;
        }
      }
    } else {
      stats = [];
    }
  } else {
    const days = mode === "30d" ? 30 : null;
    stats = await getGroupStats(group.join_code, days, "rdr");
  }

  const ratingsMap = await getGroupRatings(group.id);

  // Compute GOAT designations (All-time mode only)
  let reigningGoatPlayerId: string | null = null;
  let allTimeGoatPlayerId: string | null = null;

  if (mode === "all" && stats.length > 0) {
    const goatCandidates: GoatCandidate[] = stats.map((s) => {
      const pr = ratingsMap.get(s.player_id);
      return {
        player_id: s.player_id,
        current_rdr: pr?.rating ?? 1200,
        peak_rdr: pr?.peak_rating ?? 1200,
        games_rated: pr?.games_rated ?? 0,
        win_pct: s.win_pct,
        point_diff: Number(s.point_diff),
        peak_rating_achieved_at: pr?.peak_rating_achieved_at ?? null,
        rating_achieved_at: pr?.updated_at ?? null,
      };
    });
    const result = getGoatResult(goatCandidates);
    reigningGoatPlayerId = result.reigningGoatPlayerId;
    allTimeGoatPlayerId = result.allTimeGoatPlayerId;
  }

  function sessionNavHref(sid: string) {
    return `/v/${group!.view_code}/leaderboard?range=last&session_id=${sid}`;
  }

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
          <div className="mt-3 flex items-center gap-3">
            <h1 className="text-2xl font-bold">Leaderboard</h1>
            <RdrHelpLink from={`/v/${group.view_code}/leaderboard`} />
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            Ratings update based on who you play and how you perform. More games = more accurate.
          </p>
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

        {/* Session nav — prev/next for single-session mode */}
        {mode === "last" && targetSessionId && (
          <div className="space-y-2">
            {sessionName && (
              <p className="text-sm font-mono text-gray-600 text-center truncate">
                {sessionName}
              </p>
            )}
            <div className="flex items-center justify-between">
              {prevSessionId ? (
                <Link
                  href={sessionNavHref(prevSessionId)}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  &larr; Previous
                </Link>
              ) : (
                <span className="text-xs text-gray-300">&larr; Previous</span>
              )}
              {nextSessionId ? (
                <Link
                  href={sessionNavHref(nextSessionId)}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Next &rarr;
                </Link>
              ) : (
                <span className="text-xs text-gray-300">Next &rarr;</span>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {stats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500 text-sm">{emptyMessage(mode)}</p>
          </div>
        ) : (
          <LeaderboardCardList
            cards={stats.map((player, index) => {
              const pr = ratingsMap.get(player.player_id);
              const rating = player.rdr != null
                ? Number(player.rdr)
                : (pr?.rating ?? null);
              return {
                playerId: player.player_id,
                rank: index + 1,
                player,
                rating,
                provisional: pr?.provisional ?? false,
                ratingDeviation: pr?.rating_deviation ?? null,
                isReigningGoat: player.player_id === reigningGoatPlayerId,
                isAllTimeGoat: player.player_id === allTimeGoatPlayerId,
              };
            })}
          />
        )}
      </div>
    </div>
  );
}
