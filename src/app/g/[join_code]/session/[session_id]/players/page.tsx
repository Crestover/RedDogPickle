import { getServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Player } from "@/lib/types";
import SessionPlayerPicker from "./SessionPlayerPicker";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
}

async function getData(joinCode: string, sessionId: string) {
  const supabase = getServerClient();

  // Fetch group
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  // Fetch session — must belong to this group and still be active
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
    .eq("is_active", true)
    .order("display_name");

  // Current session attendee IDs
  const { data: attendees } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId);

  const attendeeIds = new Set((attendees ?? []).map((a) => a.player_id));

  // Available = in group but not yet attending the session
  const available = ((groupPlayers ?? []) as Player[]).filter(
    (p) => !attendeeIds.has(p.id)
  );

  return { group, available };
}

export default async function SessionPlayersPage({ params }: PageProps) {
  const { join_code, session_id } = await params;
  const data = await getData(join_code, session_id);

  if (!data) notFound();

  const { group, available } = data;

  const sessionUrl = `/g/${group.join_code}/session/${session_id}`;

  // After creating a new player: enroll in session + return straight to session
  const newPlayerUrl =
    `/g/${group.join_code}/players/new` +
    `?sessionId=${session_id}` +
    `&returnTo=${encodeURIComponent(`/g/${group.join_code}/session/${session_id}/players`)}`;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">

        {/* Back link */}
        <Link
          href={sessionUrl}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back to session
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Add players to session</h1>
          <p className="text-sm text-gray-500 mt-1">
            Select from your group, or create a new player below.
          </p>
        </div>

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
