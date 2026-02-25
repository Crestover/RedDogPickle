import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import { redirect } from "next/navigation";
import Link from "next/link";
import CopyViewLink from "./CopyViewLink";

/**
 * Group dashboard — Server Component.
 *
 * Active session definition:
 *   ended_at IS NULL (no time-based expiry).
 *
 * The most recently started active session is shown with "Continue Session".
 * When none exists, "Start Session" is the primary action.
 *
 * View-code auto-generation:
 *   On load, if group.view_code is null, calls ensure_view_code RPC to
 *   lazily generate the view-only code. Idempotent — only writes once.
 *
 * View-code redirect fallback:
 *   When join_code lookup fails, checks if the entered code is a view_code
 *   and redirects to /v/{view_code} if found.
 */

interface PageProps {
  params: Promise<{ join_code: string }>;
}

interface ActiveSession {
  id: string;
  name: string;
  started_at: string;
}

async function getGroupAndActiveSession(joinCode: string): Promise<{
  group: { id: string; name: string; join_code: string; view_code: string | null } | null;
  activeSession: ActiveSession | null;
}> {
  const supabase = getServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, view_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (!group) return { group: null, activeSession: null };

  // Lazily generate view_code if missing
  if (!group.view_code) {
    const { data: vc } = await supabase.rpc(RPC.ENSURE_VIEW_CODE, {
      p_join_code: group.join_code,
    });
    if (vc) group.view_code = vc as string;
  }

  // Active session: ended_at IS NULL (no time-based expiry)
  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, started_at")
    .eq("group_id", group.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { group, activeSession: session ?? null };
}

export default async function GroupPage({ params }: PageProps) {
  const { join_code } = await params;
  const { group, activeSession } = await getGroupAndActiveSession(join_code);

  // ── Not Found — check if it's a view_code ───────────────────────────────
  if (!group) {
    const supabase = getServerClient();
    const lowerCode = join_code.toLowerCase();
    const { data: viewGroup } = await supabase
      .from("groups")
      .select("view_code")
      .eq("view_code", lowerCode)
      .maybeSingle();

    if (viewGroup) {
      redirect(`/v/${lowerCode}`);
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-5xl">&#x2753;</div>
          <div>
            <h1 className="text-2xl font-bold">Group not found</h1>
            <p className="mt-2 text-gray-500 text-sm">
              <span className="font-mono bg-gray-100 px-1 rounded">
                {join_code}
              </span>{" "}
              doesn&apos;t match any group. Check the code and try again.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px] w-full"
          >
            &larr; Try a different code
          </Link>
        </div>
      </div>
    );
  }

  // ── Found ──────────────────────────────────────────────────────────────
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
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mt-4 mb-1">
            Group
          </p>
          <p className="text-sm text-gray-400 font-mono">{group.join_code}</p>
        </div>

        {/* Active session banner */}
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

        {/* State-aware action panel */}
        <div className="space-y-3">
          {activeSession ? (
            /* ── Active session state ── */
            <>
              <Link
                href={`/g/${group.join_code}/session/${activeSession.id}`}
                className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors min-h-[64px]"
              >
                🏓 Continue Session
              </Link>
              <Link
                href={`/g/${group.join_code}/start`}
                className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px]"
              >
                + New Session
              </Link>
              <Link
                href={`/g/${group.join_code}/leaderboard`}
                className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px]"
              >
                📊 Leaderboard
              </Link>
            </>
          ) : (
            /* ── No active session state ── */
            <>
              <Link
                href={`/g/${group.join_code}/start`}
                className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors min-h-[64px]"
              >
                🏓 Start Session
              </Link>
              <Link
                href={`/g/${group.join_code}/leaderboard`}
                className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px]"
              >
                📊 Leaderboard
              </Link>
            </>
          )}
        </div>

        {/* Secondary nav */}
        <div className="pt-4 border-t border-gray-200 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              &larr; Change group
            </Link>
            <Link
              href={`/g/${group.join_code}/sessions`}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Session history &rarr;
            </Link>
          </div>
          {group.view_code && (
            <CopyViewLink viewCode={group.view_code} />
          )}
        </div>
      </div>
    </div>
  );
}
