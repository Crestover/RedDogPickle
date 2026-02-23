"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { recordGameAction } from "@/app/actions/games";
import VoidLastGameButton from "../VoidLastGameButton";
import type { Player } from "@/lib/types";
import type { GameRecord, CourtAssignment, PairCountEntry } from "@/lib/autoSuggest";
import { autoSuggest, reshuffleTeams, reselectPlayers } from "@/lib/autoSuggest";

// ── Types ─────────────────────────────────────────────────────

interface CourtState {
  teamA: (string | null)[];
  teamB: (string | null)[];
  scoreA: string;
  scoreB: string;
  locked: boolean;
}

interface SwapTarget {
  courtIdx: number;
  team: "A" | "B";
  slotIdx: number;
}

interface Props {
  sessionId: string;
  joinCode: string;
  attendees: Player[];
  games: GameRecord[];
  pairCounts: PairCountEntry[];
  gamesPlayedMap: Record<string, number>;
  ratings: Record<string, { rating: number; provisional: boolean }>;
}

// ── Helpers ───────────────────────────────────────────────────

function createEmptyCourt(): CourtState {
  return { teamA: [null, null], teamB: [null, null], scoreA: "", scoreB: "", locked: false };
}

function getCourtPlayerIds(court: CourtState): string[] {
  return [...court.teamA, ...court.teamB].filter((id): id is string => id !== null);
}

function getAllCourtPlayerIds(courts: CourtState[]): Set<string> {
  const ids = new Set<string>();
  for (const court of courts) {
    for (const id of getCourtPlayerIds(court)) {
      ids.add(id);
    }
  }
  return ids;
}

// ── localStorage key for court count persistence ──────────────

function courtCountKey(joinCode: string) {
  return `courts_${joinCode}`;
}

// ── Component ─────────────────────────────────────────────────

