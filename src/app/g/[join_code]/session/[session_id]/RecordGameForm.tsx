"use client";

/**
 * RecordGameForm — Quick Game Screen
 *
 * Zero-hesitation UX: tap 4 players, enter score, record.
 * No mode choosing. One clear action at a time.
 * Progressive disclosure: score entry appears after 4 players selected.
 *
 * Team auto-assignment by selection order:
 *   1st + 2nd tap → Team A
 *   3rd + 4th tap → Team B
 *
 * CTA button always tells the user what to do next (never silently disabled).
 *
 * Preserves all existing safeguards:
 *   - 8-second undo snackbar after recording
 *   - Shutout double-tap confirmation
 *   - Suspicious score warning
 *   - Duplicate detection (M4.1)
 *   - Debounced router.refresh()
 */

import { useState, useRef, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { recordGameAction, undoGameAction } from "@/app/actions/games";
import { setSessionRulesAction } from "@/app/actions/sessions";
import type { Player } from "@/lib/types";
import type { GameRecord, PairCountEntry } from "@/lib/autoSuggest";
import { severityDotClass, getMatchupCount } from "@/lib/pairingFeedback";
import {
  validateScores as validateScoresShared,
  isSuspiciousScore,
  isShutout as isShutoutShared,
  deriveOutcome,
} from "@/lib/sports/validators";

interface Props {
  sessionId: string;
  joinCode: string;
  attendees: Player[];
  pairCounts?: PairCountEntry[];
  games?: GameRecord[];
  sessionRules: { targetPoints: number; winBy: number };
  sportConfig: { targetPresets: number[]; playersPerTeam: number };
  lastGameSummary?: string;
}

type TeamLabel = "A" | "B";

interface SelectedPlayer extends Player {
  team: TeamLabel;
}

interface PossibleDuplicate {
  existingGameId: string;
  existingCreatedAt: string;
}

interface UndoEntry {
  gameId: string;
  expiresAt: number;
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? "s" : ""} ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
}

function firstName(displayName: string): string {
  const space = displayName.indexOf(" ");
  return space > 0 ? displayName.substring(0, space) : displayName;
}

