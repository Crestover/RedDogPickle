import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import { one } from "@/lib/supabase/helpers";
import type { PairCount, CourtData, AttendeeWithStatus } from "@/lib/types";
import { notFound } from "next/navigation";
import Link from "next/link";
import ModeToggle from "../ModeToggle";
import CourtsManager from "./CourtsManager";
import CourtsSetup from "./CourtsSetup";
import type { GameRecord, PairCountEntry } from "@/lib/autoSuggest";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
}

export default async function CourtsPage({ params }: PageProps) {
  const { join_code, session_id } = await params;
  const supabase = getServerClient();

  // Fetch group
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", join_code.toLowerCase())
    .maybeSingle();

  if (!group) notFound();

  // Fetch session (must belong to this group and be active)
  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, started_at, ended_at, closed_reason, target_points_default, win_by_default")
    .eq("id", session_id)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!session) notFound();

  // Check if session is active (ended_at only — no time-based expiry)
  const isActive = !session.ended_at;
  if (!isActive) notFound();

  // Fetch session_courts (ordered by court_number)
  const { data: courtsRaw } = await supabase
    .from("session_courts")
    .select("id, court_number, status, team_a_ids, team_b_ids, assigned_at, last_game_id")
    .eq("session_id", session_id)
    .order("court_number", { ascending: true });

  const courts: CourtData[] = (courtsRaw ?? []) as CourtData[];

  // Fetch attendees (with player details + status columns)
  const { data: attendeesRaw } = await supabase
    .from("session_players")
    .select("player_id, status, inactive_effective_after_game, players(id, display_name, code)")
    .eq("session_id", session_id);

  const attendees: AttendeeWithStatus[] = (attendeesRaw ?? [])
    .map((row) => {
      const player = one(
        (row as { players?: { id: string; display_name: string; code: string } | { id: string; display_name: string; code: string }[] | null }).players
      ) as { id: string; display_name: string; code: string } | null;
      if (!player) return null;
      return {
        id: player.id,
        display_name: player.display_name,
        code: player.code,
        status: (row as { status: string }).status as "ACTIVE" | "INACTIVE",
        inactive_effective_after_game: (row as { inactive_effective_after_game: boolean }).inactive_effective_after_game,
      };
    })
    .filter((p): p is AttendeeWithStatus => p !== null)
    .sort((a, b) => a.code.localeCompare(b.code));

  // Fetch games (non-voided only, for auto-suggest)
  const { data: gamesRaw } = await supabase
    .from("games")
    .select(
      "id, sequence_num, team_a_score, team_b_score, played_at, voided_at, game_players(player_id, team)"
    )
    .eq("session_id", session_id)
    .is("voided_at", null)
    .order("sequence_num", { ascending: true });

  const games: GameRecord[] = (gamesRaw ?? []).map((g) => {
    const gps = Array.isArray(g.game_players) ? g.game_players : [];
    return {
      id: g.id,
      teamAIds: gps.filter((gp: { team: string }) => gp.team === "A").map((gp: { player_id: string }) => gp.player_id),
      teamBIds: gps.filter((gp: { team: string }) => gp.team === "B").map((gp: { player_id: string }) => gp.player_id),
      played_at: g.played_at,
    };
  });

  // Fetch pair counts
  const { data: pairCountsRaw } = await supabase.rpc(
    RPC.GET_SESSION_PAIR_COUNTS,
    { p_session_id: session_id }
  );

  const pairCounts: PairCountEntry[] = ((pairCountsRaw ?? []) as PairCount[]).map((p) => ({
    player_a_id: p.player_a_id,
    player_b_id: p.player_b_id,
    games_together: p.games_together,
  }));

  // Compute games-played-this-session per player
  const gamesPlayedMap: Record<string, number> = {};
  for (const game of games) {
    for (const pid of [...game.teamAIds, ...game.teamBIds]) {
      gamesPlayedMap[pid] = (gamesPlayedMap[pid] ?? 0) + 1;
    }
  }

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
          <h1 className="text-xl font-bold leading-tight font-mono">
            {session.name}
          </h1>
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-gray-400 mt-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live Session &middot; Courts
          </p>
        </div>

        {/* Mode toggle: Manual | Courts */}
        <ModeToggle
          mode="courts"
          manualHref={`/g/${group.join_code}/session/${session.id}`}
          courtsHref={`/g/${group.join_code}/session/${session.id}/courts`}
        />

        {courts.length === 0 ? (
          <CourtsSetup
            sessionId={session.id}
            joinCode={group.join_code}
            attendeeCount={attendees.length}
          />
        ) : (
          <CourtsManager
            sessionId={session.id}
            joinCode={group.join_code}
            attendees={attendees}
            courts={courts}
            pairCounts={pairCounts}
            gamesPlayedMap={gamesPlayedMap}
            games={games}
            sessionRules={{
              targetPoints: (session as unknown as { target_points_default: number }).target_points_default ?? 11,
              winBy: (session as unknown as { win_by_default: number }).win_by_default ?? 2,
            }}
          />
        )}
      </div>
    </div>
  );
}
