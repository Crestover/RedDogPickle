"use client";

import { useState, useTransition, useMemo } from "react";
import { createSessionAction, endAndCreateSessionAction } from "@/app/actions/sessions";
import { formatTime, formatDate } from "@/lib/datetime";
import type { Player } from "@/lib/types";

interface ActiveSession {
  id: string;
  name: string;
  started_at: string;
}

interface Props {
  joinCode: string;
  players: Player[];
  activeSessions: ActiveSession[];
}

export default function StartSessionForm({ joinCode, players, activeSessions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);

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

    // If active sessions exist, show confirmation modal instead of creating immediately
    if (activeSessions.length > 0) {
      setShowModal(true);
      return;
    }

    // No active sessions — create immediately
    doCreateSession();
  }

  function doCreateSession() {
    startTransition(async () => {
      const result = await createSessionAction("full", joinCode, Array.from(selected));
      if (result?.error) setError(result.error);
      // On success the action redirects — no client-side handling needed.
    });
  }

  function handleEndAndStartNew() {
    const target = activeSessions[0]; // Newest by started_at (already sorted DESC)
    setShowModal(false);
    startTransition(async () => {
      const result = await endAndCreateSessionAction(
        "full",
        target.id,
        joinCode,
        Array.from(selected)
      );
      if (result?.error) setError(result.error);
      // On success the action redirects to the new session
    });
  }

  function handleStartWithoutEnding() {
    setShowModal(false);
    doCreateSession();
  }

  // Format started_at for display in modal
  const targetSession = activeSessions[0];
  const targetStartedLabel = targetSession
    ? formatTime(targetSession.started_at)
    : "";
  const targetDateLabel = targetSession
    ? formatDate(targetSession.started_at, { year: undefined, month: "short", day: "numeric" })
    : "";

  return (
    <>
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

      {/* ── Confirmation Modal ── */}
      {showModal && targetSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              End the current session and start a new one?
            </h2>

            {/* Show which session will be ended */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                Active Session
              </p>
              <p className="text-sm font-mono text-gray-900 truncate">
                {targetSession.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Started {targetDateLabel} at {targetStartedLabel}
              </p>
            </div>

            <div className="space-y-2">
              {/* End & Start New */}
              <button
                type="button"
                onClick={handleEndAndStartNew}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-4 text-base font-semibold text-white shadow-sm hover:bg-red-700 active:bg-red-800 transition-colors min-h-[56px] disabled:opacity-50"
              >
                {isPending ? "Working…" : "End & Start New"}
              </button>

              {/* Start New Without Ending */}
              <button
                type="button"
                onClick={handleStartWithoutEnding}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px] disabled:opacity-50"
              >
                {isPending ? "Working…" : "Start New Without Ending"}
              </button>

              {/* Cancel */}
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            {/* Error inside modal */}
            {error && (
              <p className="text-sm text-red-600 font-medium" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
