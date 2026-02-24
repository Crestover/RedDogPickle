"use server";

import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { RPC } from "@/lib/supabase/rpc";

/**
 * Server Actions for session management.
 *
 * Both actions call Supabase RPC functions (defined in schema.sql).
 * The anon key is sufficient — the DB functions handle privilege
 * escalation internally:
 *   - create_session: SECURITY INVOKER (anon INSERT policies apply)
 *   - end_session:    SECURITY DEFINER (can UPDATE without anon UPDATE policy)
 *
 * No service role key is used or needed in Milestone 2.
 */

// ─────────────────────────────────────────────────────────────
// createSessionAction
//
// Called from the Start Session form.
// Validates player count client-side too, but the RPC enforces >= 4.
// On success: redirects to /g/{join_code}/session/{session_id}
// On error:   returns { error: string } (form shows the message)
// ─────────────────────────────────────────────────────────────
export async function createSessionAction(
  joinCode: string,
  playerIds: string[]
): Promise<{ error: string } | never> {
  if (playerIds.length < 4) {
    return { error: "Please select at least 4 players." };
  }

  const supabase = getServerClient();
  const { data: sessionId, error } = await supabase.rpc(RPC.CREATE_SESSION, {
    group_join_code: joinCode.trim().toLowerCase(),
    player_ids: playerIds,
  });

  if (error) {
    console.error("[createSessionAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to start session." };
  }

  redirect(`/g/${joinCode}/session/${sessionId as string}`);
}

// ─────────────────────────────────────────────────────────────
// endSessionAction
//
// Called from the End Session button.
// The end_session RPC is SECURITY DEFINER and handles the UPDATE.
// On success: redirects back to /g/{join_code}
// On error:   returns { error: string }
// ─────────────────────────────────────────────────────────────
export async function endSessionAction(
  sessionId: string,
  joinCode: string
): Promise<{ error: string } | never> {
  const supabase = getServerClient();
  const { error } = await supabase.rpc(RPC.END_SESSION, {
    p_session_id: sessionId,
  });

  if (error) {
    console.error("[endSessionAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to end session." };
  }

  redirect(`/g/${joinCode}`);
}

// ─────────────────────────────────────────────────────────────
// endAndCreateSessionAction
//
// Ends an existing session then creates a new one in a single
// server action (avoids redirect interrupting the flow).
// On success: redirects to new session page
// On error:   returns { error: string }
// ─────────────────────────────────────────────────────────────
export async function endAndCreateSessionAction(
  endSessionId: string,
  joinCode: string,
  playerIds: string[]
): Promise<{ error: string } | never> {
  if (playerIds.length < 4) {
    return { error: "Please select at least 4 players." };
  }

  const supabase = getServerClient();

  // 1. End the old session
  const { error: endError } = await supabase.rpc(RPC.END_SESSION, {
    p_session_id: endSessionId,
  });

  if (endError) {
    console.error("[endAndCreateSessionAction] end RPC error:", endError.message);
    return { error: endError.message ?? "Failed to end session." };
  }

  // 2. Create the new session
  const { data: sessionId, error: createError } = await supabase.rpc(RPC.CREATE_SESSION, {
    group_join_code: joinCode.trim().toLowerCase(),
    player_ids: playerIds,
  });

  if (createError) {
    console.error("[endAndCreateSessionAction] create RPC error:", createError.message);
    return { error: createError.message ?? "Failed to start session." };
  }

  redirect(`/g/${joinCode}/session/${sessionId as string}`);
}

// ─────────────────────────────────────────────────────────────
// setSessionRulesAction
//
// Updates session-level game rules (target_points + win_by).
// Called from the Rules Chip picker.
// Returns { success, targetPoints, winBy } or { error }.
// ─────────────────────────────────────────────────────────────
export async function setSessionRulesAction(
  sessionId: string,
  targetPoints: number,
  winBy: number
): Promise<{ success: true; targetPoints: number; winBy: number } | { error: string }> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc(RPC.SET_SESSION_RULES, {
    p_session_id: sessionId,
    p_target_points: targetPoints,
    p_win_by: winBy,
  });

  if (error) {
    console.error("[setSessionRulesAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to update session rules." };
  }

  const result = data as { status: string; target_points: number; win_by: number };
  return {
    success: true,
    targetPoints: result.target_points,
    winBy: result.win_by,
  };
}
