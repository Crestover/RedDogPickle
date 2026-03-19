import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import type { PlayerStats, PlayerRating } from "@/lib/types";
import { getGoatResult } from "@/lib/goat";
import type { GoatCandidate } from "@/lib/goat";
import PlayerStatsRow from "@/lib/components/PlayerStatsRow";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Group Leaderboard — Server Component.
 *
 * Three toggle pills: All-time (default) | Last 30 Days | Last Session.
 * Stats computed from raw games via get_group_stats / get_session_stats RPCs.
 * Toggle via ?range=30d | ?range=last query param (no Client Component needed).
 *
 * All-time and 30-day modes sort by RDR (server-side via p_sort_by: 'rdr').
 * Last Session mode uses existing win% sorting.
 */

interface PageProps {
  params: Promise<{ join_code: string }>;
  searchParams: Promise<{ range?: string; from?: string; session_id?: string }>;
}

type RangeMode = "all" | "30d" | "last";

async function getGroup(joinCode: string) {
  const supabase = getServerClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();
  return group;
}

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

/**
 * Fetch full PlayerRating rows for the group.
 *
 * This is the authoritative source for current rating state (rating,
 * RD, confidence, peak, reacclimation). Leaderboard pages need the
 * full shape because GOAT computation requires peak_rating, games_rated,
 * and updated_at. Session pages should use SessionRatingInfo instead.
 */
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

// Conservative regex matching our join_code format (lowercase alphanumeric + hyphens)
const JOIN_CODE_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

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

export default async function LeaderboardPage({ params, searchParams }: PageProps) {
  const { join_code: rawJoinCode } = await params;
  const { range, from, session_id: sessionIdParam } = await searchParams;

  // Input sanitisation
  const joinCode = decodeURIComponent(rawJoinCode).trim().toLowerCase();
  if (!JOIN_CODE_RE.test(joinCode)) notFound();

  const mode = parseRange(range);

  const group = await getGroup(joinCode);
  if (!group) notFound();

  // ── Session navigation for single-session mode (Part D) ──────────────────
  // When session_id is provided, load that specific session's stats.
  // Also fetch adjacent sessions for prev/next navigation.
  let targetSessionId: string | null = null;
  let prevSessionId: string | null = null;
  let nextSessionId: string | null = null;
  let sessionName: string | null = null;

  // Fetch stats based on selected range
  // All modes now return rdr from their respective RPCs and are
  // sorted server-side — no client re-sorting.
  let stats: PlayerStats[];

  if (mode === "last" && sessionIdParam) {
    // Specific session requested — fetch that session's stats
    targetSessionId = sessionIdParam;
    const { data: sessionStats, error: sessionStatsError } = await (async () => {
      const supabase = getServerClient();
      return supabase.rpc(RPC.GET_SESSION_STATS, { p_session_id: sessionIdParam });
    })();
    if (sessionStatsError) {
      console.error("get_session_stats error:", sessionStatsError);
      stats = [];
    } else {
      stats = (sessionStats ?? []) as PlayerStats[];
    }

    // Fetch session name for display
    const supabase = getServerClient();
    const { data: sessionRow } = await supabase
      .from("sessions")
      .select("id, name")
      .eq("id", sessionIdParam)
      .maybeSingle();
    sessionName = sessionRow?.name ?? null;

    // Fetch adjacent sessions for prev/next nav
    const { data: allSessions } = await supabase
      .from("sessions")
      .select("id, started_at")
      .eq("group_id", group.id)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false });

    if (allSessions) {
      const idx = allSessions.findIndex((s) => s.id === sessionIdParam);
      if (idx >= 0) {
        // Ordered newest first: prev = older (idx+1), next = newer (idx-1)
        nextSessionId = idx > 0 ? allSessions[idx - 1].id : null;
        prevSessionId = idx < allSessions.length - 1 ? allSessions[idx + 1].id : null;
      }
    }
  } else if (mode === "last") {
    // Default "last session" — find the most recent ended session
    const supabase = getServerClient();
    const { data: lastId } = await supabase.rpc(
      RPC.GET_LAST_SESSION_ID,
      { p_join_code: joinCode }
    );
    if (lastId) {
      targetSessionId = lastId;
      const { data: sessionStats } = await supabase.rpc(
        RPC.GET_SESSION_STATS,
        { p_session_id: lastId }
      );
      stats = (sessionStats ?? []) as PlayerStats[];

      // Fetch session name
      const { data: sessionRow } = await supabase
        .from("sessions")
        .select("id, name")
        .eq("id", lastId)
        .maybeSingle();
      sessionName = sessionRow?.name ?? null;

      // Fetch adjacent sessions
      const { data: allSessions } = await supabase
        .from("sessions")
        .select("id, started_at")
        .eq("group_id", group.id)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false });

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
    // All-time and 30-day: sort by RDR server-side
    const days = mode === "30d" ? 30 : null;
    stats = await getGroupStats(joinCode, days, "rdr");
  }

  // Fetch player ratings for display (needed for last-session mode which
  // doesn't return rdr column, and for provisional flag + GOAT computation)
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

  // Back link destination: context-aware
  const backHref = from
    ? decodeURIComponent(from)
    : `/g/${group.join_code}`;
  const backLabel = from ? "Back" : group.name;

  // Build query params helper for session navigation links
  function sessionNavHref(sid: string) {
    return `/g/${group!.join_code}/leaderboard?range=last&session_id=${sid}${from ? `&from=${encodeURIComponent(from)}` : ""}`;
  }

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href={backHref}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr; {backLabel}
          </Link>
          <h1 className="mt-3 text-2xl font-bold">Leaderboard</h1>
        </div>

        {/* Toggle — 3 pills */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          <Link
            href={`/g/${group.join_code}/leaderboard`}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors ${
              mode === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All-time
          </Link>
          <Link
            href={`/g/${group.join_code}/leaderboard?range=30d`}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold transition-colors ${
              mode === "30d"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            30 Days
          </Link>
          <Link
            href={`/g/${group.join_code}/leaderboard?range=last`}
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
                <span className="text-xs text-gray-300">
                  &larr; Previous
                </span>
              )}
              {nextSessionId ? (
                <Link
                  href={sessionNavHref(nextSessionId)}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Next &rarr;
                </Link>
              ) : (
                <span className="text-xs text-gray-300">
                  Next &rarr;
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {stats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500 text-sm">{emptyMessage(mode)}</p>
            <Link
              href={`/g/${group.join_code}/start`}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Start a Session
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.map((player, index) => {
              const pr = ratingsMap.get(player.player_id);
              // All RPCs now return rdr; fall back to ratings table if null
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
                  ratingDeviation={pr?.rating_deviation ?? null}
                  isReigningGoat={player.player_id === reigningGoatPlayerId}
                  isAllTimeGoat={player.player_id === allTimeGoatPlayerId}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
