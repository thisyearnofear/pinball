# Traps

Failures that compile, run, tests stay green, and the product is quietly
wrong. Each one this project already paid for — written down so nobody
re-discovers them on a playtest's time. Add an entry whenever a fix commit
teaches something the test suite could not.

Format: **symptom / why it stays green / the rule.**

---

## 1. canvas-lite silently ignores the deprecated plural `stateMachines`

- **Symptom** — every view-model bind (mana, mood, reveal, fire) is inert;
  the runtime plays a linear animation instead of the state machine.
- **Why green** — the WASM layer drops the unknown parameter without
  throwing; unit tests never instantiate the real runtime, so nothing
  asserts that anything moved. The only signal was a deprecation warning
  in a live console (de5c27e, 0d32ac7).
- **The rule** — `RiveArtboard` passes `stateMachine` (singular). Trust
  console warnings from live playtests; `pnpm run verify:visual` checks
  pixels actually change (tests/visual/).

## 2. `data-rive-ready` fires on load *error* too

- **Symptom** — a harness or selector that asserts the attribute passes on
  a broken `.riv`, a failed WASM fetch, anything.
- **Why green** — the attribute means "the runtime settled", not "the
  artboard is bound": `setReady(true)` runs in both the `Load` and the
  `LoadError` handler (src/game/ui/RiveArtboard.tsx:76–97). And an
  *unbound* artboard still animates its linear timeline, so pixel motion
  alone doesn't prove the state machine runs either.
- **The rule** — the binding proof is `data-rive-sm` (the runtime's
  *playing state-machine names*, stamped on the canvas at Load; `"none"`
  when the binds are inert) plus state-responsive pixels. The harness
  asserts both; attribute-only checks don't count.

## 3. An artboard without `defaultStateMachineId` never drives its view model

- **Symptom** — binds authored in RML, nothing renders from them.
- **Why green** — the file compiles and loads; Rive's own docs omit the
  state machine "for brevity" from data-bind examples, so the omission
  looks intentional.
- **The rule** — every artboard gets a default SM, even a trivial idle
  (docs/RIVE_MOTION.md §CLI gotchas).

## 4. Authored `opacity="0"` multiplies animation keys

- **Symptom** — a state can never light a shape that keyframes target.
- **Why green** — the animation runs; the composited result is invisible
  either way, and there is no error.
- **The rule** — author the shape opacity 0, paint at full color, let each
  state's animation key opacity to 1.

## 5. Rive CLI: `--output=` is silently ignored; compiling is directory-wide

- **Symptom** — screenshots land nowhere (`--screenshot=<path>` takes the
  path *inside* the flag); stray `.rml` scratch files pollute the build
  with confusing "no view model is bound" errors from someone else's
  artboard.
- **Why green** — both failures are warning-free; the wrong file or the
  missing output just isn't there.
- **The rule** — `rive . --screenshot=build/x.png`; keep `rive/` free of
  scratch `.rml` files.

## 6. Story progress is namespaced inside one `ps_data` blob

- **Symptom** — `localStorage["pinball_story_vault_v1"]` reads back `null`
  for save data that demonstrably saved (and the legacy
  `pinball_water_shrine_progress_v1` reads are dead ends — the vault
  migrated them once and keeps them for old saves only).
- **Why green** — the key is *inside* the JSON at
  `localStorage["ps_data"]` (src/utils/local-storage.ts:23–34); direct
  reads look like the classic "my save vanished" bug and invite a
  destructive "fix".
- **The rule** — seed and inspect storage through `setInStorage` /
  `getFromStorage` (or the same blob shape), never by raw key.

## 7. Corrupt story progress *must* read as no progress

- **Symptom** — `loadVault()` scrubs data that looks present: runs whose
  player never learned the blessing, `completed` entries not backed by a
  blessing, a `current` run for an already-won chapter, unparseable JSON.
- **Why green** — it is a loader, so a scrubbed field looks like a bug;
  loosening the validation is the tempting, wrong move.
- **The rule** — the rejection semantics are the contract (a shattered
  ball keeps only knowledge; a win never persists as `current`; seals
  cannot exist without the blessing; completed ⊆ blessings —
  src/model/shrine-chapter.ts:153–190). The lobby must never offer what a
  retry would not honour. Tests in
  tests/unit/model/shrine-chapter.spec.ts pin each case; extend them,
  don't relax them.

## 8. The deploy's no-op is files *transferred*, not rsync's chatter

- **Symptom** — a deploy that should be a no-op rebuilds production, or
  `Permission denied (publickey)` that reads like a bad key.
- **Why green** — `rsync -a` preserves mtimes and a fresh checkout stamps
  every file new, so the itemize list is non-empty on *every* run
  (`.f..t......` lines are timestamp-only). And the key was fine: the box
  sets `AllowUsers deploy` / `PermitRootLogin no`, so it refused `root`
  before inspecting any key (23c728b, 17b4c4d).
- **The rule** — decide from rsync's transferred-file count with
  `--checksum`; exclude `.DS_Store` / `._*`; a publickey refusal can be an
  *allowusers* refusal.

## 9. CI never proves the static export builds

- **Symptom** — all checks green, `out/` cannot be produced (or renders
  blank) on the deploy box.
- **Why green** — checks.yml deliberately omits `pnpm run build` to stay
  fast; nothing in the unit suite touches the browser.
- **The rule** — the visual harness (`.github/workflows/visual-gate.yml`,
  or `pnpm run verify:visual` locally) is what closes the render gap. If
  you change what the export includes, run it.

## 10. Gating a Rive mount on its own readiness deadlocks the fallback

- **Symptom** — the story mana gauge renders DOM pips forever; the
  `hud_gauge` artboard never appears in the live game.
- **Why green** — `{riveGaugeReady && <RiveArtboard onReady={setRiveGaugeReady}/>}`
  reads as "mount the overlay when ready", but the only writer of the flag
  is the component the flag hides. It compiles, the pips look fine, and no
  unit test mounts the real overlay. The first `verify:visual` run caught
  it (fixed by always mounting; `visibility` on the pips still flips with
  readiness — GameMount's mana gauge, ~line 1137).
- **The rule** — `onReady`-reported components mount unconditionally;
  readiness toggles the *fallback's* visibility, never the component's
  existence.

## 11. Playwright mouse input stalls behind the game's rAF loop

- **Symptom** — a harness click on the running table hangs for 90+ seconds
  or times out, even with `force: true`.
- **Why green** — the action looks like a selector problem; it is the CDP
  input dispatch queue starving behind the physics/render loop, and
  bounding-box stability never settles under the CRT animation.
- **The rule** — in tests/visual, drive buttons with
  `locator.evaluate((el) => el.click())` — same React handler, no input
  pipeline — and assert the *state consequence*, not the mouse.
