"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CourtData, AttendeeWithStatus, RpcResult } from "@/lib/types";
import type { PairCountEntry } from "@/lib/autoSuggest";
import VoidLastGameButton from "../VoidLastGameButton";
import {
  suggestCourtsAction,
  startCourtGameAction,
  recordCourtGameAction,
  assignCourtSlotAction,
  clearCourtSlotAction,
  markPlayerOutAction,
  makePlayerActiveAction,
  updateCourtCountAction,
} from "@/app/actions/courts";

// ── Types ─────────────────────────────────────────────────────

interface SwapTarget {
  courtNumber: number;
  team: "A" | "B";
  slot: number; // 1-indexed
}

interface Props {
  sessionId: string;
  joinCode: string;
  attendees: AttendeeWithStatus[];
  courts: CourtData[];
  pairCounts: PairCountEntry[];
  gamesPlayedMap: Record<string, number>;
  ratings: Record<string, { rating: number; provisional: boolean }>;
}

// ── Helpers ───────────────────────────────────────────────────

function getCourtPlayerIds(court: CourtData): string[] {
  const ids: string[] = [];
  if (court.team_a_ids) {
    for (const id of court.team_a_ids) if (id) ids.push(id);
  }
  if (court.team_b_ids) {
    for (const id of court.team_b_ids) if (id) ids.push(id);
  }
  return ids;
}

function getAllCourtPlayerIds(courts: CourtData[]): Set<string> {
  const ids = new Set<string>();
  for (const court of courts) {
    for (const id of getCourtPlayerIds(court)) ids.add(id);
  }
  return ids;
}

function isCourtFull(court: CourtData): boolean {
  if (!court.team_a_ids || !court.team_b_ids) return false;
  return (
    court.team_a_ids.every((id) => id !== null) &&
    court.team_b_ids.every((id) => id !== null)
  );
}

// ── Component ─────────────────────────────────────────────────

