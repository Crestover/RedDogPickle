import { getServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import AddPlayerForm from "./AddPlayerForm";

interface PageProps {
  params: Promise<{ join_code: string }>;
  searchParams: Promise<{ from?: string; returnTo?: string }>;
}

async function getGroup(joinCode: string) {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("groups")
    .select("id, name, join_code")
    .eq("join_code", joinCode.toLowerCase())
    .maybeSingle();
  return data;
}

export default async function AddPlayerPage({ params, searchParams }: PageProps) {
  const { join_code } = await params;
  const { from, returnTo } = await searchParams;

  const group = await getGroup(join_code);
  if (!group) notFound();

  // Where to go back / redirect after save.
  // Priority: ?returnTo (full relative path) → ?from enum → group dashboard.
  // safeRedirect in addPlayerAction sanitises the path (must start with /).
  const isSafeReturnTo =
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//");

  const backHref = isSafeReturnTo
    ? returnTo
    : from === "start"
    ? `/g/${group.join_code}/start`
    : `/g/${group.join_code}`;

  const redirectTo = backHref;

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href={backHref}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← {isSafeReturnTo ? "Back to Session" : from === "start" ? "Back to Start Session" : group.name}
          </Link>
          <h1 className="mt-3 text-2xl font-bold">Add Player</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create a new player for <span className="font-semibold">{group.name}</span>.
          </p>
        </div>

        <AddPlayerForm
          groupId={group.id}
          joinCode={group.join_code}
          redirectTo={redirectTo}
        />
      </div>
    </div>
  );
}
