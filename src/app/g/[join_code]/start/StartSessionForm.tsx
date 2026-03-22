"use client";

/**
 * StartSessionForm — wrapper around PlayerPicker for the "start session" flow.
 *
 * Responsible for:
 *   - Mapping Player[] → PlayerOption[] for PlayerPicker
 *   - Providing the onSubmit callback (create session, or show modal if one exists)
 *   - The existing-session confirmation modal (end vs. keep running)
 *
 * All player-selection UI is delegated to PlayerPicker.
 */

import { useState, useTransition } from "react";
import { createSessionAction, endAndCreateSessionAction } from "@/app/actions/sessions";
import { formatTime, formatDate } from "@/lib/datetime";
import type { Player } from "@/lib/types";
import PlayerPicker, { type PlayerOption } from "@/lib/components/PlayerPicker";

interface ActiveSession {
  id: string;
  name: string;
  started_at: string;
}

interface Props {
  groupName: string;
  joinCode: string;
  players: Player[];
  activeSessions: ActiveSession[];
}

export default function StartSessionForm({
  groupName,
  joinCode,
  players,
  activeSessions,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [modalError, setModalError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingPlayerIds, setPendingPlayerIds] = useState<string[]>([]);

  const targetSession = activeSessions[0];

  // ── Map players to the shape PlayerPicker expects ──────────────────────────
  const playerOptions: PlayerOption[] = players.map((p) => ({
    id: p.id,
    name: p.display_name,
    initials: p.code,
  }));

  // ── onSubmit callback ──────────────────────────────────────────────────────
  async function handleStartSession(selectedIds: string[]) {
    if (activeSessions.length > 0) {
      // Store the selection and hand off to the modal — return immediately so
      // PlayerPicker's isSubmitting resets and the modal can take over.
      setPendingPlayerIds(selectedIds);
      setShowModal(true);
      return;
    }

    // No active session — create directly. Throws on error so PlayerPicker
    // can catch and display it.
    const result = await createSessionAction("full", joinCode, selectedIds);
    if (result?.error) throw new Error(result.error);
    // On success: server redirects — component unmounts naturally.
  }

  // ── Modal actions ──────────────────────────────────────────────────────────
  function handleEndAndStartNew() {
    setModalError("");
    startTransition(async () => {
      const result = await endAndCreateSessionAction(
        "full",
        targetSession.id,
        joinCode,
        pendingPlayerIds
      );
      if (result?.error) setModalError(result.error);
    });
  }

  function handleStartWithoutEnding() {
    setModalError("");
    startTransition(async () => {
      const result = await createSessionAction("full", joinCode, pendingPlayerIds);
      if (result?.error) setModalError(result.error);
    });
  }

  const targetStartedLabel = targetSession ? formatTime(targetSession.started_at) : "";
  const targetDateLabel = targetSession
    ? formatDate(targetSession.started_at, { year: undefined, month: "short", day: "numeric" })
    : "";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <PlayerPicker
        mode="start-session"
        players={playerOptions}
        minRequired={4}
        title="Start Session"
        subtitle={`Select players who are here today. You need at least 4.`}
        addNewHref={`/g/${joinCode}/players/new?from=start`}
        onCancelHref={`/g/${joinCode}`}
        backLabel={groupName}
        onSubmit={handleStartSession}
        emptyStateTitle="No players yet"
        emptyStateBody="Add a new player above, then come back to start a session."
      />

      {/* ── Existing-session confirmation modal ── */}
      {showModal && targetSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              End the current session and start a new one?
            </h2>

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
              <button
                type="button"
                onClick={handleEndAndStartNew}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-4 text-base font-semibold text-white shadow-sm hover:bg-red-700 active:bg-red-800 transition-colors min-h-[56px] disabled:opacity-50"
              >
                {isPending ? "Working\u2026" : "End & Start New"}
              </button>

              <button
                type="button"
                onClick={handleStartWithoutEnding}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px] disabled:opacity-50"
              >
                {isPending ? "Working\u2026" : "Start New Without Ending"}
              </button>

              <button
                type="button"
                onClick={() => { setShowModal(false); setModalError(""); }}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            {modalError && (
              <p className="text-sm text-red-600 font-medium" role="alert">
                {modalError}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
