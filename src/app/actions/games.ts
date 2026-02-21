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

  // status === "inserted" — redirect to session page so Server Component
  // re-fetches the updated game list
  redirect(`/g/${joinCode}/session/${sessionId}`);
}
