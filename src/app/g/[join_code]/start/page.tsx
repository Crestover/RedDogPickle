import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import StartSessionForm from "./StartSessionForm";

interface PageProps {
  params: Promise<{ join_code: string }>;
}

async function getGroupWithPlayers(joinCode: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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

  return { group, players: players ?? [] };
}

export default async function StartSessionPage({ params }: PageProps) {
  const { join_code } = await params;
  const result = await getGroupWithPlayers(join_code);

  if (!result) notFound();

  const { group, players } = result;

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
          <h1 className="mt-3 text-2xl font-bold">Start Session</h1>
          <p className="mt-1 text-sm text-gray-500">
            Select players who are here today. You need at least 4.
          </p>
        </div>

        {players.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500 text-sm">No players yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Players will be added in a future update.
            </p>
          </div>
        ) : (
          <StartSessionForm joinCode={group.join_code} players={players} />
        )}
      </div>
    </main>
  );
}