export default function CourtsManager({
  sessionId,
  joinCode,
  attendees,
  courts,
  pairCounts,
  gamesPlayedMap,
  ratings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Local UI state (no server state here) ─────────────────
  const [scoreInputs, setScoreInputs] = useState<
    Record<number, { scoreA: string; scoreB: string }>
  >({});
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);
  const [outChoicePlayer, setOutChoicePlayer] = useState<string | null>(null);
  const [courtErrors, setCourtErrors] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [optimisticClearedCourts, setOptimisticClearedCourts] = useState<Set<number>>(new Set());

  // ── Deterministic optimistic clear resolution ─────────────
  useEffect(() => {
    setOptimisticClearedCourts((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const courtNum of prev) {
        const serverCourt = courts.find((c) => c.court_number === courtNum);
        // Remove from optimistic set ONLY when server confirms:
        // court is OPEN with null teams (record completed + court reset)
        if (!serverCourt || (serverCourt.status === "OPEN" && serverCourt.team_a_ids === null)) {
          next.delete(courtNum);
        }
      }
      return next.size !== prev.size ? next : prev;
    });
  }, [courts]);

  // ── Derived ───────────────────────────────────────────────
  const courtCount = courts.length;
  const assignedIds = getAllCourtPlayerIds(courts);
  const activePlayers = attendees.filter((a) => a.status === "ACTIVE");
  const inactivePlayers = attendees.filter((a) => a.status === "INACTIVE");
  const waitingPlayers = activePlayers.filter((p) => !assignedIds.has(p.id));
  const hasOpenCourts = courts.some((c) => c.status === "OPEN");
  const hasInProgressCourts = courts.some((c) => c.status === "IN_PROGRESS");

  // ── Helpers ───────────────────────────────────────────────

  function playerName(id: string): string {
    return attendees.find((p) => p.id === id)?.display_name ?? "?";
  }

  function playerCode(id: string): string {
    return attendees.find((p) => p.id === id)?.code ?? "?";
  }

  function getPairGames(a: string, b: string): number {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const entry = pairCounts.find((p) => {
      const [pLo, pHi] =
        p.player_a_id < p.player_b_id
          ? [p.player_a_id, p.player_b_id]
          : [p.player_b_id, p.player_a_id];
      return pLo === lo && pHi === hi;
    });
    return entry?.games_together ?? 0;
  }

  function getScores(courtNumber: number) {
    return scoreInputs[courtNumber] ?? { scoreA: "", scoreB: "" };
  }

  function setScore(courtNumber: number, field: "scoreA" | "scoreB", value: string) {
    setScoreInputs((prev) => ({
      ...prev,
      [courtNumber]: { ...getScores(courtNumber), [field]: value },
    }));
    setCourtErrors((prev) => {
      const next = { ...prev };
      delete next[courtNumber];
      return next;
    });
  }

  // ── Generic action wrapper with STALE_STATE handling ──────

  async function callAction<T>(
    action: () => Promise<RpcResult<T>>,
    courtNumber?: number
  ): Promise<RpcResult<T>> {
    const result = await action();
    if (!result.ok && result.error?.code === "STALE_STATE") {
      const msg = "Updated on another device. Refreshing...";
      if (courtNumber !== undefined) {
        setCourtErrors((prev) => ({ ...prev, [courtNumber]: msg }));
      } else {
        setGlobalError(msg);
      }
      router.refresh();
    }
    return result;
  }

  // ── Court count changes ───────────────────────────────────

  function handleCourtCountChange(delta: number) {
    const newCount = Math.max(1, Math.min(8, courtCount + delta));
    if (newCount === courtCount) return;

    setGlobalError(null);
    startTransition(async () => {
      const result = await callAction(() =>
        updateCourtCountAction(sessionId, joinCode, newCount)
      );
      if (result.ok) {
        router.refresh();
      } else if (result.error?.code !== "STALE_STATE") {
        setGlobalError(result.error?.message ?? "Failed to update court count");
      }
    });
  }

  // ── Suggest ───────────────────────────────────────────────

  function handleSuggest(courtNumbers?: number[]) {
    setGlobalError(null);
    startTransition(async () => {
      const result = await callAction(() =>
        suggestCourtsAction(sessionId, joinCode, courtNumbers)
      );
      if (result.ok) {
        router.refresh();
      } else if (result.error?.code !== "STALE_STATE") {
        setGlobalError(result.error?.message ?? "Failed to suggest");
      }
    });
  }

  // ── Start Game (OPEN full → IN_PROGRESS) ──────────────────

  function handleStartGame(courtNumber: number) {
    setCourtErrors((prev) => {
      const next = { ...prev };
      delete next[courtNumber];
      return next;
    });
    startTransition(async () => {
      const result = await callAction(
        () => startCourtGameAction(sessionId, joinCode, courtNumber),
        courtNumber
      );
      if (result.ok) {
        router.refresh();
      } else if (result.error?.code !== "STALE_STATE") {
        setCourtErrors((prev) => ({
          ...prev,
          [courtNumber]: result.error?.message ?? "Failed to start game",
        }));
      }
    });
  }

  // ── Record Game (IN_PROGRESS → OPEN, optimistic) ──────────

  function handleRecordCourt(courtNumber: number) {
    const scores = getScores(courtNumber);
    const scoreA = parseInt(scores.scoreA, 10);
    const scoreB = parseInt(scores.scoreB, 10);

    if (isNaN(scoreA) || isNaN(scoreB)) {
      setCourtErrors((prev) => ({ ...prev, [courtNumber]: "Enter both scores" }));
      return;
    }

    setCourtErrors((prev) => {
      const next = { ...prev };
      delete next[courtNumber];
      return next;
    });

    startTransition(async () => {
      const result = await recordCourtGameAction(
        sessionId,
        joinCode,
        courtNumber,
        scoreA,
        scoreB,
        true // force=true to skip duplicate check in courts mode
      );

      if (result.ok) {
        // IMMEDIATELY clear this court card visually (optimistic)
        setOptimisticClearedCourts((prev) => new Set(prev).add(courtNumber));
        setScoreInputs((prev) => {
          const next = { ...prev };
          delete next[courtNumber];
          return next;
        });
        // Reconcile with server
        router.refresh();
      } else if (result.error?.code === "STALE_STATE") {
        setCourtErrors((prev) => ({
          ...prev,
          [courtNumber]: "Updated on another device. Please refresh.",
        }));
        router.refresh();
      } else if (result.error?.code === "POSSIBLE_DUPLICATE") {
        // Shouldn't happen with force=true, but handle gracefully
        setCourtErrors((prev) => ({
          ...prev,
          [courtNumber]: "Possible duplicate game detected",
        }));
      } else {
        setCourtErrors((prev) => ({
          ...prev,
          [courtNumber]: result.error?.message ?? "Failed to record game",
        }));
      }
    });
  }

  // ── Slot tap / assign ─────────────────────────────────────

  function handleSlotTap(courtNumber: number, team: "A" | "B", slot: number) {
    setSwapTarget({ courtNumber, team, slot });
  }

  function handleSwapSelect(playerId: string | null) {
    if (!swapTarget) return;
    const { courtNumber, team, slot } = swapTarget;
    setSwapTarget(null);

    if (playerId === null) {
      // Clear slot
      startTransition(async () => {
        const result = await callAction(
          () => clearCourtSlotAction(sessionId, joinCode, courtNumber, team, slot),
          courtNumber
        );
        if (result.ok) {
          router.refresh();
        } else if (result.error?.code !== "STALE_STATE") {
          setCourtErrors((prev) => ({
            ...prev,
            [courtNumber]: result.error?.message ?? "Failed to clear slot",
          }));
        }
      });
    } else {
      // Assign player
      startTransition(async () => {
        const result = await callAction(
          () => assignCourtSlotAction(sessionId, joinCode, courtNumber, team, slot, playerId),
          courtNumber
        );
        if (result.ok) {
          router.refresh();
        } else if (result.error?.code !== "STALE_STATE") {
          setCourtErrors((prev) => ({
            ...prev,
            [courtNumber]: result.error?.message ?? "Failed to assign player",
          }));
        }
      });
    }
  }

  // ── Mark player out ───────────────────────────────────────

  function handleMarkOut(playerId: string) {
    // Check if player is on an IN_PROGRESS court
    const onInProgress = courts.some(
      (c) =>
        c.status === "IN_PROGRESS" &&
        ((c.team_a_ids && c.team_a_ids.includes(playerId)) ||
          (c.team_b_ids && c.team_b_ids.includes(playerId)))
    );

    if (onInProgress) {
      // Show choice modal
      setOutChoicePlayer(playerId);
    } else {
      // Immediate removal
      startTransition(async () => {
        const result = await callAction(() =>
          markPlayerOutAction(sessionId, joinCode, playerId, "immediate")
        );
        if (result.ok) {
          router.refresh();
        } else if (result.error?.code !== "STALE_STATE") {
          setGlobalError(result.error?.message ?? "Failed to mark player out");
        }
      });
    }
  }

  function handleOutChoice(mode: "immediate" | "after_game") {
    if (!outChoicePlayer) return;
    const playerId = outChoicePlayer;
    setOutChoicePlayer(null);

    startTransition(async () => {
      const result = await callAction(() =>
        markPlayerOutAction(sessionId, joinCode, playerId, mode)
      );
      if (result.ok) {
        router.refresh();
      } else if (result.error?.code !== "STALE_STATE") {
        setGlobalError(result.error?.message ?? "Failed to mark player out");
      }
    });
  }

  // ── Make active ───────────────────────────────────────────

  function handleMakeActive(playerId: string) {
    startTransition(async () => {
      const result = await callAction(() =>
        makePlayerActiveAction(sessionId, joinCode, playerId)
      );
      if (result.ok) {
        router.refresh();
      } else if (result.error?.code !== "STALE_STATE") {
        setGlobalError(result.error?.message ?? "Failed to make player active");
      }
    });
  }

  // ── Player court info ─────────────────────────────────────

  function getPlayerCourtNumber(playerId: string): number | null {
    for (const c of courts) {
      if (c.status === "IN_PROGRESS") {
        if (
          (c.team_a_ids && c.team_a_ids.includes(playerId)) ||
          (c.team_b_ids && c.team_b_ids.includes(playerId))
        ) {
          return c.court_number;
        }
      }
    }
    return null;
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header controls ──────────────────────────────── */}
      <div className="space-y-3">
        {/* Court count control */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Courts</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCourtCountChange(-1)}
              disabled={courtCount <= 1 || isPending}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              -
            </button>
            <span className="w-8 text-center text-lg font-bold text-gray-900">
              {courtCount}
            </span>
            <button
              type="button"
              onClick={() => handleCourtCountChange(1)}
              disabled={courtCount >= 8 || isPending}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleSuggest()}
            disabled={isPending || !hasOpenCourts}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors min-w-[80px] disabled:opacity-40"
          >
            {isPending ? "Working..." : "Suggest All"}
          </button>
        </div>

        {/* Void last game */}
        <VoidLastGameButton
          sessionId={sessionId}
          joinCode={joinCode}
          redirectPath={`/g/${joinCode}/session/${sessionId}/courts`}
        />

        {/* Global error */}
        {globalError && (
          <p className="text-xs text-red-600 font-medium" role="alert">
            {globalError}
          </p>
        )}
      </div>

      {/* ── Court cards ──────────────────────────────────── */}
      {courts.map((court) => {
        // Optimistic clear: show empty court card if just recorded
        if (optimisticClearedCourts.has(court.court_number)) {
          return (
            <div
              key={court.court_number}
              className="rounded-xl border border-gray-200 bg-white px-4 py-4 space-y-3 opacity-50"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-700">
                  Court {court.court_number}
                </h3>
                <span className="text-xs text-gray-400">Recording...</span>
              </div>
              <div className="h-20 flex items-center justify-center">
                <span className="text-xs text-gray-400">Game recorded. Refreshing...</span>
              </div>
            </div>
          );
        }

        const isOpen = court.status === "OPEN";
        const isInProgress = court.status === "IN_PROGRESS";
        const full = isCourtFull(court);
        const scores = getScores(court.court_number);

        return (
          <div
            key={court.court_number}
            className={`rounded-xl border px-4 py-4 space-y-3 ${
              isInProgress
                ? "border-green-300 bg-green-50/30"
                : "border-gray-200 bg-white"
            }`}
          >
            {/* Court header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">
                Court {court.court_number}
              </h3>
              {isInProgress && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  In Progress
                </span>
              )}
              {isOpen && full && (
                <span className="text-[10px] font-semibold text-amber-600">Ready</span>
              )}
            </div>

            {/* Teams */}
            <div className="grid grid-cols-2 gap-3">
              {/* Team A */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-blue-600">Team A</p>
                {[0, 1].map((slotIdx) => {
                  const playerId = court.team_a_ids?.[slotIdx] ?? null;
                  const pendingOut = playerId
                    ? attendees.find((a) => a.id === playerId)?.inactive_effective_after_game
                    : false;

                  return (
                    <button
                      key={`a-${slotIdx}`}
                      type="button"
                      onClick={() =>
                        isOpen && handleSlotTap(court.court_number, "A", slotIdx + 1)
                      }
                      disabled={isInProgress || isPending}
                      className={`w-full rounded-lg px-2 py-2 text-xs font-medium text-left transition-colors min-h-[36px] ${
                        playerId
                          ? "bg-blue-50 border border-blue-200 text-blue-900"
                          : "bg-gray-50 border border-dashed border-gray-300 text-gray-400"
                      } ${
                        isInProgress
                          ? "cursor-not-allowed opacity-75"
                          : "hover:bg-blue-100 cursor-pointer"
                      }`}
                    >
                      {playerId ? (
                        <span>
                          <span className="font-mono mr-1">{playerCode(playerId)}</span>
                          {playerName(playerId)}
                          {pendingOut && (
                            <span className="ml-1 text-[10px] text-amber-600">(out next)</span>
                          )}
                        </span>
                      ) : (
                        "Tap to assign"
                      )}
                    </button>
                  );
                })}
                {court.team_a_ids &&
                  court.team_a_ids[0] &&
                  court.team_a_ids[1] && (
                    <p className="text-[10px] text-blue-500 mt-0.5">
                      Partners{" "}
                      {getPairGames(court.team_a_ids[0], court.team_a_ids[1])}
                      &times; this session
                    </p>
                  )}
              </div>

              {/* Team B */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-orange-600">Team B</p>
                {[0, 1].map((slotIdx) => {
                  const playerId = court.team_b_ids?.[slotIdx] ?? null;
                  const pendingOut = playerId
                    ? attendees.find((a) => a.id === playerId)?.inactive_effective_after_game
                    : false;

                  return (
                    <button
                      key={`b-${slotIdx}`}
                      type="button"
                      onClick={() =>
                        isOpen && handleSlotTap(court.court_number, "B", slotIdx + 1)
                      }
                      disabled={isInProgress || isPending}
                      className={`w-full rounded-lg px-2 py-2 text-xs font-medium text-left transition-colors min-h-[36px] ${
                        playerId
                          ? "bg-orange-50 border border-orange-200 text-orange-900"
                          : "bg-gray-50 border border-dashed border-gray-300 text-gray-400"
                      } ${
                        isInProgress
                          ? "cursor-not-allowed opacity-75"
                          : "hover:bg-orange-100 cursor-pointer"
                      }`}
                    >
                      {playerId ? (
                        <span>
                          <span className="font-mono mr-1">{playerCode(playerId)}</span>
                          {playerName(playerId)}
                          {pendingOut && (
                            <span className="ml-1 text-[10px] text-amber-600">(out next)</span>
                          )}
                        </span>
                      ) : (
                        "Tap to assign"
                      )}
                    </button>
                  );
                })}
                {court.team_b_ids &&
                  court.team_b_ids[0] &&
                  court.team_b_ids[1] && (
                    <p className="text-[10px] text-orange-500 mt-0.5">
                      Partners{" "}
                      {getPairGames(court.team_b_ids[0], court.team_b_ids[1])}
                      &times; this session
                    </p>
                  )}
              </div>
            </div>

            {/* Score inputs — only for IN_PROGRESS courts */}
            {isInProgress && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-blue-600 mb-0.5">
                    Score A
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={0}
                    max={99}
                    value={scores.scoreA}
                    onChange={(e) => setScore(court.court_number, "scoreA", e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-lg font-bold text-blue-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-orange-600 mb-0.5">
                    Score B
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={0}
                    max={99}
                    value={scores.scoreB}
                    onChange={(e) => setScore(court.court_number, "scoreB", e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center text-lg font-bold text-orange-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>
            )}

            {/* Court error */}
            {courtErrors[court.court_number] && (
              <p className="text-xs text-red-600 font-medium" role="alert">
                {courtErrors[court.court_number]}
              </p>
            )}

            {/* Action buttons */}
            {isInProgress && (
              <button
                type="button"
                onClick={() => handleRecordCourt(court.court_number)}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
              >
                {isPending ? "Recording..." : "Record Game"}
              </button>
            )}

            {isOpen && full && (
              <button
                type="button"
                onClick={() => handleStartGame(court.court_number)}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
              >
                {isPending ? "Starting..." : "Start Game"}
              </button>
            )}

            {/* Court-Level Suggest — shown on OPEN courts when another court is IN_PROGRESS */}
            {isOpen && hasInProgressCourts && (
              <button
                type="button"
                onClick={() => handleSuggest([court.court_number])}
                disabled={isPending}
                className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Suggest Court {court.court_number}
              </button>
            )}
          </div>
        );
      })}

      {/* ── Swap modal (bottom sheet) ────────────────────── */}
      {swapTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30">
          <div className="w-full max-w-sm bg-white rounded-t-2xl px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">
                Court {swapTarget.courtNumber} — Team {swapTarget.team}, Slot{" "}
                {swapTarget.slot}
              </h3>
              <button
                type="button"
                onClick={() => setSwapTarget(null)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>

            {/* Clear slot option */}
            <button
              type="button"
              onClick={() => handleSwapSelect(null)}
              disabled={isPending}
              className="w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              Clear slot
            </button>

            {/* Available players */}
            {waitingPlayers.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">
                All active players are assigned to courts.
              </p>
            )}
            {waitingPlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => handleSwapSelect(player.id)}
                disabled={isPending}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors min-h-[44px] hover:bg-gray-50 disabled:opacity-40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold font-mono text-gray-600">
                  {player.code}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-900">
                  {player.display_name}
                </span>
                <span className="text-xs text-gray-400">
                  {gamesPlayedMap[player.id] ?? 0}g
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Out choice modal ─────────────────────────────── */}
      {outChoicePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6">
          <div className="w-full max-w-xs bg-white rounded-2xl px-5 py-5 space-y-4 shadow-xl">
            <p className="text-sm font-medium text-gray-800">
              {playerName(outChoicePlayer)} is on an active court.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleOutChoice("after_game")}
                disabled={isPending}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Out After This Game
              </button>
              <button
                type="button"
                onClick={() => handleOutChoice("immediate")}
                disabled={isPending}
                className="w-full rounded-lg border border-red-300 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                Remove Now
              </button>
              <button
                type="button"
                onClick={() => setOutChoicePlayer(null)}
                className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Players ───────────────────────────────── */}
      <div className="space-y-4">
        {/* Active players waiting */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Waiting ({waitingPlayers.length})
          </h3>
          {waitingPlayers.length === 0 ? (
            <p className="text-xs text-gray-400">Everyone is on a court or inactive.</p>
          ) : (
            <div className="space-y-1">
              {waitingPlayers.map((player) => {
                const gp = gamesPlayedMap[player.id] ?? 0;
                const rating = ratings[player.id];

                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold font-mono text-gray-600">
                      {player.code}
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-900">
                      {player.display_name}
                    </span>
                    <span className="text-xs text-gray-400">{gp}g</span>
                    {rating && (
                      <span className="text-xs text-gray-400">
                        {Math.round(rating.rating)}
                        {rating.provisional && "?"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleMarkOut(player.id)}
                      disabled={isPending}
                      className="rounded px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors disabled:opacity-40"
                    >
                      Sit
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* On Court (IN_PROGRESS players) */}
        {hasInProgressCourts && (() => {
          const onCourtPlayers = activePlayers.filter((p) => getPlayerCourtNumber(p.id) !== null);
          if (onCourtPlayers.length === 0) return null;

          return (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                On Court ({onCourtPlayers.length})
              </h3>
              <div className="space-y-1">
                {onCourtPlayers.map((player) => {
                  const courtNum = getPlayerCourtNumber(player.id);
                  const pendingOut = player.inactive_effective_after_game;

                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/50 px-3 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold font-mono text-green-700">
                        {player.code}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-900">
                        {player.display_name}
                        <span className="text-xs text-gray-400 ml-1">C{courtNum}</span>
                        {pendingOut && (
                          <span className="ml-1 text-[10px] text-amber-600 font-semibold">
                            (out next)
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMarkOut(player.id)}
                        disabled={isPending}
                        className="rounded px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors disabled:opacity-40"
                      >
                        Sit
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Inactive players */}
        {inactivePlayers.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Inactive ({inactivePlayers.length})
            </h3>
            <div className="space-y-1">
              {inactivePlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 opacity-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold font-mono text-gray-600">
                    {player.code}
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-900">
                    {player.display_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleMakeActive(player.id)}
                    disabled={isPending}
                    className="rounded px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-40"
                  >
                    Activate
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
