import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-safe Supabase client.
 * Uses the anon key only — subject to RLS (SELECT + INSERT).
 * Never use the service role key here.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
