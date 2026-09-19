# Rive Motion: the state-driven HUD art pipeline

Game chrome (meters, sigils, stingers) is authored as **text** in
[`rive/scene.rml`](../rive/scene.rml), built to a 4.8KB `.riv` by the Rive
CLI, and rendered by a lazy-loaded runtime. Art reviews in PRs like code —
no binary editor files, no designer bottleneck.

## Project layout

```
rive/
  scene.rml      # all artboards + view models (the source of truth)
  rive.yaml      # CLI project config (logs under build/)
  build/         # gitignored CLI output (rive.riv, screenshots, logs)
public/rive/
  hud.riv        # the built asset the app serves (committed)
src/game/ui/
  RiveArtboard.tsx  # the single React wrapper (lazy runtime, DOM fallback)
```

## The artboards

All four live in one `.riv`; the host drives them through **view model
properties** consumed by state-machine conditions (never direct property
binds — see "CLI gotchas" below).

| Artboard | VM inputs | States | Renders where |
|---|---|---|---|
| `hud_gauge` | `mana` 0–3, `armed` bool | M0/M1/M2/M3 + ArmedOn | Story strip mana readout (over DOM pips) |
| `mood_sigil` | `mood` 0–5 | one per machine mood | Kamikaze HUD top-right |
| `coach_kanji` | `reveal` bool (pulse) | splash + ripple | Behind the coach cue kanji |
| `victory_sting` | `fire` bool (pulse) | torii rise + petals | Center overlay on win |

Design rule of thumb: **state machines for discrete game state** (mana
count, mood enum, one-shot triggers); **DOM for anything tracking a live
value every frame** — the charge ring follows the aim point, so it stays
DOM/CSS by design.

## React wiring

`RiveArtboard` mounts a canvas and lazily `import()`s
`@rive-app/canvas-lite` (the ~WASM runtime is only fetched when a Rive
component first mounts — arcade-only players never pay for it).

- **`data`** — view model writes applied on every change
  (`{ mana, armed }` → `vmi.number("mana").value = …`).
- **`pulse`** — fires a boolean VM property 1→`setTimeout`→0 for one-shot
  animations. Re-firing a *new* cue with the same pulse needs a **React
  key bump** (see the coach splash in `GameMount.tsx`).
- **`onReady(ok)`** — reports whether the artboard is actually rendering.
  `false` (reduced motion, WASM/asset failure) → the host keeps its DOM
  fallback visible. The HUD never depends on the art shipping.

## Editing the art

```bash
cd rive
rive . --verify                      # compile check
rive . --once                        # build rive/build/rive.riv
cp build/rive.riv ../public/rive/hud.riv   # ship it
rive . --artboard=hud_gauge --screenshot=build/g3a.png \
      --advance=30 --data=mana=3 --data=armed=true   # golden-frame check
```

`rive watch .` gives a live local preview. Screenshots of every driven
state are the verification step — do not wire an artboard you have not
rendered headless.

Never guess RML types or property keys: `rive schema <Type>`,
`rive schema --search <text>`, and `rive docs` are authoritative (the
RML format postdates model training data). `rive/AGENTS.md` carries the
same instruction for agents.

## CLI gotchas (learned the hard way)

- **Binds only apply while a state machine runs.** An artboard without
  `defaultStateMachineId` never drives its view model — the docs' own
  data-bind examples omit the SM "for brevity" and silently render
  nothing. Always give every artboard a default SM, even a trivial idle.
- **Authored opacity multiplies animation keys.** A shape authored at
  `opacity="0"` with a fill at alpha `00` can never be lit by keyframes.
  Pattern: author the *shape* opacity 0, paint at full color, and let
  each state's animation key opacity to 1.
- **Compiling is directory-wide.** All `.rml` files in the folder merge
  into one document — stray scratch files pollute the build with
  confusing "no view model is bound" errors.
- **`--screenshot=<path>`** takes the output path inside the flag;
  `--output=…` is silently ignored.
- Number transitions read VM values via
  `TransitionViewModelCondition` + `TransitionValueNumberComparator`
  (the `opValue` lives on the condition, not the comparator).

## What Rive deliberately does not own

The playfield physics (Matter.js canvas) and all aim/charge interaction
rendering stay in the engine. Rive is chrome — resource meters, mood,
reactions — not gameplay. If a proposed artboard needs per-frame
coordinates from the physics world, it belongs in DOM/CSS instead.
