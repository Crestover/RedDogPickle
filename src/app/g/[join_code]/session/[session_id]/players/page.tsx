import { getServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Player, Sport } from "@/lib/types";
import { getSportConfig } from "@/lib/sports";
import SessionPlayerPicker from "./SessionPlayerPicker";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
  searchParams: Promise<{ selected?: string }>;
}

async function getData(joinCode: string, sessionId: string) {
  const supabase = getServerClient();

  // Fetch group (need sport for playersPerTeam)
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, sport")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  // Session must belong to this group and still be active
  const { data: session } = await supabase
    .from("sessions")
    .select("id, ended_at")
    .eq("id", sessionId)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!session || session.ended_at) return null;

  // All active group players
  const { data: groupPlayers } = await supabase
    .from("players")
    .select("id, display_name, code")
    .eq("group_id", group.id)
    .eq("is_active", true);

  // Current session attendee IDs
  const { data: attendees } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId);

  const attendeeIds = new Set((attendees ?? []).map((a) => a.player_id));

  // Recency data — sort recently-active players to the top
  const { data: ratings } = await supabase
    .from("player_ratings")
    .select("player_id, last_played_at")
    .eq("group_id", group.id);

  const lastPlayed = new Map(
    (ratings ?? []).map((r) => [r.player_id, r.last_played_at as string | null])
  );

  // Available = active group members not yet in session, sorted by recency
  const available = ((groupPlayers ?? []) as Player[])
    .filter((p) => !attendeeIds.has(p.id))
    .sort((a, b) => {
      const da = lastPlayed.get(a.id);
      const db = lastPlayed.get(b.id);
      if (!da && !db) return 0;
      if (!da) return 1;  // never played → bottom
      if (!db) return -1;
      return new Date(db).getTime() - new Date(da).getTime(); // most recent first
    });

  return { group, available };
}

export default async function SessionPlayersPage({ params, searchParams }: PageProps) {
  const { join_code, session_id } = await params;
  const { selected } = await searchParams;

  const data = await getData(join_code, session_id);
  if (!data) notFound();

  const { group, available } = data;

  const sportConfig = getSportConfig(group.sport as Sport);
  const totalNeeded = sportConfig.playersPerTeam * 2;
  const currentSelected = Math.min(parseInt(selected ?? "0", 10) || 0, totalNeeded);
  const slotsNeeded = Math.max(0, totalNeeded - currentSelected);

  const sessionUrl = `/g/${group.join_code}/session/${session_id}`;

  // After creating a new player: enroll in this session and jump straight
  // back to the Quick Game screen — the picker is skipped entirely.
  const newPlayerUrl =
    `/g/${group.join_code}/players/new` +
    `?sessionId=${session_id}` +
    `&returnTo=${encodeURIComponent(`/g/${group.join_code}/session/${session_id}/players`)}`;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">

        {/* Back link — instant, no confirmation */}
        <Link
          href={sessionUrl}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back to session
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Add players</h1>
          <p className="text-sm text-gray-500 mt-1">
            {slotsNeeded > 0
              ? `Need ${slotsNeeded} more to start — select from your group`
              : "Select players to add to this session"}
          </p>
        </div>

        <SessionPlayerPicker
          sessionId={session_id}
          joinCode={group.join_code}
          availablePlayers={available}
          newPlayerUrl={newPlayerUrl}
          slotsNeeded={slotsNeeded}
        />

      </div>
    </div>
  );
}
