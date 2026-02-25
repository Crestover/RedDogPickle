"use client";

/**
 * RecordGameForm — Live Referee Console
 *
 * Single-view game recording form. No multi-step wizard.
 * All elements visible simultaneously: team panels, player picker,
 * score inputs, confirmation summary, and record button.
 *
 * M10.2 additions:
 *   - 8-second undo snackbar after successful game recording
 *   - Live pre-submit confirmation summary above Record button
 *   - Debounced router.refresh() — never blocks scoring flow
 *
 * Rules Chip: session-level rules (target_points + win_by) displayed
 * as a tappable chip. Tapping opens an inline picker with presets.
 * Rules persist across games (no per-game reset).
 *
 * Duplicate handling (M4.1):
 *   If the RPC finds a matching game recorded within the last 15 minutes
 *   it returns { possibleDuplicate: true, existingCreatedAt }.
 *   An inline amber warning with "X minutes ago" and two actions:
 *   Cancel (reset form) / Record anyway (force=true).
 */

import { useState, useRef, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { recordGameAction, undoGameAction } from "@/app/actions/games";
import { setSessionRulesAction } from "@/app/actions/sessions";
import type { Player } from "@/lib/types";
import type { GameRecord, PairCountEntry } from "@/lib/autoSuggest";
import { severityDotClass, getMatchupCount } from "@/lib/pairingFeedback";

interface Props {
  sessionId: string;
  joinCode: string;
  attendees: Player[];
  pairCounts?: PairCountEntry[];
  games?: GameRecord[];
  sessionRules: { targetPoints: number; winBy: number };
}

type Team = "A" | "B" | null;

interface PossibleDuplicate {
  existingGameId: string;
  existingCreatedAt: string;
}

interface UndoEntry {
  gameId: string;
  expiresAt: number; // timestamp ms — countdown derived from expiresAt - now
}

/** Rule presets for the picker. */
const RULE_PRESETS: { targetPoints: number; winBy: number; label: string }[] = [
  { targetPoints: 11, winBy: 2, label: "11 \u00B7 W2" },
  { targetPoints: 15, winBy: 1, label: "15 \u00B7 W1" },
  { targetPoints: 21, winBy: 2, label: "21 \u00B7 W2" },
];

/** Returns a human-readable relative time string, e.g. "2 minutes ago" */
function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? "s" : ""} ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
}

/** Extract first name from display_name: "Joe Smith" → "Joe" */
function firstName(displayName: string): string {
  const space = displayName.indexOf(" ");
  return space > 0 ? displayName.substring(0, space) : displayName;
}

