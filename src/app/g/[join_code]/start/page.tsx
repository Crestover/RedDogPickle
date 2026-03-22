import { getServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import StartSessionForm from "./StartSessionForm";

interface PageProps {
  params: Promise<{ join_code: string }>;
}

async function getGroupWithPlayers(joinCode: string) {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  const { data: players } = await supabase
    .from("players")
    .select("id, display_name, code")
    .eq("group_id", group.id)
    .eq("is_active", true)
    .order("display_name");

  const { data: activeSessions } = await supabase
    .from("sessions")
    .select("id, name, started_at")
    .eq("group_id", group.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false });

  return {
    group,
    players: players ?? [],
    activeSessions: (activeSessions ?? []) as { id: string; name: string; started_at: string }[],
  };
}

export default async function StartSessionPage({ params }: PageProps) {
  const { join_code } = await params;
  const result = await getGroupWithPlayers(join_code);

  if (!result) notFound();

  const { group, players, activeSessions } = result;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto">
        <StartSessionForm
          groupName={group.name}
          joinCode={group.join_code}
          players={players}
          activeSessions={activeSessions}
        />
      </div>
    </div>
  );
}