export default function RecordGameForm({
  sessionId,
  joinCode,
  attendees,
  pairCounts,
  games,
  sessionRules,
  sportConfig,
  lastGameSummary,
}: Props) {
  const router = useRouter();

  const totalNeeded = sportConfig.playersPerTeam * 2;

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedPlayers, setSelectedPlayers] = useState<SelectedPlayer[]>([]);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [error, setError] = useState("");
  const [possibleDup, setPossibleDup] = useState<PossibleDuplicate | null>(null);
  const [isPending, startTransition] = useTransition();
  const [shutoutArmed, setShutoutArmed] = useState(false);
  const shutoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rules, setRules] = useState(sessionRules);
  const [showRulePicker, setShowRulePicker] = useState(false);
  const [scoreWarningArmed, setScoreWarningArmed] = useState(false);

  // ── Undo queue ─────────────────────────────────────────────────────────────
  const [undoQueue, setUndoQueue] = useState<UndoEntry[]>([]);
  const [undoTick, setUndoTick] = useState(0);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const undoMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced refresh ──────────────────────────────────────────────────────
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
      refreshTimerRef.current = null;
    }, 1000);
  }, [router]);

  useEffect(() => {
    setRules(sessionRules);
  }, [sessionRules]);

  useEffect(() => {
    if (undoQueue.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setUndoQueue((q) => q.filter((e) => e.expiresAt > now));
      setUndoTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [undoQueue.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (shutoutTimerRef.current) clearTimeout(shutoutTimerRef.current);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    if (undoMessageTimerRef.current) clearTimeout(undoMessageTimerRef.current);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const teamAIds = selectedPlayers.filter((p) => p.team === "A").map((p) => p.id);
  const teamBIds = selectedPlayers.filter((p) => p.team === "B").map((p) => p.id);
  const teamsComplete = selectedPlayers.length === totalNeeded;
  const scoreEntered = scoreA !== "" && scoreB !== "";
  const scoreANum = parseInt(scoreA, 10);
  const scoreBNum = parseInt(scoreB, 10);
  const allReady = teamsComplete && scoreEntered;
  const winnerTeam =
    !isNaN(scoreANum) && !isNaN(scoreBNum) && scoreANum !== scoreBNum
      ? deriveOutcome(scoreANum, scoreBNum).winner
      : null;

  const teamANames = selectedPlayers.filter((p) => p.team === "A").map((p) => firstName(p.display_name));
  const teamBNames = selectedPlayers.filter((p) => p.team === "B").map((p) => firstName(p.display_name));

  // ── Toggle player selection ────────────────────────────────────────────────
  function togglePlayer(player: Player) {
    const exists = selectedPlayers.find((p) => p.id === player.id);
    if (exists) {
      setSelectedPlayers((prev) => prev.filter((p) => p.id !== player.id));
      setError("");
      return;
    }
    if (selectedPlayers.length >= totalNeeded) return;
    const team: TeamLabel = selectedPlayers.length < sportConfig.playersPerTeam ? "A" : "B";
    setSelectedPlayers((prev) => [...prev, { ...player, team }]);
    setError("");
  }

  // ── Pairing helpers ────────────────────────────────────────────────────────
  function getPairCount(a: string, b: string): number {
    if (!pairCounts) return 0;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const entry = pairCounts.find((p) => {
      const pk =
        p.player_a_id < p.player_b_id
          ? `${p.player_a_id}:${p.player_b_id}`
          : `${p.player_b_id}:${p.player_a_id}`;
      return pk === key;
    });
    return entry?.games_together ?? 0;
  }

  // ── Score guards ───────────────────────────────────────────────────────────
  function isShutout(): boolean {
    const a = parseInt(scoreA, 10), b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b)) return false;
    return isShutoutShared(a, b, rules.targetPoints);
  }

  function disarmShutout() {
    setShutoutArmed(false);
    if (shutoutTimerRef.current) { clearTimeout(shutoutTimerRef.current); shutoutTimerRef.current = null; }
  }

  function checkSuspiciousScore(): boolean {
    const a = parseInt(scoreA, 10), b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b)) return false;
    return isSuspiciousScore(a, b, rules.targetPoints);
  }

  // ── Rules Chip ─────────────────────────────────────────────────────────────
  function handleRuleSelect(targetPoints: number) {
    setShowRulePicker(false);
    if (targetPoints === rules.targetPoints) return;
    setRules({ targetPoints, winBy: 1 });
    startTransition(async () => {
      const result = await setSessionRulesAction("full", sessionId, targetPoints, 1);
      if ("error" in result) {
        setError(result.error);
        setRules(sessionRules);
      } else {
        router.refresh();
      }
    });
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validateSelection(): string | null {
    if (teamAIds.length !== sportConfig.playersPerTeam) return `Select ${totalNeeded} players first.`;
    if (teamBIds.length !== sportConfig.playersPerTeam) return `Select ${totalNeeded} players first.`;
    return null;
  }

  function validateScores(): string | null {
    const a = parseInt(scoreA, 10);
    const b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b)) return "Enter scores for both teams.";
    const result = validateScoresShared(a, b, rules.targetPoints);
    return result.valid ? null : result.error!;
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function handleReset() {
    setSelectedPlayers([]);
    setScoreA(""); setScoreB(""); setError(""); setPossibleDup(null);
    disarmShutout();
    setScoreWarningArmed(false);
  }

  // ── Undo ───────────────────────────────────────────────────────────────────
  function handleUndo(gameId: string) {
    startTransition(async () => {
      const result = await undoGameAction("full", gameId);
      setUndoQueue((q) => q.filter((e) => e.gameId !== gameId));
      if ("error" in result) { setError(result.error); return; }
      setUndoMessage("Game undone.");
      if (undoMessageTimerRef.current) clearTimeout(undoMessageTimerRef.current);
      undoMessageTimerRef.current = setTimeout(() => setUndoMessage(null), 2000);
      scheduleRefresh();
    });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function submit(force: boolean) {
    if (!teamsComplete || !scoreEntered) return;

    if (!force && isShutout() && !shutoutArmed) {
      setShutoutArmed(true);
      shutoutTimerRef.current = setTimeout(() => {
        setShutoutArmed(false);
        shutoutTimerRef.current = null;
      }, 8_000);
      return;
    }
    disarmShutout();

    const selErr = validateSelection();
    const scErr = validateScores();
    if (selErr || scErr) { setError(selErr ?? scErr ?? ""); return; }

    if (!force && checkSuspiciousScore() && !scoreWarningArmed) {
      setScoreWarningArmed(true);
      return;
    }
    setScoreWarningArmed(false);

    setError("");
    setPossibleDup(null);

    startTransition(async () => {
      const result = await recordGameAction(
        "full",
        sessionId, joinCode,
        teamAIds, teamBIds,
        parseInt(scoreA, 10),
        parseInt(scoreB, 10),
        force
      );

      if (!result) return;

      if ("possibleDuplicate" in result && result.possibleDuplicate) {
        setPossibleDup({ existingGameId: result.existingGameId, existingCreatedAt: result.existingCreatedAt });
        return;
      }

      if ("error" in result) { setError(result.error); return; }

      if ("success" in result) {
        setSelectedPlayers([]);
        setScoreA(""); setScoreB("");
        setError(""); setPossibleDup(null);
        const expiresAt = new Date(result.undoExpiresAt).getTime();
        setUndoQueue((q) => [...q, { gameId: result.gameId, expiresAt }]);
        scheduleRefresh();
      }
    });
  }

  // ── CTA label ──────────────────────────────────────────────────────────────
  const ctaLabel = isPending
    ? "Saving\u2026"
    : shutoutArmed
    ? "Confirm Shutout"
    : selectedPlayers.length < totalNeeded
    ? `Select ${totalNeeded} players`
    : !scoreEntered
    ? "Enter score"
    : "Record Game";

  // ── Undo snackbar state ────────────────────────────────────────────────────
  const latestUndo = undoQueue.length > 0 ? undoQueue[undoQueue.length - 1] : null;
  const undoCountdown = latestUndo ? Math.max(0, Math.ceil((latestUndo.expiresAt - Date.now()) / 1000)) : 0;
  void undoTick;

  // ── Confirmation chips (shown when teams + scores ready) ───────────────────
  function renderConfirmationChips() {
    if (!teamsComplete || !scoreEntered) return null;

    const aScore = isNaN(scoreANum) ? "\u2013" : scoreA;
    const bScore = isNaN(scoreBNum) ? "\u2013" : scoreB;
    const aIsWinner = winnerTeam === "A";
    const bIsWinner = winnerTeam === "B";

    const chipA = aIsWinner ? "bg-emerald-50 border-emerald-200" : bIsWinner ? "bg-amber-50 border-amber-200/70" : "bg-gray-50 border-gray-200";
    const chipB = bIsWinner ? "bg-emerald-50 border-emerald-200" : aIsWinner ? "bg-amber-50 border-amber-200/70" : "bg-gray-50 border-gray-200";
    const labelA = aIsWinner ? "Winner" : bIsWinner ? "Loser" : null;
    const labelB = bIsWinner ? "Winner" : aIsWinner ? "Loser" : null;
    const labelClsA = aIsWinner ? "text-emerald-700" : "text-amber-700";
    const labelClsB = bIsWinner ? "text-emerald-700" : "text-amber-700";

    const aNames = teamANames.join(" / ");
    const bNames = teamBNames.join(" / ");

    return (
      <div className="flex flex-col gap-2">
        <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${chipA}`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{aNames}</p>
            {labelA && <p className={`text-xs font-medium ${labelClsA}`}>{labelA}</p>}
          </div>
          <span className={`text-lg ${aIsWinner ? "font-bold" : "font-semibold"} text-gray-900 ml-3 shrink-0`}>{aScore}</span>
        </div>
        <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${chipB}`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{bNames}</p>
            {labelB && <p className={`text-xs font-medium ${labelClsB}`}>{labelB}</p>}
          </div>
          <span className={`text-lg ${bIsWinner ? "font-bold" : "font-semibold"} text-gray-900 ml-3 shrink-0`}>{bScore}</span>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 pb-24">

      {/* ── Flow indicator ──────────────────────────────────────── */}
      <p className="text-center text-xs text-gray-400">
        Pick players &rarr; Enter score &rarr; Done
      </p>

      {/* ── Rules chip ──────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowRulePicker(!showRulePicker)}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          Game to {rules.targetPoints}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-400">
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
        {showRulePicker && (
          <div className="mt-2 flex gap-2">
            {sportConfig.targetPresets.map((tp) => {
              const isActive = tp === rules.targetPoints;
              return (
                <button
                  key={tp}
                  type="button"
                  onClick={() => handleRuleSelect(tp)}
                  disabled={isPending}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300"
                  } disabled:opacity-50`}
                >
                  {tp}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Undo confirmation ──────────────────────────────────── */}
      {undoMessage && (
        <p className="text-xs font-semibold text-green-800 rounded-lg bg-green-50 border border-green-200 px-3 py-2" role="status">
          {undoMessage}
        </p>
      )}

      {/* ── Primary instruction ─────────────────────────────────── */}
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          {!teamsComplete ? `Pick ${totalNeeded} players` : "Confirm & record"}
        </h1>
        {!teamsComplete && (
          <p className="text-sm text-gray-500">
            {sportConfig.playersPerTeam} per team &middot; {selectedPlayers.length}/{totalNeeded} selected
          </p>
        )}
      </div>

      {/* ── Player list (tap to select) ──────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {attendees.map((player) => {
          const sel = selectedPlayers.find((p) => p.id === player.id);
          const dimmed = !sel && teamsComplete;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => togglePlayer(player)}
              className={`flex items-center justify-between px-3 py-3 rounded-lg border w-full text-left transition-colors ${
                sel
                  ? sel.team === "A"
                    ? "bg-blue-50 border-blue-200"
                    : "bg-orange-50 border-orange-200"
                  : dimmed
                  ? "bg-white border-gray-100 opacity-40"
                  : "bg-white border-gray-200 hover:bg-gray-50 active:bg-gray-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                  sel?.team === "A"
                    ? "bg-blue-100 text-blue-700"
                    : sel?.team === "B"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600"
                }`}>
                  {player.code}
                </div>
                <span className={`text-sm font-medium ${sel ? "text-gray-900" : "text-gray-800"}`}>
                  {player.display_name}
                </span>
              </div>
              {sel && (
                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                  sel.team === "A" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                }`}>
                  {sel.team}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Team summary (only when 4 selected) ─────────────────── */}
      {teamsComplete && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-1">
          <p className="text-sm text-center">
            <span className="font-semibold text-blue-600">Team A:</span>{" "}
            <span className="text-gray-700">{teamANames.join(" \u2022 ")}</span>
            {teamAIds.length === 2 && (() => {
              const count = getPairCount(teamAIds[0], teamAIds[1]);
              return (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-gray-400">
                  <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
                  {count}×
                </span>
              );
            })()}
          </p>
          <p className="text-sm text-center">
            <span className="font-semibold text-orange-600">Team B:</span>{" "}
            <span className="text-gray-700">{teamBNames.join(" \u2022 ")}</span>
            {teamBIds.length === 2 && (() => {
              const count = getPairCount(teamBIds[0], teamBIds[1]);
              return (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-gray-400">
                  <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
                  {count}×
                </span>
              );
            })()}
          </p>
          {games && games.length > 0 && (() => {
            const count = getMatchupCount(teamAIds, teamBIds, games);
            return (
              <p className="flex items-center justify-center gap-1 text-[10px] text-gray-400 pt-0.5">
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
                Faced {count} time{count !== 1 ? "s" : ""} this session
              </p>
            );
          })()}
        </div>
      )}

      {/* ── Score entry (progressive — only when 4 selected) ─────── */}
      {teamsComplete && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Enter final score</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="score-a" className="block text-[10px] font-semibold text-blue-600 mb-1">
                Team A
              </label>
              <input
                id="score-a"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={0}
                max={99}
                value={scoreA}
                onChange={(e) => { setScoreA(e.target.value); setError(""); disarmShutout(); setScoreWarningArmed(false); }}
                placeholder="0"
                className="w-full rounded-lg border-2 border-blue-200 bg-blue-50 px-3 py-4 text-center text-2xl font-bold text-blue-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="score-b" className="block text-[10px] font-semibold text-orange-600 mb-1">
                Team B
              </label>
              <input
                id="score-b"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={0}
                max={99}
                value={scoreB}
                onChange={(e) => { setScoreB(e.target.value); setError(""); disarmShutout(); setScoreWarningArmed(false); }}
                placeholder="0"
                className="w-full rounded-lg border-2 border-orange-200 bg-orange-50 px-3 py-4 text-center text-2xl font-bold text-orange-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Shutout confirmation ───────────────────────────────── */}
      {shutoutArmed && !possibleDup && (
        <p className="text-xs text-red-700 font-medium rounded-lg bg-red-50 border border-red-200 px-3 py-2" role="alert">
          Score includes a 0. Tap Record again to confirm.
        </p>
      )}

      {/* ── Suspicious score warning ───────────────────────────── */}
      {scoreWarningArmed && !possibleDup && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">
            This score is greater than win by 2. Are you sure?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScoreWarningArmed(false)}
              disabled={isPending}
              className="flex-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={isPending}
              className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 active:bg-amber-800 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving\u2026" : "Record anyway"}
            </button>
          </div>
        </div>
      )}

      {/* ── Duplicate warning ──────────────────────────────────── */}
      {possibleDup && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">
            This game may have already been recorded{" "}
            <span className="font-bold">{relativeTime(possibleDup.existingCreatedAt)}</span>.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="flex-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={isPending}
              className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 active:bg-amber-800 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving\u2026" : "Record anyway"}
            </button>
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && !possibleDup && (
        <p className="text-xs text-red-600 font-medium rounded-lg bg-red-50 px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {/* ── Confirmation chips (teams + scores ready) ─────────────── */}
      {!possibleDup && renderConfirmationChips()}

      {/* ── Dynamic helper text ────────────────────────────────────── */}
      {!allReady && !possibleDup && (
        <p className="text-center text-sm text-gray-400">
          {selectedPlayers.length < totalNeeded
            ? `Select ${totalNeeded} players to start`
            : "Enter score to finish"}
        </p>
      )}

      {/* ── Primary CTA ────────────────────────────────────────────── */}
      {!possibleDup && (
        <div className="sticky bottom-0 z-10 pt-2 -mx-1 px-1 bg-gradient-to-t from-white via-white to-transparent">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={isPending}
            className="w-full py-4 rounded-xl bg-black text-white text-lg font-semibold shadow-sm transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            {ctaLabel}
          </button>
        </div>
      )}

      {/* ── Last game (low emphasis) ────────────────────────────────── */}
      {lastGameSummary && (
        <p className="text-xs text-gray-400 text-center pt-1">
          LAST: {lastGameSummary}
        </p>
      )}

      {/* ── Undo snackbar ──────────────────────────────────────────── */}
      {latestUndo && undoCountdown > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between rounded-xl bg-gray-900 px-4 py-3 shadow-lg max-w-sm mx-auto">
          <span className="text-sm font-medium text-white">Game recorded.</span>
          <button
            type="button"
            onClick={() => handleUndo(latestUndo.gameId)}
            disabled={isPending}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/30 active:bg-white/40 transition-colors disabled:opacity-50"
          >
            Undo ({undoCountdown})
          </button>
        </div>
      )}
    </div>
  );
}
