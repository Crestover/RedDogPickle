"use server";

import { redirect } from "next/navigation";
import { getAdminServerClient } from "@/lib/supabase/adminServer";
import {
  verifyAdminPassword,
  createAdminSession,
  clearAdminSession,
  requireAdminSession,
} from "@/lib/admin/auth";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "@/lib/admin/constants";
import type { Sport } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// adminLoginAction
// ─────────────────────────────────────────────────────────────
export async function adminLoginAction(
  password: string
): Promise<{ error: string } | never> {
  if (!verifyAdminPassword(password)) {
    return { error: "Incorrect password." };
  }
  await createAdminSession();
  redirect(ADMIN_BASE_PATH);
}

// ─────────────────────────────────────────────────────────────
// adminLogoutAction
// ─────────────────────────────────────────────────────────────
export async function adminLogoutAction(): Promise<never> {
  await clearAdminSession();
  redirect(ADMIN_LOGIN_PATH);
}

// ─────────────────────────────────────────────────────────────
// createGroupAction
// ─────────────────────────────────────────────────────────────
export async function createGroupAction(
  name: string,
  joinCode: string,
  sport: Sport
): Promise<{ error: string } | never> {
  await requireAdminSession();

  const trimmedName = name.trim();
  const normalizedCode = joinCode.trim().toLowerCase();

  if (!trimmedName) {
    return { error: "Group name is required." };
  }
  if (!/^[a-z0-9-]+$/.test(normalizedCode)) {
    return { error: "Join code must be lowercase letters, numbers, and hyphens only." };
  }
  if (sport !== "pickleball" && sport !== "padel") {
    return { error: "Invalid sport." };
  }

  const supabase = getAdminServerClient();
  const { error } = await supabase
    .from("groups")
    .insert({ name: trimmedName, join_code: normalizedCode, sport });

  if (error) {
    if (error.code === "23505") {
      return { error: "That join code is already taken." };
    }
    return { error: "Could not create group." };
  }

  redirect(ADMIN_BASE_PATH);
}

// ─────────────────────────────────────────────────────────────
// togglePlayerHiddenAction
// ─────────────────────────────────────────────────────────────
export async function togglePlayerHiddenAction(
  playerId: string,
  hidden: boolean
): Promise<{ error: string } | { success: true }> {
  await requireAdminSession();

  const supabase = getAdminServerClient();
  const { error } = await supabase
    .from("players")
    .update({ hidden })
    .eq("id", playerId);

  if (error) {
    return { error: "Could not update player." };
  }

  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// updatePlayerAction
// ─────────────────────────────────────────────────────────────
export async function updatePlayerAction(
  playerId: string,
  displayName: string,
  code: string
): Promise<{ error: string } | { success: true; displayName: string; code: string }> {
  await requireAdminSession();

  const trimmedName = displayName.trim();
  const normalizedCode = code.trim().toUpperCase();

  if (!trimmedName) {
    return { error: "Name is required." };
  }
  if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
    return { error: "Code must be uppercase letters and numbers only." };
  }

  const supabase = getAdminServerClient();
  const { error } = await supabase
    .from("players")
    .update({ display_name: trimmedName, code: normalizedCode })
    .eq("id", playerId);

  if (error) {
    if (error.code === "23505") {
      return { error: "That code is already used by another player in this group." };
    }
    return { error: "Could not update player." };
  }

  return { success: true, displayName: trimmedName, code: normalizedCode };
}
