"use client";

import { useState, useTransition, useMemo } from "react";
import { createSessionAction } from "@/app/actions/sessions";

interface Player {
  id: string;
  display_name: string;
  code: string;
}

interface Props {
  joinCode: string;
  players: Player[];
}

export default function StartSessionForm({ joinCode, players }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
    );
  }, [players, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (error) setError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size < 4) {
      setError(`Select at least 4 players (${selected.size} selected).`);
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createSessionAction(joinCode, Array.from(selected));
      if (result?.error) setError(result.error);
      // On success the action redirects — no client-side handling needed.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Search */}
      <input
        type="search"
        placeholder="Search players…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {/* Selected count */}
      <p className="text-sm text-gray-500">
        <span
          className={
            selected.size >= 4 ? "font-semibold text-green-700" : "font-semibold text-gray-700"
          }
        >
          {selected.size} selected
        </span>{" "}
        — need at least 4
      </p>

      {/* Player grid */}
      <div className="space-y-2">
        {filtered.map((player) => {
          const isSelected = selected.has(player.id);
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => toggle(player.id)}
              className={`flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left transition-colors min-h-[64px] ${
                isSelected
                  ? "bg-green-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50"
              }`}
            >
              {/* Checkmark */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current text-sm font-bold">
                {isSelected ? "✓" : ""}
              </span>
              <span className="flex-1">
                <span className="block font-semibold leading-tight">
                  {player.display_name}
                </span>
                <span className="block text-xs opacity-70 font-mono mt-0.5">
                  {player.code}
                </span>
              </span>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-6">
            No players match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending || selected.size < 4}
        className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors min-h-[64px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Starting…" : `Start Session (${selected.size} players)`}
      </button>
    </form>
  );
}
