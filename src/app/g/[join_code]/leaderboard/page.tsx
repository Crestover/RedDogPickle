import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Group Leaderboard — Server Component.
 *
 * SPEC §7.5: All-time (default) and Last 30 Days toggle.
 * Stats computed from raw games via get_group_stats RPC.
 * Toggle via ?range=30d query param (no Client Component needed).
 */

interface PageProps {
  params: Promise<{ join_code: string }>;
  searchParams: Promise<{ range?: string }>;
}

interface PlayerStats {
  player_id: string;
  display_name: string;
  code: string;
  games_played: number;
  games_won: number;
  win_pct: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  avg_point_diff: number;
}

async function getGroupAndStats(joinCode: string, days: number | null) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch group for header
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  // Fetch stats via RPC
  const { data: stats, error } = await supabase.rpc("get_group_stats", {
    p_join_code: joinCode,
    p_days: days,
  });

  if (error) {
    console.error("get_group_stats error:", error);
    return { group, stats: [] as PlayerStats[] };
  }

  return { group, stats: (stats ?? []) as PlayerStats[] };
}

function formatDiff(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

// Conservative regex matching our join_code format (lowercase alphanumeric + hyphens)
const JOIN_CODE_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

export default async function LeaderboardPage({ params, searchParams }: PageProps) {
  const { join_code: rawJoinCode } = await params;
  const { range } = await searchParams;

  // Input sanitisation
  const joinCode = decodeURIComponent(rawJoinCode).trim().toLowerCase();
  if (!JOIN_CODE_RE.test(joinCode)) notFound();

  // Only "30d" is valid; anything else defaults to all-time
  const is30d = range === "30d";
  const days = is30d ? 30 : null;

  const result = await getGroupAndStats(joinCode, days);
  if (!result) notFound();

  const { group, stats } = result;

  return (
    <main className="flex min-h-screen flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href={`/g/${group.join_code}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← {group.name}
          </Link>
          <h1 className="mt-3 text-2xl font-bold">Leaderboard</h1>
        </div>

        {/* Toggle */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          <Link
            href={`/g/${group.join_code}/leaderboard`}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors ${
              !is30d
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All-time
          </Link>
          <Link
            href={`/g/${group.join_code}/leaderboard?range=30d`}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors ${
              is30d
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Last 30 Days
          </Link>
        </div>

        {/* Stats */}
        {stats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500 text-sm">
              {is30d
                ? "No games in the last 30 days."
                : "No games recorded yet."}
            </p>
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
              const losses = player.games_played - player.games_won;
              return (
                <div
                  key={player.player_id}
                  className="rounded-xl bg-white border border-gray-200 px-4 py-3"
                >
                  {/* Top row: rank, code badge, name, W-L */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400 w-6 text-right shrink-0">
                      #{index + 1}
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800 font-mono">
                      {player.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {player.display_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {player.games_won}W–{losses}L
                        <span className="mx-1.5 text-gray-300">·</span>
                        {player.win_pct}%
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold ${
                          player.point_diff > 0
                            ? "text-green-700"
                            : player.point_diff < 0
                            ? "text-red-600"
                            : "text-gray-500"
                        }`}
                      >
                        {formatDiff(player.point_diff)}
                      </p>
                      <p className="text-xs text-gray-400">pt diff</p>
                    </div>
                  </div>

                  {/* Detail row */}
                  <div className="mt-2 flex items-center gap-4 pl-9 text-xs text-gray-400">
                    <span>{player.games_played} games</span>
                    <span>
                      PF {player.points_for} / PA {player.points_against}
                    </span>
                    <span>
                      Avg {formatDiff(player.avg_point_diff)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
