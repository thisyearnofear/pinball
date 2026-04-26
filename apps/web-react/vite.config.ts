import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  // Share the existing assets + engine from the repo root until we split into packages.
  // This keeps ENHANCEMENT FIRST: reuse, then consolidate later.
  publicDir: path.resolve(__dirname, "../../public"),
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: path.resolve(__dirname, "../../node_modules/pathseg/pathseg.js"),
          dest: ".",
        },
      ],
      // Ensure it exists during dev, not only during build.
      watch: { reloadPageOnChange: true },
    }),
  ],
  server: {
    port: 5174,
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
});
