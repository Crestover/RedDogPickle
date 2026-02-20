"use client";

/**
 * RecordGameForm
 *
 * Mobile-first game recording form. State machine:
 *   "select" → user picks 4 players (2 per team) from attendee list
 *   "scores" → user enters Team A score and Team B score
 *   "confirm" → user reviews and submits
 *
 * Constraints enforced client-side (also enforced in record_game RPC):
 *   - Exactly 2 players per team
 *   - No player on both teams
 *   - Winner score >= 11
 *   - Winner - loser >= 2
 *   - Scores not equal
 */

import { useState, useTransition } from "react";
import { recordGameAction } from "@/app/actions/games";

interface Player {
  id: string;
  display_name: string;
  code: string;
}

interface Props {
  sessionId: string;
  joinCode: string;
  attendees: Player[];
}

type Step = "select" | "scores" | "confirm";
type Team = "A" | "B" | null;

export default function RecordGameForm({
  sessionId,
  joinCode,
  attendees,
}: Props) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("select");
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getTeam(playerId: string): Team {
    if (teamA.includes(playerId)) return "A";
    if (teamB.includes(playerId)) return "B";
    return null;
  }

  function togglePlayer(playerId: string, targetTeam: "A" | "B") {
    setError("");
    const currentTeam = getTeam(playerId);

    if (currentTeam === targetTeam) {
      // Deselect from this team
      if (targetTeam === "A") setTeamA((prev) => prev.filter((id) => id !== playerId));
      else setTeamB((prev) => prev.filter((id) => id !== playerId));
      return;
    }

    if (currentTeam !== null) {
      // Move: remove from current team first
      if (currentTeam === "A") setTeamA((prev) => prev.filter((id) => id !== playerId));
      else setTeamB((prev) => prev.filter((id) => id !== playerId));
    }

    // Add to target team (max 2)
    if (targetTeam === "A") {
      setTeamA((prev) => (prev.length < 2 ? [...prev, playerId] : prev));
    } else {
      setTeamB((prev) => (prev.length < 2 ? [...prev, playerId] : prev));
    }
  }

  function playerName(id: string) {
    return attendees.find((p) => p.id === id)?.display_name ?? id;
  }

  function playerCode(id: string) {
    return attendees.find((p) => p.id === id)?.code ?? "?";
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
    const winner = Math.max(a, b);
    const loser = Math.min(a, b);
    if (winner < 11) return `Winning score must be at least 11 (got ${winner}).`;
    if (winner - loser < 2) return `Winning margin must be at least 2 (got ${winner - loser}).`;
    return null;
  }

  // ── Step transitions ───────────────────────────────────────────────────────
  function handleNextFromSelect() {
    const err = validateSelection();
    if (err) { setError(err); return; }
    setError("");
    setStep("scores");
  }

  function handleNextFromScores() {
    const err = validateScores();
    if (err) { setError(err); return; }
    setError("");
    setStep("confirm");
  }

  function handleBack() {
    setError("");
    setStep((prev) => (prev === "confirm" ? "scores" : "select"));
  }

  function handleReset() {
    setStep("select");
    setTeamA([]);
    setTeamB([]);
    setScoreA("");
    setScoreB("");
    setError("");
  }

  function handleSubmit() {
    const selErr = validateSelection();
    const scErr = validateScores();
    if (selErr || scErr) { setError(selErr ?? scErr ?? ""); return; }

    setError("");
    startTransition(async () => {
      const result = await recordGameAction(
        sessionId,
        joinCode,
        teamA,
        teamB,
        parseInt(scoreA, 10),
        parseInt(scoreB, 10)
      );
      if (result?.error) {
        setError(result.error);
        // On duplicate, stay on confirm so user can see the message
        if (!result.duplicate) setStep("select");
      }
      // On success the action redirects — no further handling needed.
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const scoreANum = parseInt(scoreA, 10);
  const scoreBNum = parseInt(scoreB, 10);
  const winnerTeam =
    !isNaN(scoreANum) && !isNaN(scoreBNum) && scoreANum !== scoreBNum
      ? scoreANum > scoreBNum ? "A" : "B"
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  // ── Step 1: Select players ─────────────────────────────────────────────────
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
                  team === "A"
                    ? "border-blue-400 bg-blue-50"
                    : team === "B"
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                {/* Code badge */}
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold font-mono ${
                    team === "A"
                      ? "bg-blue-200 text-blue-900"
                      : team === "B"
                      ? "bg-orange-200 text-orange-900"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {player.code}
                </span>

                {/* Name */}
                <span className="flex-1 font-medium text-gray-900 text-sm">
                  {player.display_name}
                </span>

                {/* Team A button */}
                <button
                  type="button"
                  onClick={() => togglePlayer(player.id, "A")}
                  aria-label={`${team === "A" ? "Remove from" : "Add to"} Team A`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px] ${
                    team === "A"
                      ? "bg-blue-500 text-white"
                      : teamA.length >= 2
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                  disabled={team !== "A" && teamA.length >= 2}
                >
                  A
                </button>

                {/* Team B button */}
                <button
                  type="button"
                  onClick={() => togglePlayer(player.id, "B")}
                  aria-label={`${team === "B" ? "Remove from" : "Add to"} Team B`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px] ${
                    team === "B"
                      ? "bg-orange-500 text-white"
                      : teamB.length >= 2
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                  }`}
                  disabled={team !== "B" && teamB.length >= 2}
                >
                  B
                </button>
              </div>
            );
          })}
        </div>

        {/* Team summary pills */}
        <div className="flex gap-3 text-xs">
          <div className="flex-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <p className="font-semibold text-blue-700 mb-1">Team A ({teamA.length}/2)</p>
            {teamA.length === 0 ? (
              <p className="text-blue-400">None selected</p>
            ) : (
              teamA.map((id) => (
                <p key={id} className="text-blue-800 font-mono">{playerCode(id)} {playerName(id)}</p>
              ))
            )}
          </div>
          <div className="flex-1 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
            <p className="font-semibold text-orange-700 mb-1">Team B ({teamB.length}/2)</p>
            {teamB.length === 0 ? (
              <p className="text-orange-400">None selected</p>
            ) : (
              teamB.map((id) => (
                <p key={id} className="text-orange-800 font-mono">{playerCode(id)} {playerName(id)}</p>
              ))
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 font-medium" role="alert">{error}</p>
        )}

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

  // ── Step 2: Enter scores ───────────────────────────────────────────────────
  if (step === "scores") {
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
          Record Game — Scores
        </h2>

        {/* Team summaries */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-xs font-semibold text-blue-600 mb-1">Team A</p>
            {teamA.map((id) => (
              <p key={id} className="text-sm font-medium text-blue-900">
                <span className="font-mono text-xs mr-1">{playerCode(id)}</span>
                {playerName(id)}
              </p>
            ))}
          </div>
          <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
            <p className="text-xs font-semibold text-orange-600 mb-1">Team B</p>
            {teamB.map((id) => (
              <p key={id} className="text-sm font-medium text-orange-900">
                <span className="font-mono text-xs mr-1">{playerCode(id)}</span>
                {playerName(id)}
              </p>
            ))}
          </div>
        </div>

        {/* Score inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="score-a" className="block text-xs font-semibold text-blue-600 mb-1">
              Team A Score
            </label>
            <input
              id="score-a"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={0}
              max={99}
              value={scoreA}
              onChange={(e) => { setScoreA(e.target.value); setError(""); }}
              placeholder="0"
              className="w-full rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-4 text-center text-2xl font-bold text-blue-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[64px]"
            />
          </div>
          <div>
            <label htmlFor="score-b" className="block text-xs font-semibold text-orange-600 mb-1">
              Team B Score
            </label>
            <input
              id="score-b"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={0}
              max={99}
              value={scoreB}
              onChange={(e) => { setScoreB(e.target.value); setError(""); }}
              placeholder="0"
              className="w-full rounded-xl border-2 border-orange-200 bg-orange-50 px-4 py-4 text-center text-2xl font-bold text-orange-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[64px]"
            />
          </div>
        </div>

        {/* Live winner preview */}
        {winnerTeam && (
          <p className="text-center text-sm font-semibold text-green-700 bg-green-50 rounded-lg px-3 py-2">
            🏆 Team {winnerTeam} wins {winnerTeam === "A" ? scoreA : scoreB}–{winnerTeam === "A" ? scoreB : scoreA}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 font-medium" role="alert">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[56px]"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleNextFromScores}
            className="flex-[2] rounded-xl bg-green-600 px-4 py-4 text-base font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors min-h-[56px] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Review →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Confirm ────────────────────────────────────────────────────────
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
                <span className="font-mono text-xs text-gray-500 mr-1">{playerCode(id)}</span>
                {playerName(id)}
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
                <span className="font-mono text-xs text-gray-500 mr-1">{playerCode(id)}</span>
                {playerName(id)}
              </p>
            ))}
            <p className="text-3xl font-bold text-orange-800 mt-2">{scoreB}</p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium rounded-lg bg-red-50 px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors min-h-[64px] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Saving…" : "✅ Save Game"}
      </button>

      {!isPending && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[48px]"
          >
            ← Edit Scores
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[48px]"
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
