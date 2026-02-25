import { getServerClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/helpers";
import { formatTime } from "@/lib/datetime";
import Link from "next/link";
import { notFound } from "next/navigation";
import EndedSessionGames from "@/app/g/[join_code]/session/[session_id]/EndedSessionGames";

/**
 * View-Only Session Detail — Server Component.
 *
 * Read-only mirror of /g/[join_code]/session/[session_id]/page.tsx.
 * Shows session header, game ticker, and game list.
 * No write components: no RecordGameForm, EndSessionButton, VoidLastGameButton,
 * StaleBanner, ModeToggle, Rules Chip, or Courts links.
 */

interface PageProps {
  params: Promise<{ view_code: string; session_id: string }>;
}

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

async function getSessionData(viewCode: string, sessionId: string) {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, view_code")
    .eq("view_code", viewCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, started_at, ended_at, closed_reason")
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

  return { group, session, games: games ?? [] };
}

export default async function ViewSessionPage({ params }: PageProps) {
  const { view_code, session_id } = await params;
  const data = await getSessionData(view_code, session_id);

  if (!data) notFound();

  const { group, session, games } = data;
  const active = !session.ended_at;

  const startedLabel = formatTime(session.started_at);

  // Compute "Last Result" parts from most recent non-voided game
  const lastGame = games.find((g) => !(g as { voided_at?: string | null }).voided_at);
  let lastScore: string | null = null;
  let lastTeams: string | null = null;
  let lastTime: string | null = null;
  if (lastGame) {
    const gp = Array.isArray(lastGame.game_players) ? lastGame.game_players : [];
    const aCodes = teamCodes(gp, "A").join("/");
    const bCodes = teamCodes(gp, "B").join("/");
    lastScore = `${lastGame.team_a_score}\u2013${lastGame.team_b_score}`;
    lastTeams = `${aCodes} vs ${bCodes}`;
    lastTime = formatTime(lastGame.played_at);
  }

  // ── ACTIVE session layout (simplified read-only) ──────────────────────────
  if (active) {
    return (
      <div className="flex flex-col px-4 py-8">
        <div className="w-full max-w-sm mx-auto space-y-6">
          {/* Back link */}
          <Link
            href={`/v/${group.view_code}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr; {group.name}
          </Link>

          {/* Session header */}
          <div>
            <h1 className="text-xl font-bold leading-tight font-mono">
              {session.name}
            </h1>
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-gray-400 mt-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live Session &middot; Started {startedLabel}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              View-only
            </p>
          </div>

          {/* Last game ticker */}
          {lastScore && lastTeams && lastTime && (
            <div className="flex items-center gap-2 text-xs truncate">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 shrink-0">
                Last
              </span>
              <span className="font-semibold text-gray-700 font-mono shrink-0">{lastScore}</span>
              <span className="text-gray-400 font-mono truncate">{lastTeams}</span>
              <span className="text-gray-300 shrink-0">{lastTime}</span>
            </div>
          )}

          {/* Recent games */}
          {games.length > 0 && (
            <EndedSessionGames
              games={games as Parameters<typeof EndedSessionGames>[0]["games"]}
            />
          )}

          {/* Bottom nav */}
          <div className="flex items-center justify-between pt-4">
            <Link
              href={`/v/${group.view_code}/session/${session.id}/games`}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              All games &rarr;
            </Link>
            <Link
              href={`/v/${group.view_code}/leaderboard`}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Standings &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── ENDED session layout ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Back link */}
        <Link
          href={`/v/${group.view_code}/sessions`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Sessions
        </Link>

        {/* Session header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
              Ended
            </span>
            <span className="text-xs text-gray-400">Started {startedLabel}</span>
          </div>
          <h1 className="text-xl font-bold leading-tight font-mono">
            {session.name}
          </h1>
        </div>

        {/* Games */}
        {games.length > 0 && (
          <EndedSessionGames
            games={games as Parameters<typeof EndedSessionGames>[0]["games"]}
          />
        )}

        {/* Bottom nav */}
        <div className="flex items-center justify-between pt-4">
          <Link
            href={`/v/${group.view_code}/session/${session.id}/games`}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            All games &rarr;
          </Link>
          <Link
            href={`/v/${group.view_code}/leaderboard`}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Standings &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
