import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import EndSessionButton from "./EndSessionButton";

interface PageProps {
  params: Promise<{ join_code: string; session_id: string }>;
}

async function getSessionData(joinCode: string, sessionId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
    .select("id, name, started_at, ended_at, closed_reason")
    .eq("id", sessionId)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!session) return null;

  // Fetch attendees
  const { data: attendees } = await supabase
    .from("session_players")
    .select("player_id, players(id, display_name, code)")
    .eq("session_id", sessionId);

  return { group, session, attendees: attendees ?? [] };
}

function isActiveSession(session: {
  ended_at: string | null;
  started_at: string;
}): boolean {
  if (session.ended_at) return false;
  const startedAt = new Date(session.started_at).getTime();
  const fourHoursMs = 4 * 60 * 60 * 1000;
  return Date.now() - startedAt < fourHoursMs;
}

export default async function SessionPage({ params }: PageProps) {
  const { join_code, session_id } = await params;
  const data = await getSessionData(join_code, session_id);

  if (!data) notFound();

  const { group, session, attendees } = data;
  const active = isActiveSession(session);

  // Format started_at for display
  const startedAt = new Date(session.started_at);
  const startedLabel = startedAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="flex min-h-screen flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Back link */}
        <Link
          href={`/g/${group.join_code}`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← {group.name}
        </Link>

        {/* Session header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            {active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                Ended
              </span>
            )}
            <span className="text-xs text-gray-400">Started {startedLabel}</span>
          </div>
          <h1 className="text-xl font-bold leading-tight font-mono">
            {session.name}
          </h1>
        </div>

        {/* Attendees */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Attendees ({attendees.length})
          </h2>
          <div className="space-y-2">
            {attendees.map((row) => {
              // Supabase join returns players as an object
              const player = Array.isArray(row.players)
                ? row.players[0]
                : row.players;
              if (!player) return null;
              return (
                <div
                  key={row.player_id}
                  className="flex items-center gap-3 rounded-xl bg-white border border-gray-200 px-4 py-3 min-h-[56px]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800 font-mono">
                    {(player as { code: string }).code}
                  </span>
                  <span className="font-medium text-gray-900">
                    {(player as { display_name: string }).display_name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {active ? (
          <div className="space-y-3 pt-2">
            {/* Record Game — deferred to Milestone 4 */}
            <button
              disabled
              className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm opacity-50 cursor-not-allowed min-h-[64px]"
              title="Coming in Milestone 4"
            >
              🏓 Record Game
            </button>

            {/* End Session */}
            <EndSessionButton sessionId={session.id} joinCode={group.join_code} />
          </div>
        ) : (
          <div className="rounded-xl bg-gray-100 px-4 py-4 text-center">
            <p className="text-sm text-gray-600 font-medium">
              This session has ended.
            </p>
            {session.closed_reason && (
              <p className="text-xs text-gray-400 mt-1">
                Reason: {session.closed_reason}
              </p>
            )}
          </div>
        )}

        {/* Coming soon */}
        {active && (
          <p className="text-center text-xs text-gray-400">
            Game recording coming in Milestone 4.
          </p>
        )}
      </div>
    </main>
  );
}
