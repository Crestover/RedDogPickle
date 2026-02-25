import { getServerClient } from "@/lib/supabase/server";
import { formatDateString } from "@/lib/datetime";
import type { Session } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * View-Only Session History — Server Component.
 *
 * Read-only mirror of /g/[join_code]/sessions/page.tsx.
 * Resolves group by view_code. No "Start First Session" CTA.
 */

interface PageProps {
  params: Promise<{ view_code: string }>;
}

function isActive(session: Session): boolean {
  return !session.ended_at;
}

async function getGroupAndSessions(viewCode: string) {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, view_code")
    .eq("view_code", viewCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, session_date, started_at, ended_at, closed_reason")
    .eq("group_id", group.id)
    .order("started_at", { ascending: false });

  return { group, sessions: (sessions ?? []) as Session[] };
}

export default async function ViewSessionHistoryPage({ params }: PageProps) {
  const { view_code } = await params;
  const result = await getGroupAndSessions(view_code);

  if (!result) notFound();

  const { group, sessions } = result;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href={`/v/${group.view_code}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr; {group.name}
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
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const active = isActive(session);
              return (
                <Link
                  key={session.id}
                  href={`/v/${group.view_code}/session/${session.id}`}
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
                        {formatDateString(session.session_date)}
                      </span>
                    </div>
                    <p className="text-sm font-mono text-gray-900 truncate leading-snug">
                      {session.name}
                    </p>
                    {!active && session.closed_reason && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Ended &middot; {session.closed_reason}
                      </p>
                    )}
                  </div>

                  {/* Chevron */}
                  <span className="text-gray-300 self-center text-lg leading-none">
                    &rsaquo;
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
