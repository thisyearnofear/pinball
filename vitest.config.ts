import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    exclude: ["backend/**", "contracts/**", "apps/**", "dist/**", "node_modules/**"],
    environment: "jsdom",
  },
});
