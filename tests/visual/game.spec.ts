import { test, expect, type Page } from "@playwright/test";

/**
 * Render proof for the static export (docs/TRAPS.md #1/#2/#9, AGENTS.md
 * "green is not evidence of visible correctness"). Two signals the unit
 * suite structurally cannot produce:
 *
 *  1. the built page renders a non-uniform frame (not a black/blank screen);
 *  2. the mana gauge's pixels respond to a game-state change — which is the
 *     de5c27e bug class: an unbound Rive state machine stays visually inert
 *     while every test, warning included, looks fine.
 *
 * Thresholds are variances, never golden pixels: no font/GPU flake.
 */

const CHAPTER_PROGRESS_KEY = "pinball_water_shrine_progress_v1";

/** Seed durable progress inside the ps_data blob (docs/TRAPS.md #6) before any app code runs. */
async function seedStoryProgress(page: Page, learned: boolean, seals: string[]) {
    await page.addInitScript(
        ([key, payload]) => {
            window.localStorage.setItem("ps_data", JSON.stringify({ [key]: payload }));
        },
        [CHAPTER_PROGRESS_KEY, JSON.stringify({ learned, seals, won: false })] as const,
    );
}

async function luminanceStdDev(page: Page, png: Buffer): Promise<number> {
    return page.evaluate(async (b64) => {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = `data:image/png;base64,${b64}`;
        });
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        const { data } = g.getImageData(0, 0, c.width, c.height);
        let sum = 0;
        let sum2 = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
            const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            sum += l;
            sum2 += l * l;
        }
        const mean = sum / n;
        return Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    }, png.toString("base64"));
}

/** Fraction of pixels whose colour meaningfully changed between two PNG shots. */
async function diffRatio(page: Page, a: Buffer, b: Buffer): Promise<number> {
    return page.evaluate(async ([ba, bb]) => {
        const load = (src: string) =>
            new Promise<HTMLImageElement>((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = rej;
                i.src = `data:image/png;base64,${src}`;
            });
        const [ia, ib] = await Promise.all([load(ba), load(bb)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return 1;
        const c = document.createElement("canvas");
        c.width = ia.width;
        c.height = ia.height;
        const g = c.getContext("2d")!;
        g.drawImage(ia, 0, 0);
        const da = g.getImageData(0, 0, c.width, c.height).data;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(ib, 0, 0);
        const db = g.getImageData(0, 0, c.width, c.height).data;
        let changed = 0;
        const n = da.length / 4;
        for (let i = 0; i < da.length; i += 4) {
            const d =
                Math.abs(da[i] - db[i]) +
                Math.abs(da[i + 1] - db[i + 1]) +
                Math.abs(da[i + 2] - db[i + 2]);
            if (d > 30) changed++;
        }
        return changed / n;
    }, [a.toString("base64"), b.toString("base64")] as const);
}

async function openResumedStory(page: Page) {
    await seedStoryProgress(page, true, []);
    await page.goto("/chapter");
    const hud = page.locator('[data-testid="story-hud"]');
    // Hydration + WASM + runtime load: wait on content, never a fixed timeout.
    await expect(hud).toBeVisible({ timeout: 45_000 });
    await expect(hud).toContainText("2 / 3");
    return hud;
}

test("lobby renders something, not a black screen", async ({ page }) => {
    await page.goto("/");
    // The lobby may auto-start a practice run (coach flow), so "wait for the
    // lobby" would race. Readiness = *something* hydrated: any canvas or any
    // of the lobby's copy. What we assert is that the frame is not blank.
    await expect
        .poll(
            async () =>
                page.evaluate(
                    () =>
                        !!document.querySelector("canvas") ||
                        /Water Shrine|PLAY NOW|Kamikaze Ball/.test(document.body.innerText),
                ),
            { timeout: 45_000 },
        )
        .toBe(true);
    const shot = await page.screenshot();
    expect(await luminanceStdDev(page, shot)).toBeGreaterThan(5);
});

test("story route renders the HUD with the resumed objective", async ({ page }) => {
    const hud = await openResumedStory(page);
    const shot = await page.screenshot();
    expect(await luminanceStdDev(page, shot)).toBeGreaterThan(5);
    await expect(hud).toContainText("Quench the fire seals");
});

test("mana gauge pixels follow game state — the Rive state machine is actually bound", async ({ page }) => {
    const hud = await openResumedStory(page);
    const gauge = hud.locator('span[aria-label^="Mana "]');
    await expect(gauge).toBeVisible();

    // Deterministic binding proof (the de5c27e class), asserted HARD in the
    // no-preference project: an unbound or failed artboard would fall back
    // to the DOM pips and the pixel floor below would still pass, so here
    // the canvas existing and *running its state machine* is the contract —
    // the visual gate's job is to prove the art ships, not that the HUD
    // survives without it. (The reduced-motion project covers the other
    // branch.) Pixel motion alone proves nothing: an unbound artboard still
    // animates its linear timeline; only the playing-machine list tells.
    if (await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        test.skip(true, "fallback branch is asserted by the reduced-motion flow below");
    }
    const gaugeCanvas = gauge.locator("canvas");
    await expect(gaugeCanvas.first()).toHaveAttribute("data-rive-sm", "SM", { timeout: 20_000 });

    // Clip a fixed rect, not an element handle: the gauge span remounts when
    // the aria-label changes, and an element screenshot would lose its node.
    const clip = await gauge.boundingBox();
    expect(clip).not.toBeNull();
    const shotA = await page.screenshot({ clip });

    // DOM click, not mouse input: the game's rAF loop starves CDP input
    // dispatch on this page (the press event can wait minutes for a slot),
    // while el.click() drives the exact handler a player would reach.
    await hud.locator('button:has-text("Arm Water (W)")').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(hud.locator('button:has-text("Water armed")')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(600); // let the SM transition settle
    const shotB = await page.screenshot({ clip });

    // Both branches must repaint the gauge on mana 3→2 (DOM pips in
    // fallback; the bound canvas otherwise). The gauge carries ambient
    // motion, so this is a floor, not the binding proof — data-rive-sm is.
    const state = await diffRatio(page, shotA, shotB);
    expect(state, `gauge state-change diff ${state} too small`).toBeGreaterThan(0.01);
});

test("reduced motion: DOM fallback stands in, still state-responsive", async ({ page }) => {
    await page.goto("/chapter");
    test.skip(
        !(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)),
        "reduced-motion project only; the chromium project proves the Rive branch",
    );
    await seedStoryProgress(page, true, []);
    await page.goto("/chapter");
    const hud = page.locator('[data-testid="story-hud"]');
    await expect(hud).toBeVisible({ timeout: 45_000 });

    // No artboard may claim readiness under reduced motion.
    await expect(hud.locator("canvas[data-rive-ready]")).toHaveCount(0);

    const gauge = hud.locator('span[aria-label^="Mana "]');
    const clip = await gauge.boundingBox();
    expect(clip).not.toBeNull();
    const shotA = await page.screenshot({ clip });
    // DOM click, not mouse input: the game's rAF loop starves CDP input
    // dispatch on this page (the press event can wait minutes for a slot),
    // while el.click() drives the exact handler a player would reach.
    await hud.locator('button:has-text("Arm Water (W)")').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(hud.locator('button:has-text("Water armed")')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(400);
    const shotB = await page.screenshot({ clip });
    // The pip fallback must visibly drop one mana — a hidden-but-mounted
    // Rive canvas that never hides the pips would silently pass, so require
    // the real change, not just DOM text.
    expect(await diffRatio(page, shotA, shotB)).toBeGreaterThan(0.01);
});
