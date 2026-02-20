import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Session History — Server Component.
 * Shows all sessions for the group, ordered by started_at descending.
 * Active sessions shown with a green badge.
 * SPEC §8.2 screen: "Session History (list of past sessions)"
 */

interface PageProps {
  params: Promise<{ join_code: string }>;
}

interface Session {
  id: string;
  name: string;
  session_date: string;
  started_at: string;
  ended_at: string | null;
  closed_reason: string | null;
}

function isActive(session: Session): boolean {
  if (session.ended_at) return false;
  const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
  return new Date(session.started_at).getTime() > fourHoursAgo;
}

function formatDate(dateStr: string): string {
  // session_date is a plain date string "YYYY-MM-DD"
  const [year, month, day] = dateStr.split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function getGroupAndSessions(joinCode: string) {
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

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, session_date, started_at, ended_at, closed_reason")
    .eq("group_id", group.id)
    .order("started_at", { ascending: false });

  return { group, sessions: (sessions ?? []) as Session[] };
}

export default async function SessionHistoryPage({ params }: PageProps) {
  const { join_code } = await params;
  const result = await getGroupAndSessions(join_code);

  if (!result) notFound();

  const { group, sessions } = result;

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
          <h1 className="mt-3 text-2xl font-bold">Session History</h1>
          <p className="mt-1 text-sm text-gray-500">
            {sessions.length === 0
              ? "No sessions yet."
              : `${sessions.length} session${sessions.length === 1 ? "" : "s"} total`}
          </p>
        </div>

        {/* Session list */}
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500 text-sm">No sessions recorded yet.</p>
            <Link
              href={`/g/${group.join_code}/start`}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Start First Session
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const active = isActive(session);
              return (
                <Link
                  key={session.id}
                  href={`/g/${group.join_code}/session/${session.id}`}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[72px]"
                >
                  {/* Status dot */}
                  <div className="mt-0.5 flex-shrink-0">
                    {active ? (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-green-500" />
                    ) : (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-gray-300" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {active && (
                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                          Active
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {formatDate(session.session_date)}
                      </span>
                    </div>
                    <p className="text-sm font-mono text-gray-900 truncate leading-snug">
                      {session.name}
                    </p>
                    {!active && session.closed_reason && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Ended · {session.closed_reason}
                      </p>
                    )}
                  </div>

                  {/* Chevron */}
                  <span className="text-gray-300 self-center text-lg leading-none">
                    ›
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
