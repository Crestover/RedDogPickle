import { getServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { PlayerOption } from "@/lib/components/PlayerPicker";
import SessionPlayerPicker from "./SessionPlayerPicker";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
}

async function getData(joinCode: string, sessionId: string) {
  const supabase = getServerClient();

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

  // Recency data — most recently active players float to the top
  const { data: ratings } = await supabase
    .from("player_ratings")
    .select("player_id, last_played_at")
    .eq("group_id", group.id);

  const lastPlayed = new Map(
    (ratings ?? []).map((r) => [r.player_id, r.last_played_at as string | null])
  );

  // Available = in group, not yet in session, sorted most-recent-first
  const available: PlayerOption[] = ((groupPlayers ?? []) as { id: string; display_name: string; code: string }[])
    .filter((p) => !attendeeIds.has(p.id))
    .sort((a, b) => {
      const da = lastPlayed.get(a.id);
      const db = lastPlayed.get(b.id);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(db).getTime() - new Date(da).getTime();
    })
    .map((p) => ({ id: p.id, name: p.display_name, initials: p.code }));

  return { group, available };
}

export default async function SessionPlayersPage({ params }: PageProps) {
  const { join_code, session_id } = await params;

  const data = await getData(join_code, session_id);
  if (!data) notFound();

  const { group, available } = data;

  // After creating a new player: enroll in session + jump straight to session
  const newPlayerUrl =
    `/g/${group.join_code}/players/new` +
    `?sessionId=${session_id}` +
    `&returnTo=${encodeURIComponent(`/g/${group.join_code}/session/${session_id}/players`)}`;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto">
        <SessionPlayerPicker
          sessionId={session_id}
          joinCode={group.join_code}
          availablePlayers={available}
          newPlayerUrl={newPlayerUrl}
        />
      </div>
    </div>
  );
}
