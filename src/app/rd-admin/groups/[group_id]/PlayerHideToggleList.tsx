"use client";

import { useState, useTransition } from "react";
import { togglePlayerHiddenAction } from "@/app/actions/admin";

interface PlayerRow {
  id: string;
  display_name: string;
  code: string;
  hidden: boolean;
}

export default function PlayerHideToggleList({ players }: { players: PlayerRow[] }) {
  // Optimistic local copy — server action is the source of truth on error.
  const [rows, setRows] = useState(players);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function handleToggle(player: PlayerRow) {
    const nextHidden = !player.hidden;
    setPendingId(player.id);
    setError("");
    setRows((prev) => prev.map((p) => (p.id === player.id ? { ...p, hidden: nextHidden } : p)));

    startTransition(async () => {
      const result = await togglePlayerHiddenAction(player.id, nextHidden);
      if ("error" in result) {
        // Roll back on failure
        setRows((prev) => prev.map((p) => (p.id === player.id ? { ...p, hidden: player.hidden } : p)));
        setError(result.error);
      }
      setPendingId(null);
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">No players in this group.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((player) => (
        <div
          key={player.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{player.display_name}</p>
            <p className="text-xs font-mono text-gray-400">{player.code}</p>
          </div>
          <button
            type="button"
            onClick={() => handleToggle(player)}
            disabled={pendingId === player.id}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
              player.hidden
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {pendingId === player.id ? "…" : player.hidden ? "Hidden" : "Visible"}
          </button>
        </div>
      ))}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