export default function RecordGameForm({ sessionId, joinCode, attendees, pairCounts, games, sessionRules }: Props) {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [error, setError] = useState("");
  const [possibleDup, setPossibleDup] = useState<PossibleDuplicate | null>(null);
  const [isPending, startTransition] = useTransition();
  const [shutoutArmed, setShutoutArmed] = useState(false);
  const shutoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rules, setRules] = useState(sessionRules);
  const [showRulePicker, setShowRulePicker] = useState(false);

  // ── Undo queue (M10.2) ─────────────────────────────────────────────────────
  const [undoQueue, setUndoQueue] = useState<UndoEntry[]>([]);
  const [undoTick, setUndoTick] = useState(0); // forces re-render for countdown
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

  // Sync rules from server props (e.g. after router.refresh())
  useEffect(() => {
    setRules(sessionRules);
  }, [sessionRules]);

  // Undo countdown tick — 1s interval when queue is non-empty
  useEffect(() => {
    if (undoQueue.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setUndoQueue((q) => q.filter((e) => e.expiresAt > now));
      setUndoTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [undoQueue.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up timers on unmount
  useEffect(() => () => {
    if (shutoutTimerRef.current) clearTimeout(shutoutTimerRef.current);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    if (undoMessageTimerRef.current) clearTimeout(undoMessageTimerRef.current);
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getTeam(playerId: string): Team {
    if (teamA.includes(playerId)) return "A";
    if (teamB.includes(playerId)) return "B";
    return null;
  }

  /** Explicit per-row A/B toggle. Tap A or B to assign; tap again to remove. */
  function handleAssign(playerId: string, target: "A" | "B") {
    setError("");
    disarmShutout();
    const currentTeam = getTeam(playerId);

    if (currentTeam === target) {
      // Toggle off — remove from this team
      if (target === "A") setTeamA((p) => p.filter((id) => id !== playerId));
      else setTeamB((p) => p.filter((id) => id !== playerId));
      return;
    }

    // If on the other team, remove first
    if (currentTeam !== null) {
      if (currentTeam === "A") setTeamA((p) => p.filter((id) => id !== playerId));
      else setTeamB((p) => p.filter((id) => id !== playerId));
    }

    // Add to target team (if room)
    if (target === "A" && teamA.length < 2) {
      setTeamA((p) => [...p, playerId]);
    } else if (target === "B" && teamB.length < 2) {
      setTeamB((p) => [...p, playerId]);
    }
  }

  function playerCode(id: string) { return attendees.find((p) => p.id === id)?.code ?? "?"; }

  function playerFirstName(id: string): string {
    const player = attendees.find((p) => p.id === id);
    return player ? firstName(player.display_name) : "?";
  }

  /** Look up how many times two players have partnered this session. */
  function getPairCount(a: string, b: string): number {
    if (!pairCounts) return 0;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const entry = pairCounts.find((p) => {
      const pk = p.player_a_id < p.player_b_id
        ? `${p.player_a_id}:${p.player_b_id}`
        : `${p.player_b_id}:${p.player_a_id}`;
      return pk === key;
    });
    return entry?.games_together ?? 0;
  }

  /** True when one team scored 0 and the other scored >= target_points */
  function isShutout(): boolean {
    const a = parseInt(scoreA, 10), b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b)) return false;
    return Math.min(a, b) === 0 && Math.max(a, b) >= rules.targetPoints;
  }

  function disarmShutout() {
    setShutoutArmed(false);
    if (shutoutTimerRef.current) { clearTimeout(shutoutTimerRef.current); shutoutTimerRef.current = null; }
  }

  // ── Rules Chip handler ──────────────────────────────────────────────────────
  function handleRuleSelect(targetPoints: number, winBy: number) {
    setShowRulePicker(false);
    if (targetPoints === rules.targetPoints && winBy === rules.winBy) return;

    // Optimistic update
    setRules({ targetPoints, winBy });

    startTransition(async () => {
      const result = await setSessionRulesAction(sessionId, targetPoints, winBy);
      if ("error" in result) {
        setError(result.error);
        setRules(sessionRules); // revert
      } else {
        router.refresh();
      }
    });
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validateSelection(): string | null {
    if (teamA.length !== 2) return "Team A needs exactly 2 players.";
    if (teamB.length !== 2) return "Team B needs exactly 2 players.";
    return null;
  }

  function validateScores(): string | null {
    const a = parseInt(scoreA, 10);
    const b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b)) return "Enter scores for both teams.";
    if (a < 0 || b < 0) return "Scores cannot be negative.";
    if (a === b) return "Scores cannot be equal.";
    const w = Math.max(a, b);
    const l = Math.min(a, b);
    if (w < rules.targetPoints) return `Winning score must be at least ${rules.targetPoints} (got ${w}).`;
    if (w - l < rules.winBy) return `Winning margin must be at least ${rules.winBy} (got ${w - l}).`;
    return null;
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function handleReset() {
    setTeamA([]); setTeamB([]);
    setScoreA(""); setScoreB(""); setError(""); setPossibleDup(null);
    disarmShutout();
  }

  // ── Undo handler ───────────────────────────────────────────────────────────
  function handleUndo(gameId: string) {
    startTransition(async () => {
      const result = await undoGameAction(gameId);

      // Remove from queue regardless of outcome
      setUndoQueue((q) => q.filter((e) => e.gameId !== gameId));

      if ("error" in result) {
        setError(result.error);
        return;
      }

      // Show brief confirmation
      setUndoMessage("Game undone.");
      if (undoMessageTimerRef.current) clearTimeout(undoMessageTimerRef.current);
      undoMessageTimerRef.current = setTimeout(() => setUndoMessage(null), 2000);

      scheduleRefresh();
    });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function submit(force: boolean) {
    // Shutout guard — arm on first tap, submit on second tap
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

    setError("");
    setPossibleDup(null);

    startTransition(async () => {
      const result = await recordGameAction(
        sessionId, joinCode,
        teamA, teamB,
        parseInt(scoreA, 10),
        parseInt(scoreB, 10),
        force
      );

      if (!result) return;

      if ("possibleDuplicate" in result && result.possibleDuplicate) {
        setPossibleDup({
          existingGameId:    result.existingGameId,
          existingCreatedAt: result.existingCreatedAt,
        });
        return;
      }

      if ("error" in result) {
        setError(result.error);
        return;
      }

      // Success — reset form instantly, push to undo queue, debounced refresh
      if ("success" in result) {
        // Instant form reset (non-blocking — allows next entry immediately)
        setTeamA([]); setTeamB([]);
        setScoreA(""); setScoreB("");
        setError(""); setPossibleDup(null);

        // Push undo entry with server-provided expiration
        const expiresAt = new Date(result.undoExpiresAt).getTime();
        setUndoQueue((q) => [...q, { gameId: result.gameId, expiresAt }]);

        // Debounced refresh — does not block scoring flow
        scheduleRefresh();
      }
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const scoreANum = parseInt(scoreA, 10);
  const scoreBNum = parseInt(scoreB, 10);
  const winnerTeam =
    !isNaN(scoreANum) && !isNaN(scoreBNum) && scoreANum !== scoreBNum
      ? scoreANum > scoreBNum ? "A" : "B"
      : null;
  const teamsComplete = teamA.length === 2 && teamB.length === 2;
  const allReady = teamsComplete && !isNaN(scoreANum) && !isNaN(scoreBNum);
  const teamAFull = teamA.length >= 2;
  const teamBFull = teamB.length >= 2;

  // Latest undoable game for snackbar display
  const latestUndo = undoQueue.length > 0 ? undoQueue[undoQueue.length - 1] : null;
  const undoCountdown = latestUndo ? Math.max(0, Math.ceil((latestUndo.expiresAt - Date.now()) / 1000)) : 0;
  // Suppress unused var lint — undoTick forces re-render for countdown
  void undoTick;

  // ── Confirmation Summary ───────────────────────────────────────────────────
  function renderConfirmationSummary() {
    if (!teamsComplete) {
      return (
        <p className="text-xs text-gray-400 text-center px-3 py-2">
          Select both teams to preview result
        </p>
      );
    }

    const aNames = teamA.map(playerFirstName).join(" / ");
    const bNames = teamB.map(playerFirstName).join(" / ");
    const aScore = isNaN(scoreANum) ? "\u2013" : scoreA;
    const bScore = isNaN(scoreBNum) ? "\u2013" : scoreB;

    // Winner determinable: both scores present + not tied
    if (winnerTeam) {
      const winNames = winnerTeam === "A" ? aNames : bNames;
      const winScore = winnerTeam === "A" ? aScore : bScore;
      const loseNames = winnerTeam === "A" ? bNames : aNames;
      const loseScore = winnerTeam === "A" ? bScore : aScore;
      return (
        <p className="text-sm font-semibold text-gray-900 text-center truncate px-3 py-2">
          {winNames} {winScore} <span className="text-gray-400 font-normal">def.</span> {loseNames} {loseScore}
        </p>
      );
    }

    // Neutral format: incomplete or tied
    return (
      <p className="text-sm font-semibold text-gray-900 text-center truncate px-3 py-2">
        {aNames} {aScore} <span className="text-gray-400 font-normal">&ndash;</span> {bNames} {bScore}
      </p>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SINGLE-VIEW RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`space-y-3${teamsComplete ? " pb-20" : ""}`}>
      {/* ── Rules Chip ──────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowRulePicker(!showRulePicker)}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          {rules.targetPoints} &middot; win by {rules.winBy}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-400">
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
        <p className="text-xs text-gray-400 leading-tight mt-1">
          Set points + win-by rules for this session.
        </p>

        {/* Rule picker dropdown */}
        {showRulePicker && (
          <div className="mt-2 flex gap-2">
            {RULE_PRESETS.map((preset) => {
              const isActive = preset.targetPoints === rules.targetPoints && preset.winBy === rules.winBy;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleRuleSelect(preset.targetPoints, preset.winBy)}
                  disabled={isPending}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300"
                  } disabled:opacity-50`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Undo confirmation message ─────────────────────────── */}
      {undoMessage && (
        <p className="text-xs font-semibold text-green-800 rounded-lg bg-green-50 border border-green-200 px-3 py-2" role="status">
          {undoMessage}
        </p>
      )}

      {/* ── Team Panels (read-only summary) ──────────────────── */}
      <div className="flex gap-2">
        {/* Team A panel */}
        <div className="flex-1 rounded-lg px-3 py-2 bg-white border border-gray-200">
          <p className="text-xs font-semibold text-blue-600 mb-0.5">
            Team A ({teamA.length}/2)
          </p>
          {teamA.length === 0
            ? <p className="text-[10px] text-gray-400">Select below</p>
            : <p className="text-xs font-mono text-gray-700">{teamA.map(playerCode).join(" \u00B7 ")}</p>
          }
          {teamA.length === 2 && (() => {
            const count = getPairCount(teamA[0], teamA[1]);
            return (
              <p className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
                Together: {count}
              </p>
            );
          })()}
        </div>

        {/* Team B panel */}
        <div className="flex-1 rounded-lg px-3 py-2 bg-white border border-gray-200">
          <p className="text-xs font-semibold text-orange-600 mb-0.5">
            Team B ({teamB.length}/2)
          </p>
          {teamB.length === 0
            ? <p className="text-[10px] text-gray-400">Select below</p>
            : <p className="text-xs font-mono text-gray-700">{teamB.map(playerCode).join(" \u00B7 ")}</p>
          }
          {teamB.length === 2 && (() => {
            const count = getPairCount(teamB[0], teamB[1]);
            return (
              <p className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
                Together: {count}
              </p>
            );
          })()}
        </div>
      </div>

      {/* ── Opponent matchup feedback ──────────────────────────── */}
      {teamsComplete && games && games.length > 0 && (() => {
        const count = getMatchupCount(teamA, teamB, games);
        return (
          <p className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
            Faced each other: {count} time{count !== 1 ? "s" : ""}
          </p>
        );
      })()}

      {/* ── Player Picker (scrollable, with per-row A/B buttons) ── */}
      <div className="overflow-y-auto rounded-lg" style={{ maxHeight: "45vh" }}>
        <div className="flex flex-col gap-1">
          {attendees.map((player) => {
            const team = getTeam(player.id);
            const onA = team === "A";
            const onB = team === "B";
            return (
              <div
                key={player.id}
                className={`flex items-center gap-2 rounded-lg px-3 min-h-[44px] transition-colors ${
                  team !== null
                    ? "bg-gray-50"
                    : "bg-white border border-gray-200"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold font-mono ${
                  onA ? "bg-blue-100 text-blue-700"
                  : onB ? "bg-orange-100 text-orange-700"
                  : "bg-gray-100 text-gray-600"
                }`}>
                  {player.code}
                </span>
                <span className={`flex-1 text-sm font-medium truncate ${team !== null ? "text-gray-400" : "text-gray-900"}`}>
                  {player.display_name}
                </span>
                <button
                  type="button"
                  onClick={() => handleAssign(player.id, "A")}
                  disabled={!onA && teamAFull}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold transition-colors ${
                    onA
                      ? "bg-blue-600 text-white"
                      : !onA && teamAFull
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200"
                  }`}
                >
                  A
                </button>
                <button
                  type="button"
                  onClick={() => handleAssign(player.id, "B")}
                  disabled={!onB && teamBFull}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold transition-colors ${
                    onB
                      ? "bg-orange-600 text-white"
                      : !onB && teamBFull
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : "bg-orange-50 text-orange-600 hover:bg-orange-100 active:bg-orange-200"
                  }`}
                >
                  B
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Score Inputs ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="score-a" className="block text-[10px] font-semibold text-blue-600 mb-1">
            Team A Score
          </label>
          <input
            id="score-a" type="number" inputMode="numeric" pattern="[0-9]*"
            min={0} max={99} value={scoreA}
            onChange={(e) => { setScoreA(e.target.value); setError(""); disarmShutout(); }}
            placeholder="0"
            className="w-full rounded-lg border-2 border-blue-200 bg-blue-50 px-3 py-3 text-center text-2xl font-bold text-blue-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="score-b" className="block text-[10px] font-semibold text-orange-600 mb-1">
            Team B Score
          </label>
          <input
            id="score-b" type="number" inputMode="numeric" pattern="[0-9]*"
            min={0} max={99} value={scoreB}
            onChange={(e) => { setScoreB(e.target.value); setError(""); disarmShutout(); }}
            placeholder="0"
            className="w-full rounded-lg border-2 border-orange-200 bg-orange-50 px-3 py-3 text-center text-2xl font-bold text-orange-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* ── Shutout confirmation banner ────────────────────────── */}
      {shutoutArmed && !possibleDup && (
        <p
          className="text-xs text-red-700 font-medium rounded-lg bg-red-50 border border-red-200 px-3 py-2"
          role="alert"
        >
          Score includes a 0. Tap Record again to confirm.
        </p>
      )}

      {/* ── Possible-duplicate warning banner ──────────────────── */}
      {possibleDup && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 space-y-2"
        >
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

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && !possibleDup && (
        <p className="text-xs text-red-600 font-medium rounded-lg bg-red-50 px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {/* ── Confirmation Summary (M10.2) ──────────────────────── */}
      {!possibleDup && (
        <div className="rounded-lg bg-gray-50">
          {renderConfirmationSummary()}
        </div>
      )}

      {/* ── Record Button (sticky when teams complete) ─────────── */}
      {!possibleDup && (
        <div className={teamsComplete ? "sticky bottom-0 z-10 pt-2 -mx-1 px-1 bg-gradient-to-t from-white via-white to-transparent" : ""}>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={isPending}
            className={`flex w-full items-center justify-center rounded-xl px-4 py-4 text-base font-semibold shadow-sm transition-colors min-h-[56px] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              allReady
                ? "bg-green-600 text-white hover:bg-green-700 active:bg-green-800"
                : "bg-gray-200 text-gray-500"
            }`}
          >
            {isPending ? "Saving\u2026" : shutoutArmed ? "Confirm Shutout" : "Record Game"}
          </button>
        </div>
      )}

      {/* ── Undo Snackbar (M10.2) ─────────────────────────────── */}
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