export default function CourtsManager({
  sessionId,
  joinCode,
  attendees,
  games,
  pairCounts,
  gamesPlayedMap,
  ratings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Court count (persisted to localStorage)
  const [courtCount, setCourtCount] = useState(2);
  useEffect(() => {
    const stored = localStorage.getItem(courtCountKey(joinCode));
    if (stored) {
      const num = parseInt(stored, 10);
      if (!isNaN(num) && num >= 1 && num <= 8) setCourtCount(num);
    }
  }, [joinCode]);

  function updateCourtCount(n: number) {
    const clamped = Math.max(1, Math.min(8, n));
    setCourtCount(clamped);
    localStorage.setItem(courtCountKey(joinCode), String(clamped));
  }

  // Courts state
  const [courts, setCourts] = useState<CourtState[]>(() =>
    Array.from({ length: 8 }, () => createEmptyCourt())
  );

  // Inactive players (excluded from suggest, UI-only)
  const [inactivePlayers, setInactivePlayers] = useState<Set<string>>(new Set());

  // Swap target (slot selection modal)
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{
    label: string;
    action: () => void;
  } | null>(null);

  // Recording error per court
  const [courtErrors, setCourtErrors] = useState<Record<number, string>>({});

  // ── Derived ─────────────────────────────────────────────────
  const activeCourts = courts.slice(0, courtCount);
  const assignedIds = getAllCourtPlayerIds(activeCourts);
  const activePlayerIds = attendees
    .filter((p) => !inactivePlayers.has(p.id))
    .map((p) => p.id);
  const waitingPlayers = attendees.filter(
    (p) => !assignedIds.has(p.id)
  );

  // ── Helpers ─────────────────────────────────────────────────

  function playerName(id: string): string {
    return attendees.find((p) => p.id === id)?.display_name ?? "?";
  }

  function playerCode(id: string): string {
    return attendees.find((p) => p.id === id)?.code ?? "?";
  }

  /** Look up how many times two players have partnered this session. */
  function getPairGames(a: string, b: string): number {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const entry = pairCounts.find((p) => {
      const pk = p.player_a_id < p.player_b_id
        ? `${p.player_a_id}:${p.player_b_id}`
        : `${p.player_b_id}:${p.player_a_id}`;
      return pk === key;
    });
    return entry?.games_together ?? 0;
  }

  function hasAnyAssignments(): boolean {
    return activeCourts.some((c) => getCourtPlayerIds(c).length > 0);
  }

  // ── Apply suggestions ───────────────────────────────────────

  const applyAssignments = useCallback((assignments: CourtAssignment[]) => {
    setCourts((prev) => {
      const next = [...prev];
      for (const a of assignments) {
        if (a.courtIndex < next.length && !next[a.courtIndex].locked) {
          next[a.courtIndex] = {
            teamA: [a.teamA[0] ?? null, a.teamA[1] ?? null],
            teamB: [a.teamB[0] ?? null, a.teamB[1] ?? null],
            scoreA: "",
            scoreB: "",
            locked: false,
          };
        }
      }
      return next;
    });
  }, []);

  function handleSuggest() {
    const doSuggest = () => {
      const assignments = autoSuggest(games, activePlayerIds, courtCount, pairCounts);
      applyAssignments(assignments);
    };

    if (hasAnyAssignments()) {
      setConfirmAction({ label: "Replace current court assignments?", action: doSuggest });
    } else {
      doSuggest();
    }
  }

  function handleReshuffle() {
    const currentAssignments: CourtAssignment[] = activeCourts
      .map((c, i) => ({
        courtIndex: i,
        teamA: c.teamA.filter((id): id is string => id !== null),
        teamB: c.teamB.filter((id): id is string => id !== null),
      }))
      .filter((a) => a.teamA.length === 2 && a.teamB.length === 2);

    if (currentAssignments.length === 0) return;

    const reshuffled = reshuffleTeams(currentAssignments, pairCounts);
    applyAssignments(reshuffled);
  }

  function handleReselect() {
    const doReselect = () => {
      const assignments = reselectPlayers(games, activePlayerIds, courtCount, pairCounts);
      applyAssignments(assignments);
    };

    if (hasAnyAssignments()) {
      setConfirmAction({ label: "Reselect players for all courts?", action: doReselect });
    } else {
      doReselect();
    }
  }

  // ── Slot tap / swap ─────────────────────────────────────────

  function handleSlotTap(courtIdx: number, team: "A" | "B", slotIdx: number) {
    if (courts[courtIdx].locked) return;
    setSwapTarget({ courtIdx, team, slotIdx });
  }

  function handleSwapSelect(playerId: string | null) {
    if (!swapTarget) return;
    const { courtIdx, team, slotIdx } = swapTarget;

    setCourts((prev) => {
      const next = [...prev];
      const court = { ...next[courtIdx] };
      const arr = team === "A" ? [...court.teamA] : [...court.teamB];

      // If player is already on some court, remove them first
      if (playerId !== null) {
        for (let ci = 0; ci < next.length; ci++) {
          const c = { ...next[ci] };
          const tA = [...c.teamA];
          const tB = [...c.teamB];
          let changed = false;
          for (let i = 0; i < tA.length; i++) {
            if (tA[i] === playerId) { tA[i] = null; changed = true; }
          }
          for (let i = 0; i < tB.length; i++) {
            if (tB[i] === playerId) { tB[i] = null; changed = true; }
          }
          if (changed) {
            next[ci] = { ...c, teamA: tA, teamB: tB };
          }
        }
      }

      // Set the slot
      arr[slotIdx] = playerId;
      if (team === "A") court.teamA = arr;
      else court.teamB = arr;
      next[courtIdx] = court;

      return next;
    });

    setSwapTarget(null);
  }

  // ── Record game from a court ────────────────────────────────

  function canRecordCourt(court: CourtState): boolean {
    const allFilled = court.teamA.every(Boolean) && court.teamB.every(Boolean);
    if (!allFilled) return false;
    const a = parseInt(court.scoreA, 10);
    const b = parseInt(court.scoreB, 10);
    if (isNaN(a) || isNaN(b)) return false;
    if (a === b) return false;
    const w = Math.max(a, b);
    const l = Math.min(a, b);
    if (w < 11 || w - l < 2) return false;
    // Check no duplicate players across this court
    const ids = getCourtPlayerIds(court);
    return ids.length === 4 && new Set(ids).size === 4;
  }

  function handleRecordCourt(courtIdx: number) {
    const court = courts[courtIdx];
    if (!canRecordCourt(court)) return;

    setCourtErrors((prev) => ({ ...prev, [courtIdx]: "" }));

    startTransition(async () => {
      const result = await recordGameAction(
        sessionId,
        joinCode,
        court.teamA.filter(Boolean) as string[],
        court.teamB.filter(Boolean) as string[],
        parseInt(court.scoreA, 10),
        parseInt(court.scoreB, 10),
        true // force=true to skip duplicate check (courts mode is intentional)
      );

      if (!result) {
        // redirect happened (success) — Next.js will re-render
        return;
      }

      if ("error" in result) {
        setCourtErrors((prev) => ({ ...prev, [courtIdx]: result.error }));
        return;
      }

      // possibleDuplicate — shouldn't happen with force=true, but clear court anyway
      setCourts((prev) => {
        const next = [...prev];
        next[courtIdx] = createEmptyCourt();
        return next;
      });
      router.refresh();
    });
  }

  // ── Toggle inactive ─────────────────────────────────────────

  function toggleInactive(playerId: string) {
    setInactivePlayers((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
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
              onClick={() => updateCourtCount(courtCount - 1)}
              disabled={courtCount <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              -
            </button>
            <span className="w-8 text-center text-lg font-bold text-gray-900">
              {courtCount}
            </span>
            <button
              type="button"
              onClick={() => updateCourtCount(courtCount + 1)}
              disabled={courtCount >= 8}
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
            onClick={handleSuggest}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors min-w-[80px]"
          >
            Suggest
          </button>
          <button
            type="button"
            onClick={handleReshuffle}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-w-[80px]"
          >
            Reshuffle
          </button>
          <button
            type="button"
            onClick={handleReselect}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-w-[80px]"
          >
            Reselect
          </button>
        </div>

        {/* Void last game */}
        <VoidLastGameButton
          sessionId={sessionId}
          joinCode={joinCode}
          redirectPath={`/g/${joinCode}/session/${sessionId}/courts`}
        />
      </div>

      {/* ── Court cards ──────────────────────────────────── */}
      {activeCourts.map((court, courtIdx) => {
        const isComplete = canRecordCourt(court);

        return (
          <div
            key={courtIdx}
            className="rounded-xl border border-gray-200 bg-white px-4 py-4 space-y-3"
          >
            {/* Court header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">
                Court {courtIdx + 1}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCourts((prev) => {
                    const next = [...prev];
                    next[courtIdx] = { ...next[courtIdx], locked: !next[courtIdx].locked };
                    return next;
                  });
                }}
                className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                  court.locked
                    ? "bg-gray-200 text-gray-600"
                    : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                }`}
              >
                {court.locked ? "Locked" : "Lock"}
              </button>
            </div>

            {/* Teams */}
            <div className="grid grid-cols-2 gap-3">
              {/* Team A */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-blue-600">Team A</p>
                {court.teamA.map((playerId, slotIdx) => (
                  <button
                    key={`a-${slotIdx}`}
                    type="button"
                    onClick={() => handleSlotTap(courtIdx, "A", slotIdx)}
                    disabled={court.locked}
                    className={`w-full rounded-lg px-2 py-2 text-xs font-medium text-left transition-colors min-h-[36px] ${
                      playerId
                        ? "bg-blue-50 border border-blue-200 text-blue-900"
                        : "bg-gray-50 border border-dashed border-gray-300 text-gray-400"
                    } ${court.locked ? "cursor-not-allowed opacity-60" : "hover:bg-blue-100 cursor-pointer"}`}
                  >
                    {playerId ? (
                      <span>
                        <span className="font-mono mr-1">{playerCode(playerId)}</span>
                        {playerName(playerId)}
                      </span>
                    ) : (
                      "Tap to assign"
                    )}
                  </button>
                ))}
                {court.teamA[0] && court.teamA[1] && (
                  <p className="text-[10px] text-blue-500 mt-0.5">
                    Partners {getPairGames(court.teamA[0], court.teamA[1])}&times; this session
                  </p>
                )}
              </div>

              {/* Team B */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-orange-600">Team B</p>
                {court.teamB.map((playerId, slotIdx) => (
                  <button
                    key={`b-${slotIdx}`}
                    type="button"
                    onClick={() => handleSlotTap(courtIdx, "B", slotIdx)}
                    disabled={court.locked}
                    className={`w-full rounded-lg px-2 py-2 text-xs font-medium text-left transition-colors min-h-[36px] ${
                      playerId
                        ? "bg-orange-50 border border-orange-200 text-orange-900"
                        : "bg-gray-50 border border-dashed border-gray-300 text-gray-400"
                    } ${court.locked ? "cursor-not-allowed opacity-60" : "hover:bg-orange-100 cursor-pointer"}`}
                  >
                    {playerId ? (
                      <span>
                        <span className="font-mono mr-1">{playerCode(playerId)}</span>
                        {playerName(playerId)}
                      </span>
                    ) : (
                      "Tap to assign"
                    )}
                  </button>
                ))}
                {court.teamB[0] && court.teamB[1] && (
                  <p className="text-[10px] text-orange-500 mt-0.5">
                    Partners {getPairGames(court.teamB[0], court.teamB[1])}&times; this session
                  </p>
                )}
              </div>
            </div>

            {/* Score inputs */}
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
                  value={court.scoreA}
                  onChange={(e) => {
                    setCourts((prev) => {
                      const next = [...prev];
                      next[courtIdx] = { ...next[courtIdx], scoreA: e.target.value };
                      return next;
                    });
                    setCourtErrors((prev) => ({ ...prev, [courtIdx]: "" }));
                  }}
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
                  value={court.scoreB}
                  onChange={(e) => {
                    setCourts((prev) => {
                      const next = [...prev];
                      next[courtIdx] = { ...next[courtIdx], scoreB: e.target.value };
                      return next;
                    });
                    setCourtErrors((prev) => ({ ...prev, [courtIdx]: "" }));
                  }}
                  placeholder="0"
                  className="w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center text-lg font-bold text-orange-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Court error */}
            {courtErrors[courtIdx] && (
              <p className="text-xs text-red-600 font-medium" role="alert">
                {courtErrors[courtIdx]}
              </p>
            )}

            {/* Record button */}
            <button
              type="button"
              onClick={() => handleRecordCourt(courtIdx)}
              disabled={!isComplete || isPending}
              className="flex w-full items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
            >
              {isPending ? "Recording…" : "Record Game"}
            </button>
          </div>
        );
      })}

      {/* ── Swap modal (bottom sheet) ────────────────────── */}
      {swapTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30">
          <div className="w-full max-w-sm bg-white rounded-t-2xl px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">
                Court {swapTarget.courtIdx + 1} — Team {swapTarget.team}, Slot{" "}
                {swapTarget.slotIdx + 1}
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
              className="w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Clear slot
            </button>

            {/* Available players (waiting pool) */}
            {waitingPlayers.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">
                All players are assigned to courts.
              </p>
            )}
            {waitingPlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => handleSwapSelect(player.id)}
                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors min-h-[44px] ${
                  inactivePlayers.has(player.id)
                    ? "border-gray-200 bg-gray-50 opacity-40"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
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

      {/* ── Confirm dialog ───────────────────────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6">
          <div className="w-full max-w-xs bg-white rounded-2xl px-5 py-5 space-y-4 shadow-xl">
            <p className="text-sm font-medium text-gray-800">
              {confirmAction.label}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmAction.action();
                  setConfirmAction(null);
                }}
                className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Waiting pool ─────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Waiting ({waitingPlayers.length})
        </h3>
        {waitingPlayers.length === 0 ? (
          <p className="text-xs text-gray-400">Everyone is on a court.</p>
        ) : (
          <div className="space-y-1">
            {waitingPlayers.map((player) => {
              const inactive = inactivePlayers.has(player.id);
              const gp = gamesPlayedMap[player.id] ?? 0;
              const rating = ratings[player.id];

              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    inactive
                      ? "border-gray-200 bg-gray-50 opacity-40"
                      : "border-gray-200 bg-white"
                  }`}
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
                    onClick={() => toggleInactive(player.id)}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      inactive
                        ? "bg-gray-300 text-gray-600"
                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                    }`}
                  >
                    {inactive ? "Out" : "Sit"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
