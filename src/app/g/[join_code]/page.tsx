import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

/**
 * Server Component — fetches the group on the server using the anon key.
 * No client JS needed for the data fetch; keeps the page fast on mobile.
 */

interface PageProps {
  params: Promise<{ join_code: string }>;
}

async function getGroup(joinCode: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, join_code")
    // join_code is stored lowercase in the DB (see schema constraint).
    // Lowercase the param here to match, per docs/decisions.md D-011.
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[getGroup] Supabase error:", error.message);
    return null;
  }
  return data;
}

export default async function GroupPage({ params }: PageProps) {
  const { join_code } = await params;
  const group = await getGroup(join_code);

  // ── Not Found ──────────────────────────────────────────────────────────
  if (!group) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-5xl">❓</div>
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
            ← Try a different code
          </Link>
        </div>
      </main>
    );
  }

  // ── Found ──────────────────────────────────────────────────────────────
  // TODO (Milestone 2): Detect active session here and swap primary button
  // to "Continue Session" when one exists. See docs/decisions.md D-TODO-M2.
  return (
    <main className="flex min-h-screen flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-8">

        {/* Header */}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">
            Group
          </p>
          <h1 className="text-3xl font-bold leading-tight">{group.name}</h1>
          <p className="mt-1 text-sm text-gray-400 font-mono">{group.join_code}</p>
        </div>

        {/* State-aware action panel */}
        {/* Milestone 1: always shows "no active session" state */}
        <div className="space-y-3">
          {/* Primary action */}
          <button
            disabled
            className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm opacity-60 cursor-not-allowed min-h-[64px]"
            title="Coming in Milestone 2"
          >
            🏓 Start Session
          </button>

          {/* Secondary action */}
          <button
            disabled
            className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm opacity-60 cursor-not-allowed min-h-[56px]"
            title="Coming in Milestone 5"
          >
            📊 Leaderboard
          </button>
        </div>

        {/* Coming-soon notice */}
        <p className="text-center text-xs text-gray-400">
          Session &amp; game recording coming soon.
        </p>

        {/* Back link */}
        <div className="pt-4 border-t border-gray-200">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Change group
          </Link>
        </div>
      </div>
    </main>
  );
}
