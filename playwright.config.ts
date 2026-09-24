import { defineConfig, devices } from "@playwright/test";

/**
 * Visual verification harness: serves the static export from out/ (never
 * `next dev` — deterministic, no compiler flake) and proves the built game
 * actually renders. `data-rive-ready` alone is NOT a pass signal: it fires
 * on LoadError too (docs/TRAPS.md #2), so the specs assert state changes
 * as pixels.
 */
export default defineConfig({
    testDir: "./tests/visual",
    fullyParallel: false,
    workers: 1,
    reporter: "list",
    // One retry absorbs input/evaluate starvation flakes; deterministic
    // failures (an unbound artboard) fail the same way every attempt.
    retries: 1,
    timeout: 180_000,
    use: {
        baseURL: "http://127.0.0.1:4310",
        viewport: { width: 900, height: 1000 },
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], reducedMotion: "no-preference" },
        },
        {
            name: "reduced-motion",
            // The documented fallback branch: no Rive mounts, DOM pips stay visible.
            use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" },
        },
    ],
    webServer: {
        command: "node scripts/serve-out.mjs",
        // Port (TCP connect) rather than url: this box's network stack answers
        // HTTP probes on closed ports with 405s, so the url health-check never
        // resolves. Tests address 127.0.0.1 directly via baseURL.
        port: 4310,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
