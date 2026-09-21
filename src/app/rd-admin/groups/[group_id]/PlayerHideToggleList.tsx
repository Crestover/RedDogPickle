"use client";

import { useState, useTransition } from "react";
import { togglePlayerHiddenAction, updatePlayerAction } from "@/app/actions/admin";

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

  // Edit mode — only one row at a time. Draft fields are separate from `rows`
  // so a failed save doesn't clobber the last-known-good display values.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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

  function startEdit(player: PlayerRow) {
    setEditingId(player.id);
    setDraftName(player.display_name);
    setDraftCode(player.code);
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  function saveEdit(playerId: string) {
    if (!draftName.trim()) {
      setEditError("Name is required.");
      return;
    }
    if (!draftCode.trim()) {
      setEditError("Code is required.");
      return;
    }
    setIsSaving(true);
    setEditError("");

    startTransition(async () => {
      const result = await updatePlayerAction(playerId, draftName, draftCode);
      setIsSaving(false);
      if ("error" in result) {
        setEditError(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, display_name: result.displayName, code: result.code } : p
        )
      );
      setEditingId(null);
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">No players in this group.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((player) => {
        const isEditing = editingId === player.id;
        return (
          <div key={player.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            {isEditing ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    disabled={isSaving}
                    placeholder="Name"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={draftCode}
                    onChange={(e) => setDraftCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    disabled={isSaving}
                    placeholder="Code"
                    maxLength={6}
                    className="w-20 shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                  />
                </div>
                {editError && (
                  <p className="text-sm text-red-600" role="alert">
                    {editError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={isSaving}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit(player.id)}
                    disabled={isSaving}
                    className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{player.display_name}</p>
                  <p className="text-xs font-mono text-gray-400">{player.code}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(player)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(player)}
                    disabled={pendingId === player.id}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      player.hidden
                        ? "bg-gray-900 text-white hover:bg-gray-800"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {pendingId === player.id ? "…" : player.hidden ? "Hidden" : "Visible"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
