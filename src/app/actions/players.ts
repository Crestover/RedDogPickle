"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

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

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const CODE_REGEX = /^[A-Z0-9]+$/;

export type AddPlayerResult =
  | { error: string; field?: "display_name" | "code" }
  | never;

export async function addPlayerAction(
  groupId: string,
  joinCode: string,
  displayName: string,
  code: string,
  redirectTo: string
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

  const supabase = getSupabase();

  // ── Insert ───────────────────────────────────────────────────────────
  const { error } = await supabase.from("players").insert({
    group_id: groupId,
    display_name: trimmedName,
    code: trimmedCode,
  });

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

  // ── Redirect back ────────────────────────────────────────────────────
  redirect(redirectTo);
}

/**
 * suggestCode
 *
 * Pure utility: derive a suggested player code from a display name.
 * Takes the first letter of each word, uppercased, up to 3 chars.
 * Examples:
 *   "John Doe"        → "JDO"
 *   "Alice"           → "ALI"
 *   "Bob van der Berg"→ "BVD"
 */
export function suggestCode(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  let code = "";
  if (words.length === 1) {
    // Single word: take first 3 letters
    code = words[0].substring(0, 3).toUpperCase();
  } else {
    // Multi-word: first letter of each word, up to 3
    code = words
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return code.replace(/[^A-Z0-9]/g, "");
}
