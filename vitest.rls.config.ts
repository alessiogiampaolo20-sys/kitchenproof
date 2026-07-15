import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// RLS cross-tenant suite — runs against the local Supabase stack (supabase start).
export default defineConfig({
  test: {
    include: ["tests/rls/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Single-threaded: tests share seeded fixtures.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
