import { defineConfig } from "vitest/config";
import path from "path";

// Headless balance simulation harness — run via `npm run sim:kamikaze`.
// Kept out of the default test config: runs take minutes, not milliseconds.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/sim/**/*.sim.ts"],
    environment: "jsdom",
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
