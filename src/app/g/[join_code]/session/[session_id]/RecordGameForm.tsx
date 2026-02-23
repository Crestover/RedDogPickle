"use client";

/**
 * RecordGameForm — Live Referee Console
 *
 * Single-view game recording form. No multi-step wizard.
 * All elements visible simultaneously: team panels, player picker,
 * score inputs, and record button.
 *
 * Explicit A/B selection:
 *   Each player row has A and B buttons for direct team assignment.
 *   One tap to assign, same tap to toggle off.
 *   Buttons disable when the target team is full.
 *
 * Duplicate handling (M4.1):
 *   If the RPC finds a matching game recorded within the last 15 minutes
 *   it returns { possibleDuplicate: true, existingCreatedAt }.
 *   An inline amber warning with "X minutes ago" and two actions:
 *   Cancel (reset form) / Record anyway (force=true).
 */

import { useState, useRef, useEffect, useTransition } from "react";
import { recordGameAction } from "@/app/actions/games";
import type { Player } from "@/lib/types";
import type { GameRecord, PairCountEntry } from "@/lib/autoSuggest";
import { severityDotClass, getMatchupCount } from "@/lib/pairingFeedback";

interface Props {
  sessionId: string;
  joinCode: string;
  attendees: Player[];
  pairCounts?: PairCountEntry[];
  games?: GameRecord[];
}

type Team = "A" | "B" | null;

interface PossibleDuplicate {
  existingGameId: string;
  existingCreatedAt: string;
}

/** Returns a human-readable relative time string, e.g. "2 minutes ago" */
function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? "s" : ""} ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
}

export default function RecordGameForm({ sessionId, joinCode, attendees, pairCounts, games }: Props) {
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

  // Clean up shutout timer on unmount
  useEffect(() => () => {
    if (shutoutTimerRef.current) clearTimeout(shutoutTimerRef.current);
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

  /** True when one team scored 0 and the other scored ≥ 11 */
  function isShutout(): boolean {
    const a = parseInt(scoreA, 10), b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b)) return false;
    return Math.min(a, b) === 0 && Math.max(a, b) >= 11;
  }

  function disarmShutout() {
    setShutoutArmed(false);
    if (shutoutTimerRef.current) { clearTimeout(shutoutTimerRef.current); shutoutTimerRef.current = null; }
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
    if (w < 11) return `Winning score must be at least 11 (got ${w}).`;
    if (w - l < 2) return `Winning margin must be at least 2 (got ${w - l}).`;
    return null;
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function handleReset() {
    setTeamA([]); setTeamB([]);
    setScoreA(""); setScoreB(""); setError(""); setPossibleDup(null);
    disarmShutout();
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

      if (!result) return; // redirect — no further handling

      if ("possibleDuplicate" in result && result.possibleDuplicate) {
        setPossibleDup({
          existingGameId:    result.existingGameId,
          existingCreatedAt: result.existingCreatedAt,
        });
        return;
      }

      if ("error" in result) {
        setError(result.error);
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

  // ══════════════════════════════════════════════════════════════════════════
  // SINGLE-VIEW RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`space-y-3${teamsComplete ? " pb-20" : ""}`}>
      {/* ── Team Panels (read-only summary) ──────────────────── */}
      <div className="flex gap-2">
        {/* Team A panel */}
        <div className="flex-1 rounded-lg px-3 py-2 bg-white border border-gray-200">
          <p className="text-xs font-semibold text-blue-600 mb-0.5">
            Team A ({teamA.length}/2)
          </p>
          {teamA.length === 0
            ? <p className="text-[10px] text-gray-400">Select below</p>
            : <p className="text-xs font-mono text-gray-700">{teamA.map(playerCode).join(" · ")}</p>
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
            : <p className="text-xs font-mono text-gray-700">{teamB.map(playerCode).join(" · ")}</p>
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

      {/* Winner indicator */}
      {winnerTeam && (
        <p className="text-center text-xs font-semibold text-green-700">
          Team {winnerTeam} wins {winnerTeam === "A" ? scoreA : scoreB}&ndash;{winnerTeam === "A" ? scoreB : scoreA}
        </p>
      )}

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
    </div>
  );
}
