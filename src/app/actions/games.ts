"use server";

import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";
import type { RdrDelta } from "@/lib/types";

/**
 * Server Action: recordGameAction
 *
 * Delegates to the record_game Postgres RPC (SECURITY DEFINER), which:
 *   1. Validates session is active
 *   2. Resolves rules from session defaults (target_points, win_by)
 *   3. Validates player counts, no overlap, all attendees
 *   4. Validates scores using resolved rules
 *   5. Computes a deterministic fingerprint (includes rules)
 *   6. Duplicate check (15-min window)
 *   7. Inserts game + game_players atomically
 *   8. Computes RDR atomically (inline) + persists to game_rdr_deltas
 *
 * Return shapes:
 *   - { success: true, gameId, deltas, targetPoints, winBy } — game inserted
 *   - { possibleDuplicate: true, existingGameId, existingCreatedAt }
 *   - { error: string } — validation or unexpected error
 */

export type RecordGameResult =
  | { error: string }
  | { possibleDuplicate: true; existingGameId: string; existingCreatedAt: string }
  | { success: true; gameId: string; deltas: RdrDelta[]; targetPoints: number; winBy: number; undoExpiresAt: string };

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

  // Read session rules for pre-flight validation
  const supabase = getServerClient();
  const { data: sessionData, error: sessionErr } = await supabase
    .from("sessions")
    .select("target_points_default, win_by_default")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !sessionData) {
    return { error: "Could not read session rules." };
  }

  const targetPoints = (sessionData as { target_points_default: number }).target_points_default;
  const winBy = (sessionData as { win_by_default: number }).win_by_default;

  if (winner < targetPoints) {
    return { error: `Winning score must be at least ${targetPoints} (got ${winner}).` };
  }
  if (winner - loser < winBy) {
    return { error: `Winning margin must be at least ${winBy} (got ${winner - loser}).` };
  }

  const { data, error } = await supabase.rpc(RPC.RECORD_GAME, {
    p_session_id:   sessionId,
    p_team_a_ids:   teamAIds,
    p_team_b_ids:   teamBIds,
    p_team_a_score: teamAScore,
    p_team_b_score: teamBScore,
    p_force:        force,
    p_target_points: null, // use session defaults
  });

  if (error) {
    console.error("[recordGameAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to record game." };
  }

  // RPC returns jsonb — Supabase JS deserialises it as a plain object
  const result = data as {
    status: "inserted" | "possible_duplicate";
    game_id?: string;
    target_points?: number;
    win_by?: number;
    deltas?: { player_id: string; delta: number; rdr_after: number }[];
    undo_expires_at?: string;
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

  // status === "inserted" — return success with deltas + undo expiration
  return {
    success: true,
    gameId: result.game_id!,
    deltas: (result.deltas ?? []) as RdrDelta[],
    targetPoints: result.target_points ?? targetPoints,
    winBy: result.win_by ?? winBy,
    undoExpiresAt: result.undo_expires_at!,
  };
}

// ─────────────────────────────────────────────────────────────
// voidLastGameAction
//
// Called from the VoidLastGameButton.
// Delegates to void_last_game RPC (SECURITY DEFINER) which
// atomically reverses RDR deltas via game_rdr_deltas (LIFO).
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
  });

  if (error) {
    console.error("[voidLastGameAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to void game." };
  }

  const result = data as { status: string; voided_game_id?: string; sequence_num?: number };

  if (result.status === "no_game_found") {
    return { error: "No games to void in this session." };
  }

  const target = redirectPath ?? `/g/${joinCode}/session/${sessionId}`;
  redirect(target);
}

// ─────────────────────────────────────────────────────────────
// undoGameAction
//
// Called from the undo snackbar in RecordGameForm.
// Delegates to undo_game RPC (SECURITY DEFINER) which:
//   1. Locks game row FOR UPDATE
//   2. Validates undo window + not already voided + session active
//   3. Reverses all RDR deltas atomically
//   4. Marks game + deltas as voided (void_reason = 'undo')
//
// Idempotent-safe: concurrent calls serialized via row lock.
// ─────────────────────────────────────────────────────────────

export async function undoGameAction(
  gameId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = getServerClient();

  const { data, error } = await supabase.rpc(RPC.UNDO_GAME, {
    p_game_id: gameId,
  });

  if (error) {
    console.error("[undoGameAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to undo game." };
  }

  const result = data as { status: string; game_id?: string };

  if (result.status !== "undone") {
    return { error: "Unexpected undo result." };
  }

  return { success: true };
}
