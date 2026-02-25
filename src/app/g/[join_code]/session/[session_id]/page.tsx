import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import { one } from "@/lib/supabase/helpers";
import { formatTime } from "@/lib/datetime";
import type { PairCount, Player } from "@/lib/types";
import type { GameRecord } from "@/lib/autoSuggest";
import Link from "next/link";
import { notFound } from "next/navigation";
import EndSessionButton from "./EndSessionButton";
import ModeToggle from "./ModeToggle";
import RecordGameForm from "./RecordGameForm";
import StaleBanner from "./StaleBanner";
import VoidLastGameButton from "./VoidLastGameButton";
import EndedSessionGames from "./EndedSessionGames";

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
    .select("id, name, started_at, ended_at, closed_reason, target_points_default, win_by_default")
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
      "id, sequence_num, team_a_score, team_b_score, played_at, voided_at, game_players(player_id, team, players(id, display_name, code))"
    )
    .eq("session_id", sessionId)
    .order("sequence_num", { ascending: false });

  // Fetch pairing balance via RPC (needed by RecordGameForm)
  const { data: pairCounts, error: pairError } = await supabase.rpc(
    RPC.GET_SESSION_PAIR_COUNTS,
    { p_session_id: sessionId }
  );

  if (pairError) {
    console.error("get_session_pair_counts error:", pairError);
  }

  // Transform non-voided games into GameRecord[] for inline pairing feedback
  const gameRecords: GameRecord[] = (games ?? [])
    .filter((g) => !g.voided_at)
    .map((g) => {
      const gps = Array.isArray(g.game_players) ? g.game_players : [];
      return {
        id: g.id,
        teamAIds: gps
          .filter((gp: { team: string }) => gp.team === "A")
          .map((gp: { player_id: string }) => gp.player_id),
        teamBIds: gps
          .filter((gp: { team: string }) => gp.team === "B")
          .map((gp: { player_id: string }) => gp.player_id),
        played_at: g.played_at,
      };
    });

  return {
    group,
    session,
    attendees: attendees ?? [],
    games: games ?? [],
    gameRecords,
    pairCounts: (pairCounts ?? []) as PairCount[],
  };
}

/** Session is ACTIVE when ended_at IS NULL. No time-based expiry. */
function isActiveSession(session: { ended_at: string | null }): boolean {
  return !session.ended_at;
}

export default async function SessionPage({ params }: PageProps) {
  const { join_code, session_id } = await params;
  const data = await getSessionData(join_code, session_id);

  if (!data) notFound();

  const { group, session, attendees, games, gameRecords, pairCounts } = data;
  const active = isActiveSession(session);

  // Stale detection: active but no non-voided game in 24 hours
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const lastGameAt = games
    .filter((g) => !(g as { voided_at?: string | null }).voided_at)
    .reduce((max, g) => {
      const t = g.played_at ? new Date(g.played_at).getTime() : 0;
      return Number.isNaN(t) ? max : Math.max(max, t);
    }, 0);
  const staleRef = lastGameAt || new Date(session.started_at).getTime();
  const isStale = active && Date.now() - staleRef > TWENTY_FOUR_HOURS_MS;

  // Format started_at for display
  const startedLabel = formatTime(session.started_at);

  // Flatten attendees into Player[] for RecordGameForm, sorted by code
  const players = attendees
    .map((row) => {
      const player = one(row.players) as Player | null;
      if (!player) return null;
      return player;
    })
    .filter((p): p is Player => p !== null)
    .sort((a, b) => a.code.localeCompare(b.code));

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

  // ── ACTIVE session layout ─────────────────────────────────────
  if (active) {
    return (
      <div className="flex flex-col px-4 py-8">
        <div className="w-full max-w-sm mx-auto space-y-6">
          {/* Back link */}
          <Link
            href={`/g/${group.join_code}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr; {group.name}
          </Link>

          {/* Session header */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold leading-tight font-mono">
                {session.name}
              </h1>
              <EndSessionButton sessionId={session.id} joinCode={group.join_code} />
            </div>
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-gray-400 mt-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live Session &middot; Started {startedLabel}
            </p>
          </div>

          {/* Mode toggle: Manual | Courts */}
          <ModeToggle
            mode="manual"
            manualHref={`/g/${group.join_code}/session/${session.id}`}
            courtsHref={`/g/${group.join_code}/session/${session.id}/courts`}
          />

          {/* Stale session banner — UI only, does not block scoring */}
          <StaleBanner isStale={isStale} sessionId={session.id} joinCode={group.join_code} />

          {/* Record Game form — no wrapper card */}
          <RecordGameForm
            sessionId={session.id}
            joinCode={group.join_code}
            attendees={players}
            pairCounts={pairCounts.map((p) => ({
              player_a_id: p.player_a_id,
              player_b_id: p.player_b_id,
              games_together: p.games_together,
            }))}
            games={gameRecords}
            sessionRules={{
              targetPoints: (session as unknown as { target_points_default: number }).target_points_default ?? 11,
              winBy: (session as unknown as { win_by_default: number }).win_by_default ?? 2,
            }}
          />

          {/* Void last game — secondary utility */}
          <VoidLastGameButton
            sessionId={session.id}
            joinCode={group.join_code}
          />

          {/* Last game status row — live ticker feel */}
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

          {/* Bottom nav row */}
          <div className="flex items-center justify-between pt-4">
            <Link
              href={`/g/${group.join_code}/session/${session.id}/games`}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              All games &rarr;
            </Link>
            <Link
              href={`/g/${group.join_code}/leaderboard`}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Standings &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── ENDED session layout ──────────────────────────────────────
  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Back link */}
        <Link
          href={`/g/${group.join_code}`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; {group.name}
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

        {/* Games recorded in this session (voided hidden by default) */}
        {games.length > 0 && (
          <EndedSessionGames
            games={games as Parameters<typeof EndedSessionGames>[0]["games"]}
          />
        )}

        {/* Bottom nav row */}
        <div className="flex items-center justify-between pt-4">
          <Link
            href={`/g/${group.join_code}/session/${session.id}/games`}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            All games &rarr;
          </Link>
          <Link
            href={`/g/${group.join_code}/leaderboard`}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Standings &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
