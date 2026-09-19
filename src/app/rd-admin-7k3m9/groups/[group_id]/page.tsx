import { requireAdminSession } from "@/lib/admin/auth";
import { getAdminServerClient } from "@/lib/supabase/adminServer";
import { getSportConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";
import { notFound } from "next/navigation";
import Link from "next/link";
import PlayerHideToggleList from "./PlayerHideToggleList";

interface PageProps {
  params: Promise<{ group_id: string }>;
}

export default async function AdminGroupPage({ params }: PageProps) {
  await requireAdminSession();
  const { group_id } = await params;

  const supabase = getAdminServerClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, sport")
    .eq("id", group_id)
    .maybeSingle();

  if (!group) notFound();

  const { data: players } = await supabase
    .from("players")
    .select("id, display_name, code, hidden")
    .eq("group_id", group_id)
    .order("display_name", { ascending: true });

  const sportConfig = getSportConfig(group.sport as Sport);

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <Link href="/rd-admin-7k3m9" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          &larr; All groups
        </Link>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{group.name}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                group.sport === "padel" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {sportConfig.displayName}
            </span>
          </div>
          <p className="text-xs font-mono text-gray-400 mt-0.5">{group.join_code}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Players
            <span className="ml-2 text-xs font-normal text-gray-400">
              Hidden players still play normally — they&apos;re just excluded from leaderboards.
            </span>
          </h2>
          <PlayerHideToggleList players={players ?? []} />
        </div>
      </div>
    </div>
  );
}
