/**
 * Admin panel authentication.
 *
 * Single shared password (ADMIN_PASSWORD), no user accounts — matches the
 * app's existing trust-based model, just for a single internal operator
 * instead of a group. On success, sets a short-lived HttpOnly cookie whose
 * value is `expiresAt.signature`, where signature is an HMAC-SHA256 of
 * expiresAt keyed by ADMIN_SESSION_SECRET. No session table needed — the
 * cookie is self-verifying.
 *
 * Combined with the non-obvious path in constants.ts as defense-in-depth,
 * but the password check here is the actual security boundary.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { ADMIN_LOGIN_PATH } from "./constants";

const COOKIE_NAME = "rd_admin_session";
const SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing required environment variable: ADMIN_SESSION_SECRET");
  }
  return secret;
}

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("Missing required environment variable: ADMIN_PASSWORD");
  }
  return password;
}

function sign(expiresAt: number): string {
  return createHmac("sha256", getSessionSecret()).update(String(expiresAt)).digest("hex");
}

/** Constant-time string comparison — avoids leaking match length via timing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyAdminPassword(password: string): boolean {
  return safeEqual(password, getAdminPassword());
}

function isValidToken(token: string): boolean {
  const [expiresAtStr, signature] = token.split(".");
  if (!expiresAtStr || !signature) return false;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return safeEqual(signature, sign(expiresAt));
}

export async function createAdminSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = `${expiresAt}.${sign(expiresAt)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function hasValidAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? isValidToken(token) : false;
}

/** Call at the top of every admin page and server action. Redirects to login if not authenticated. */
export async function requireAdminSession(): Promise<void> {
  if (!(await hasValidAdminSession())) {
    redirect(ADMIN_LOGIN_PATH);
  }
}
