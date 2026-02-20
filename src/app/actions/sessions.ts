"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

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

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

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

  const supabase = getSupabase();
  const { data: sessionId, error } = await supabase.rpc("create_session", {
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
  const supabase = getSupabase();
  const { error } = await supabase.rpc("end_session", {
    p_session_id: sessionId,
  });

  if (error) {
    console.error("[endSessionAction] RPC error:", error.message);
    return { error: error.message ?? "Failed to end session." };
  }

  redirect(`/g/${joinCode}`);
}
