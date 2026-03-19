import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Load .env.local for integration tests
dotenv.config({ path: ".env.local" });

/**
 * Vitest config for integration tests.
 *
 * Runs against a live Supabase database. Requires in .env.local:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npm run test:integration
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
