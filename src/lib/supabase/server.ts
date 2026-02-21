/**
 * Server-side Supabase client.
 *
 * Replaces the repeated createClient(process.env...!) pattern
 * across all Server Components and Server Actions.
 * Uses anon key only — no auth, no cookies, no service role.
 */

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function getServerClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey);
}
