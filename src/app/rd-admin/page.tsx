import { requireAdminSession } from "@/lib/admin/auth";
import { getAdminServerClient } from "@/lib/supabase/adminServer";
import { getSportConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";
import { formatDate } from "@/lib/datetime";
import { ADMIN_BASE_PATH } from "@/lib/admin/constants";
import Link from "next/link";
import CreateGroupForm from "./CreateGroupForm";
import LogoutButton from "./LogoutButton";

interface GroupRow {
  id: string;
  name: string;
  join_code: string;
  sport: Sport;
  created_at: string;
}

async function getGroupsWithStats() {
  const supabase = getAdminServerClient();

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, join_code, sport, created_at")
    .order("created_at", { ascending: false });

  const groupRows = (groups ?? []) as GroupRow[];
  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((g) => g.id);

  const [{ data: sessions }, { data: players }] = await Promise.all([
    supabase.from("sessions").select("group_id, started_at").in("group_id", groupIds),
    supabase.from("players").select("group_id").in("group_id", groupIds),
  ]);

  const sessionStats = new Map<string, { count: number; lastStartedAt: string | null }>();
  for (const row of sessions ?? []) {
    const entry = sessionStats.get(row.group_id) ?? { count: 0, lastStartedAt: null };
    entry.count += 1;
    if (!entry.lastStartedAt || row.started_at > entry.lastStartedAt) {
      entry.lastStartedAt = row.started_at;
    }
    sessionStats.set(row.group_id, entry);
  }

  const playerCounts = new Map<string, number>();
  for (const row of players ?? []) {
    playerCounts.set(row.group_id, (playerCounts.get(row.group_id) ?? 0) + 1);
  }

  return groupRows.map((group) => ({
    ...group,
    sessionCount: sessionStats.get(group.id)?.count ?? 0,
    lastSessionAt: sessionStats.get(group.id)?.lastStartedAt ?? null,
    playerCount: playerCounts.get(group.id) ?? 0,
  }));
}

export default async function AdminHomePage() {
  await requireAdminSession();
  const groups = await getGroupsWithStats();

  return (
    <div className="flex flex-col px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
            <p className="text-sm text-gray-500 mt-1">{groups.length} total</p>
          </div>
          <LogoutButton />
        </div>

        {/* Create group */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Create a new group</h2>
          <CreateGroupForm />
        </div>

        {/* Group list */}
        <div className="space-y-2 pt-4 border-t border-gray-200">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400">No groups yet.</p>
          ) : (
            groups.map((group) => {
              const sportConfig = getSportConfig(group.sport);
              return (
                <Link
                  key={group.id}
                  href={`${ADMIN_BASE_PATH}/groups/${group.id}`}
                  className="block rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{group.name}</p>
                      <p className="text-xs font-mono text-gray-400">{group.join_code}</p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        group.sport === "padel"
                          ? "bg-violet-100 text-violet-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {sportConfig.displayName}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                    <span>{group.playerCount} player{group.playerCount === 1 ? "" : "s"}</span>
                    <span>{group.sessionCount} session{group.sessionCount === 1 ? "" : "s"}</span>
                    <span>
                      Last: {group.lastSessionAt ? formatDate(group.lastSessionAt) : "never"}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
