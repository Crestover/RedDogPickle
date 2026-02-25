import { getServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * View-Only Dashboard — Server Component.
 *
 * Read-only mirror of /g/[join_code]/page.tsx.
 * Resolves group by view_code. Shows leaderboard + session links only.
 * No write components, no write actions, no session start/end.
 */

interface PageProps {
  params: Promise<{ view_code: string }>;
}

interface ActiveSession {
  id: string;
  name: string;
  started_at: string;
}

async function getGroupByViewCode(viewCode: string) {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, view_code")
    .eq("view_code", viewCode.toLowerCase())
    .maybeSingle();

  if (!group) return null;

  // Active session: ended_at IS NULL
  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, started_at")
    .eq("group_id", group.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { group, activeSession: (session ?? null) as ActiveSession | null };
}

export default async function ViewDashboardPage({ params }: PageProps) {
  const { view_code } = await params;
  const result = await getGroupByViewCode(view_code);

  if (!result) notFound();

  const { group, activeSession } = result;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <img
              src="/PlayRedDog_Logo_Horizontal_Transparent_125px.png"
              alt="Red Dog"
              width={125}
            />
          </h1>
          <p className="text-sm text-gray-500 mt-1 tracking-wide">
            Statistically unnecessary. Socially unavoidable.
          </p>
          <p className="text-sm font-semibold text-gray-700 mt-4">{group.name || "Red Dog Group"}</p>
          <p className="text-xs text-gray-400 mt-1">View-only link</p>
        </div>

        {/* Active session banner (read-only) */}
        {activeSession && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-700 mb-0.5">
              Active Session
            </p>
            <p className="text-sm font-mono text-green-900 truncate">
              {activeSession.name}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="space-y-3">
          {activeSession && (
            <Link
              href={`/v/${group.view_code}/session/${activeSession.id}`}
              className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px]"
            >
              View Session
            </Link>
          )}
          <Link
            href={`/v/${group.view_code}/leaderboard`}
            className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px]"
          >
            📊 Leaderboard
          </Link>
        </div>

        {/* Secondary nav */}
        <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr; Home
          </Link>
          <Link
            href={`/v/${group.view_code}/sessions`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Session history &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
