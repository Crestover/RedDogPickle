"use server";

import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Server Action: addPlayerAction
 *
 * Inserts a new player into public.players for the given group.
 * Validates:
 *   - display_name is non-empty after trim
 *   - code matches ^[A-Z0-9]+$ (uppercase alphanumeric)
 *   - code is unique within the group (unique constraint on group_id + code)
 *
 * On success: redirects back to the referrer (start page or dashboard).
 * On error:   returns { error: string, field?: "code" | "display_name" }
 *
 * Uses the anon key — INSERT is permitted by RLS policy.
 */

const CODE_REGEX = /^[A-Z0-9]+$/;

/** Prevent open redirect — only allow relative paths starting with / */
function safeRedirect(target: string, fallback: string): string {
  if (typeof target === "string" && target.startsWith("/") && !target.startsWith("//")) {
    return target;
  }
  return fallback;
}

export type AddPlayerResult =
  | { error: string; field?: "display_name" | "code" }
  | never;

export async function addPlayerAction(
  groupId: string,
  joinCode: string,
  displayName: string,
  code: string,
  redirectTo: string,
  /** If provided, the new player is also enrolled in this session and the
   *  redirect goes directly to the session page (skipping the picker). */
  sessionId?: string
): Promise<AddPlayerResult> {
  // ── Validate display_name ────────────────────────────────────────────
  const trimmedName = displayName.trim();
  if (!trimmedName) {
    return { error: "Name is required.", field: "display_name" };
  }

  // ── Validate code ────────────────────────────────────────────────────
  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) {
    return { error: "Code is required.", field: "code" };
  }
  if (!CODE_REGEX.test(trimmedCode)) {
    return {
      error: "Code must be uppercase letters and numbers only (e.g. JDO, P1).",
      field: "code",
    };
  }

  const supabase = getServerClient();

  // ── Insert and return the new player's ID ────────────────────────────
  const { data: newPlayer, error } = await supabase
    .from("players")
    .insert({ group_id: groupId, display_name: trimmedName, code: trimmedCode })
    .select("id")
    .single();

  if (error) {
    // Unique constraint violation on (group_id, code)
    if (
      error.code === "23505" &&
      error.message.includes("players_group_code_unique")
    ) {
      return {
        error: `Code "${trimmedCode}" is already taken in this group. Try a different code.`,
        field: "code",
      };
    }
    console.error("[addPlayerAction] insert error:", error.message);
    return { error: error.message ?? "Failed to add player." };
  }

  // ── If called from a live session: enroll the new player immediately ──
  if (sessionId && newPlayer?.id) {
    // Best-effort — ignore errors (player is created, session enroll is
    // a soft failure that the user can recover from on the picker screen)
    await supabase
      .from("session_players")
      .insert({ session_id: sessionId, player_id: newPlayer.id });

    redirect(`/g/${joinCode}/session/${sessionId}`);
  }

  // ── Redirect back (sanitised to prevent open redirects) ──────────────
  redirect(safeRedirect(redirectTo, `/g/${joinCode}`));
}
