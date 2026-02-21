import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Browser-safe Supabase client.
 * Uses the anon key only — subject to RLS (SELECT + INSERT).
 * Never use the service role key here.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
