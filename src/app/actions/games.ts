"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

/**
 * Server Action: recordGameAction
 *
 * Delegates to the record_game Postgres RPC, which atomically:
 *   1. Validates the session is active (ended_at IS NULL, started_at within 4 hours)
 *   2. Validates player counts (exactly 2 per team, no overlaps, all are attendees)
 *   3. Validates scores (winner >= 11, winner - loser >= 2, not equal)
 *   4. Computes a deterministic dedupe_key (SHA-256, order-insensitive within
 *      and across teams)
 *   5. Derives sequence_num atomically
 *   6. Inserts games row + 4 game_players rows in one transaction
 *
 * On success: redirects to the session page (reloads game list).
 * On duplicate: returns { error: string, duplicate: true } — caller shows message.
 * On other error: returns { error: string }.
 *
 * Uses the anon key — record_game is SECURITY DEFINER, callable by anon.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type RecordGameResult =
  | { error: string; duplicate?: boolean }
  | never;

export async function recordGameAction(
  sessionId: string,
  joinCode: string,
  teamAIds: string[],
  teamBIds: string[],
  teamAScore: number,
  teamBScore: number
): Promise<RecordGameResult> {
  // ── Client-side guard (also enforced in RPC) ─────────────────────────────
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
    return {
      error: `Winning margin must be at least 2 (got ${winner - loser}).`,
    };
  }

  const supabase = getSupabase();

  const { error } = await supabase.rpc("record_game", {
    p_session_id: sessionId,
    p_team_a_ids: teamAIds,
    p_team_b_ids: teamBIds,
    p_team_a_score: teamAScore,
    p_team_b_score: teamBScore,
  });

  if (error) {
    // Duplicate game: unique constraint on (session_id, dedupe_key)
    if (error.code === "23505") {
      return {
        error:
          "This game looks like a duplicate (same teams, scores, and time window). It was not recorded again.",
        duplicate: true,
      };
    }
    console.error("[recordGameAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to record game." };
  }

  // Redirect back to session page — Server Component will re-fetch game list
  redirect(`/g/${joinCode}/session/${sessionId}`);
}
