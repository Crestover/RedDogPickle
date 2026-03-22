"use client";

/**
 * SessionPlayerPicker — Add players to a live session
 *
 * Shows group players who aren't yet attending the current session.
 * Multi-select: tap to toggle, then "Add N players" to enroll them.
 * Also exposes a "+ New player" escape hatch that creates the player
 * AND enrolls them in the session in one action.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addPlayersToSessionAction } from "@/app/actions/sessions";
import type { Player } from "@/lib/types";

interface Props {
  sessionId: string;
  joinCode: string;
  availablePlayers: Player[];
  newPlayerUrl: string;
}

export default function SessionPlayerPicker({
  sessionId,
  joinCode,
  availablePlayers,
  newPlayerUrl,
}: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const sessionUrl = `/g/${joinCode}/session/${sessionId}`;

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    if (error) setError("");
  }

  function handleAddPlayers() {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const result = await addPlayersToSessionAction(
        "full",
        sessionId,
        joinCode,
        selectedIds
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(sessionUrl);
    });
  }

  const ctaLabel = isPending
    ? "Adding\u2026"
    : selectedIds.length === 0
    ? "Select players"
    : `Add ${selectedIds.length} player${selectedIds.length !== 1 ? "s" : ""}`;

  return (
    <div className="space-y-4">

      {/* ── Available players ────────────────────────────────────── */}
      {availablePlayers.length > 0 ? (
        <div className="space-y-2">
          {availablePlayers.map((player) => {
            const isSelected = selectedIds.includes(player.id);
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => toggleSelected(player.id)}
                disabled={isPending}
                className={`flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left transition-colors min-h-[64px] ${
                  isSelected
                    ? "bg-green-600 text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 active:bg-gray-100"
                } disabled:opacity-50`}
              >
                {/* Checkmark circle */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current text-sm font-bold">
                  {isSelected ? "\u2713" : ""}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold leading-tight truncate">
                    {player.display_name}
                  </span>
                  <span className="block text-xs opacity-70 font-mono mt-0.5">
                    {player.code}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">
          Everyone in this group is already in the session.
        </div>
      )}

      {/* ── Create new player escape hatch ───────────────────────── */}
      <Link
        href={newPlayerUrl}
        className="block text-sm font-medium text-green-700 hover:text-green-800 transition-colors"
      >
        + New player
      </Link>

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 font-medium rounded-lg bg-red-50 px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {/* ── Primary CTA ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleAddPlayers}
        disabled={selectedIds.length === 0 || isPending}
        className="w-full py-4 rounded-xl bg-black text-white text-lg font-semibold shadow-sm transition-opacity disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
