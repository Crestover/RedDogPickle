"use server";

import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";

/**
 * Server Action: recordGameAction
 *
 * Delegates to the record_game Postgres RPC (SECURITY DEFINER), which:
 *   1. Validates session is active
 *   2. Validates player counts, no overlap, all attendees
 *   3. Validates scores (winner >= 11, winner - loser >= 2, not equal)
 *   4. Computes a deterministic fingerprint (SHA-256, order-insensitive
 *      within and across teams) — NO time bucket
 *   5. If force=false: checks for a matching game created within 15 min
 *      — returns possible_duplicate if found (no insert)
 *   6. If force=true or no recent match: inserts games + game_players
 *      atomically, returns inserted
 *
 * Return shapes:
 *   - redirect (Next.js throw)      — game inserted successfully
 *   - { possibleDuplicate: true, existingGameId, existingCreatedAt }
 *                                   — warn UI to show confirm prompt
 *   - { error: string }             — validation or unexpected error
 */

export type RecordGameResult =
  | { error: string }
  | { possibleDuplicate: true; existingGameId: string; existingCreatedAt: string }
  | never; // redirect

export async function recordGameAction(
  sessionId: string,
  joinCode: string,
  teamAIds: string[],
  teamBIds: string[],
  teamAScore: number,
  teamBScore: number,
  force = false
): Promise<RecordGameResult> {
  // ── Pre-flight validation (also enforced in RPC) ──────────────────────────
  if (teamAIds.length !== 2 || teamBIds.length !== 2) {
    return { error: "Each team must have exactly 2 players." };
  }

  const overlap = teamAIds.filter((id) => teamBIds.includes(id));
  if (overlap.length > 0) {
    return { error: "A player cannot be on both teams." };
  }

  const winner = Math.max(teamAScore, teamBScore);
  const loser = Math.min(teamAScore, teamBScore);

  if (teamAScore === teamBScore) {
    return { error: "Scores cannot be equal." };
  }
  if (winner < 11) {
    return { error: `Winning score must be at least 11 (got ${winner}).` };
  }
  if (winner - loser < 2) {
    return { error: `Winning margin must be at least 2 (got ${winner - loser}).` };
  }

  const supabase = getServerClient();

  const { data, error } = await supabase.rpc(RPC.RECORD_GAME, {
    p_session_id:   sessionId,
    p_team_a_ids:   teamAIds,
    p_team_b_ids:   teamBIds,
    p_team_a_score: teamAScore,
    p_team_b_score: teamBScore,
    p_force:        force,
  });

  if (error) {
    console.error("[recordGameAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to record game." };
  }

  // RPC returns jsonb — Supabase JS deserialises it as a plain object
  const result = data as {
    status: "inserted" | "possible_duplicate";
    game_id?: string;
    existing_game_id?: string;
    existing_created_at?: string;
  };

  if (result.status === "possible_duplicate") {
    return {
      possibleDuplicate: true,
      existingGameId:    result.existing_game_id!,
      existingCreatedAt: result.existing_created_at!,
    };
  }

  // Fire-and-forget: apply Elo ratings. If this fails the game is still saved.
  if (result.game_id) {
    void Promise.resolve(supabase.rpc(RPC.APPLY_RATINGS_FOR_GAME, { p_game_id: result.game_id }))
      .then(({ error: eloErr }) => { if (eloErr) console.error("[recordGameAction] Elo RPC failed (non-blocking):", eloErr); })
      .catch((err) => console.error("[recordGameAction] Elo RPC failed (non-blocking):", err));
  }

  // status === "inserted" — redirect to session page so Server Component
  // re-fetches the updated game list
  redirect(`/g/${joinCode}/session/${sessionId}`);
}

// ─────────────────────────────────────────────────────────────
// voidLastGameAction
//
// Called from the VoidLastGameButton.
// Delegates to void_last_game RPC (SECURITY DEFINER), then
// recomputes session-scoped Elo ratings (non-fatal if that fails).
// On success: redirects to the session page (or courts page).
// On error:   returns { error: string }
// ─────────────────────────────────────────────────────────────

export async function voidLastGameAction(
  sessionId: string,
  joinCode: string,
  redirectPath?: string
): Promise<{ error: string } | never> {
  const supabase = getServerClient();

  const { data, error } = await supabase.rpc(RPC.VOID_LAST_GAME, {
    p_session_id: sessionId,
    p_reason: "voided by user",
  });

  if (error) {
    console.error("[voidLastGameAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to void game." };
  }

  const result = data as { status: string; game_id?: string; sequence_num?: number };

  if (result.status === "no_game_found") {
    return { error: "No games to void in this session." };
  }

  // Recompute session-scoped Elo ratings (awaited but non-fatal).
  try {
    const { error: recomputeErr } = await supabase.rpc(
      RPC.RECOMPUTE_SESSION_RATINGS,
      { p_session_id: sessionId }
    );
    if (recomputeErr) {
      console.error("[voidLastGameAction] Elo recompute failed (non-fatal):", recomputeErr.message);
    }
  } catch (err) {
    console.error("[voidLastGameAction] Elo recompute exception (non-fatal):", err);
  }

  const target = redirectPath ?? `/g/${joinCode}/session/${sessionId}`;
  redirect(target);
}
