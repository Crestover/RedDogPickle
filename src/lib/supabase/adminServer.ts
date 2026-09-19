/**
 * Service-role Supabase client — bypasses RLS entirely.
 *
 * ONLY for use inside admin server actions, and only after
 * requireAdminSession() has verified the caller. Every other part of the
 * app deliberately uses the anon key (see server.ts) — this client exists
 * because the admin panel needs writes anon RLS doesn't allow (e.g.
 * updating players.hidden), and the admin password gate is the trusted
 * boundary that justifies bypassing RLS here.
 */

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function getAdminServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.supabaseUrl, serviceRoleKey);
}
