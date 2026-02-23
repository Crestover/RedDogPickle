"use client";

/**
 * RecordGameForm
 *
 * Mobile-first game recording form. State machine:
 *   "select"  → pick 4 players (2 per team) from attendee list
 *   "scores"  → enter Team A score and Team B score
 *   "confirm" → review and submit
 *
 * Duplicate handling (M4.1):
 *   If the RPC finds a matching game recorded within the last 15 minutes
 *   it returns { possibleDuplicate: true, existingCreatedAt }.
 *   The confirm step shows an amber warning banner with "X minutes ago"
 *   and two actions: Cancel (reset form) / Record anyway (force=true).
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

type Step = "select" | "scores" | "confirm";
type Team = "A" | "B" | null;

interface PossibleDuplicate {
  existingGameId: string;
  existingCreatedAt: string; // ISO string from DB
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
  const [step, setStep] = useState<Step>("select");
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

  function togglePlayer(playerId: string, targetTeam: "A" | "B") {
    setError("");
    disarmShutout();
    const currentTeam = getTeam(playerId);

    if (currentTeam === targetTeam) {
      if (targetTeam === "A") setTeamA((p) => p.filter((id) => id !== playerId));
      else setTeamB((p) => p.filter((id) => id !== playerId));
      return;
    }

    if (currentTeam !== null) {
      if (currentTeam === "A") setTeamA((p) => p.filter((id) => id !== playerId));
      else setTeamB((p) => p.filter((id) => id !== playerId));
    }

    if (targetTeam === "A") setTeamA((p) => (p.length < 2 ? [...p, playerId] : p));
    else setTeamB((p) => (p.length < 2 ? [...p, playerId] : p));
  }

  function playerName(id: string) { return attendees.find((p) => p.id === id)?.display_name ?? id; }
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

  // ── Step transitions ───────────────────────────────────────────────────────
  function handleNextFromSelect() {
    const err = validateSelection();
    if (err) { setError(err); return; }
    setError(""); setStep("scores");
  }

  function handleNextFromScores() {
    const err = validateScores();
    if (err) { setError(err); return; }
    setError(""); setStep("confirm");
  }

  function handleBack() {
    setError("");
    setPossibleDup(null);
    disarmShutout();
    setStep((prev) => (prev === "confirm" ? "scores" : "select"));
  }

  function handleReset() {
    setStep("select"); setTeamA([]); setTeamB([]);
    setScoreA(""); setScoreB(""); setError(""); setPossibleDup(null);
    disarmShutout();
  }

  /** Submit with force=false (normal path) or force=true (override duplicate) */
  function submit(force: boolean) {
    // Shutout guard — arm on first tap, save on second tap
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
        // Stay on confirm step; show the amber warning
        setPossibleDup({
          existingGameId:    result.existingGameId,
          existingCreatedAt: result.existingCreatedAt,
        });
        return;
      }

      if ("error" in result) {
        setError(result.error);
        // Reset to select on non-duplicate errors (e.g. session expired)
        setStep("select");
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

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Select players
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "select") {
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
          Record Game — Pick Teams
        </h2>

        {/* Legend */}
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> Team A
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-orange-500" /> Team B
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-gray-200" /> Unassigned
          </span>
        </div>

        {/* Player rows */}
        <div className="space-y-2">
          {attendees.map((player) => {
            const team = getTeam(player.id);
            return (
              <div
                key={player.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 min-h-[56px] transition-colors ${
                  team === "A" ? "border-blue-400 bg-blue-50"
                  : team === "B" ? "border-orange-400 bg-orange-50"
                  : "border-gray-200 bg-white"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold font-mono ${
                  team === "A" ? "bg-blue-200 text-blue-900"
                  : team === "B" ? "bg-orange-200 text-orange-900"
                  : "bg-gray-100 text-gray-600"
                }`}>
                  {player.code}
                </span>
                <span className="flex-1 font-medium text-gray-900 text-sm">{player.display_name}</span>

                {/* Team A button */}
                <button
                  type="button"
                  onClick={() => togglePlayer(player.id, "A")}
                  aria-label={`${team === "A" ? "Remove from" : "Add to"} Team A`}
                  disabled={team !== "A" && teamA.length >= 2}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px] ${
                    team === "A" ? "bg-blue-500 text-white"
                    : teamA.length >= 2 ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                >A</button>

                {/* Team B button */}
                <button
                  type="button"
                  onClick={() => togglePlayer(player.id, "B")}
                  aria-label={`${team === "B" ? "Remove from" : "Add to"} Team B`}
                  disabled={team !== "B" && teamB.length >= 2}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px] ${
                    team === "B" ? "bg-orange-500 text-white"
                    : teamB.length >= 2 ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                  }`}
                >B</button>
              </div>
            );
          })}
        </div>

        {/* Team summary panels */}
        <div className="flex gap-3 text-xs">
          <div className="flex-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <p className="font-semibold text-blue-700 mb-1">Team A ({teamA.length}/2)</p>
            {teamA.length === 0 ? <p className="text-blue-400">None selected</p>
              : teamA.map((id) => <p key={id} className="text-blue-800 font-mono">{playerCode(id)} {playerName(id)}</p>)}
            {teamA.length === 2 && (() => {
              const count = getPairCount(teamA[0], teamA[1]);
              return (
                <p className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                  <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
                  Together this session: {count} game{count !== 1 ? "s" : ""}
                </p>
              );
            })()}
          </div>
          <div className="flex-1 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
            <p className="font-semibold text-orange-700 mb-1">Team B ({teamB.length}/2)</p>
            {teamB.length === 0 ? <p className="text-orange-400">None selected</p>
              : teamB.map((id) => <p key={id} className="text-orange-800 font-mono">{playerCode(id)} {playerName(id)}</p>)}
            {teamB.length === 2 && (() => {
              const count = getPairCount(teamB[0], teamB[1]);
              return (
                <p className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                  <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
                  Together this session: {count} game{count !== 1 ? "s" : ""}
                </p>
              );
            })()}
          </div>
        </div>

        {/* Opponent matchup feedback — only when all 4 players selected */}
        {teamA.length === 2 && teamB.length === 2 && games && games.length > 0 && (() => {
          const count = getMatchupCount(teamA, teamB, games);
          return (
            <p className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDotClass(count)}`} />
              Faced each other: {count} time{count !== 1 ? "s" : ""}
            </p>
          );
        })()}

        {error && <p className="text-sm text-red-600 font-medium" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleNextFromSelect}
          className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-4 text-base font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors min-h-[56px] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Next: Enter Scores →
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Scores
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "scores") {
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
          Record Game — Scores
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-xs font-semibold text-blue-600 mb-1">Team A</p>
            {teamA.map((id) => (
              <p key={id} className="text-sm font-medium text-blue-900">
                <span className="font-mono text-xs mr-1">{playerCode(id)}</span>{playerName(id)}
              </p>
            ))}
          </div>
          <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
            <p className="text-xs font-semibold text-orange-600 mb-1">Team B</p>
            {teamB.map((id) => (
              <p key={id} className="text-sm font-medium text-orange-900">
                <span className="font-mono text-xs mr-1">{playerCode(id)}</span>{playerName(id)}
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="score-a" className="block text-xs font-semibold text-blue-600 mb-1">Team A Score</label>
            <input
              id="score-a" type="number" inputMode="numeric" pattern="[0-9]*"
              min={0} max={99} value={scoreA}
              onChange={(e) => { setScoreA(e.target.value); setError(""); disarmShutout(); }}
              placeholder="0"
              className="w-full rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-4 text-center text-2xl font-bold text-blue-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[64px]"
            />
          </div>
          <div>
            <label htmlFor="score-b" className="block text-xs font-semibold text-orange-600 mb-1">Team B Score</label>
            <input
              id="score-b" type="number" inputMode="numeric" pattern="[0-9]*"
              min={0} max={99} value={scoreB}
              onChange={(e) => { setScoreB(e.target.value); setError(""); disarmShutout(); }}
              placeholder="0"
              className="w-full rounded-xl border-2 border-orange-200 bg-orange-50 px-4 py-4 text-center text-2xl font-bold text-orange-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[64px]"
            />
          </div>
        </div>

        {winnerTeam && (
          <p className="text-center text-sm font-semibold text-green-700 bg-green-50 rounded-lg px-3 py-2">
            🏆 Team {winnerTeam} wins {winnerTeam === "A" ? scoreA : scoreB}–{winnerTeam === "A" ? scoreB : scoreA}
          </p>
        )}

        {error && <p className="text-sm text-red-600 font-medium" role="alert">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={handleBack}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[56px]">
            ← Back
          </button>
          <button type="button" onClick={handleNextFromScores}
            className="flex-[2] rounded-xl bg-green-600 px-4 py-4 text-base font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors min-h-[56px] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
            Review →
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Confirm (+ possible-duplicate warning)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
        Record Game — Confirm
      </h2>

      {/* Summary card */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          <div className={`px-4 py-4 ${winnerTeam === "A" ? "bg-green-50" : ""}`}>
            <p className="text-xs font-semibold text-blue-600 mb-1 flex items-center gap-1">
              Team A {winnerTeam === "A" && <span className="text-green-600">🏆</span>}
            </p>
            {teamA.map((id) => (
              <p key={id} className="text-sm font-medium text-gray-900">
                <span className="font-mono text-xs text-gray-500 mr-1">{playerCode(id)}</span>{playerName(id)}
              </p>
            ))}
            <p className="text-3xl font-bold text-blue-800 mt-2">{scoreA}</p>
          </div>
          <div className={`px-4 py-4 ${winnerTeam === "B" ? "bg-green-50" : ""}`}>
            <p className="text-xs font-semibold text-orange-600 mb-1 flex items-center gap-1">
              Team B {winnerTeam === "B" && <span className="text-green-600">🏆</span>}
            </p>
            {teamB.map((id) => (
              <p key={id} className="text-sm font-medium text-gray-900">
                <span className="font-mono text-xs text-gray-500 mr-1">{playerCode(id)}</span>{playerName(id)}
              </p>
            ))}
            <p className="text-3xl font-bold text-orange-800 mt-2">{scoreB}</p>
          </div>
        </div>
      </div>

      {/* ── Shutout confirmation banner ─────────────────────────────────── */}
      {shutoutArmed && !possibleDup && (
        <p
          className="text-sm text-red-700 font-medium rounded-lg bg-red-50 border border-red-200 px-3 py-2"
          role="alert"
        >
          Score includes a 0. Tap Save again to confirm.
        </p>
      )}

      {/* ── Possible-duplicate warning banner ───────────────────────────── */}
      {possibleDup && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 space-y-3"
        >
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ This game may have already been recorded{" "}
            <span className="font-bold">{relativeTime(possibleDup.existingCreatedAt)}</span>.
          </p>
          <p className="text-xs text-amber-700">
            Record it again anyway? (e.g. same teams played a second game with the same score)
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="flex-1 rounded-xl border border-amber-400 bg-white px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-colors min-h-[48px] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={isPending}
              className="flex-1 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 active:bg-amber-800 transition-colors min-h-[48px] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Record anyway"}
            </button>
          </div>
        </div>
      )}

      {/* Generic error (non-duplicate) */}
      {error && !possibleDup && (
        <p className="text-sm text-red-600 font-medium rounded-lg bg-red-50 px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {/* Primary save button — hidden while duplicate warning is showing */}
      {!possibleDup && (
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={isPending}
          className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors min-h-[64px] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving…" : shutoutArmed ? "Confirm Shutout ✅" : "✅ Save Game"}
        </button>
      )}

      {!isPending && !possibleDup && (
        <div className="flex gap-3">
          <button type="button" onClick={handleBack}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[48px]">
            ← Edit Scores
          </button>
          <button type="button" onClick={handleReset}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[48px]">
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
