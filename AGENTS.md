# AGENTS

Pinball Schminball / kamikaze-ball — a Next.js 16 (App Router, **static
export**) pinball game with a Matter.js playfield, a story mode, and a
Rive-driven HUD. DDD layers live in `src/`, routes in `app/`.

## Commands

| command | what it does |
|---|---|
| `pnpm dev` | dev server on :3000 (the harness does **not** use this — it serves the built `out/`) |
| `pnpm test` | vitest unit suite (jsdom) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm sim:kamikaze` | headless physics bot sims |
| `pnpm ci` | the full gate: frontend + backend + contracts |
| `pnpm run verify:visual` | builds the static export and runs the Playwright render checks |

`rive/` has its own [AGENTS.md](rive/AGENTS.md) for Rive CLI work — read it
before touching `rive/scene.rml`; don't guess RML types, use
`rive schema` / `rive docs`.

## How work lands here

- **Nothing lands red.** There is no "fix it next cycle": the next task
  starts from this tree, and a red base makes every later failure
  ambiguous.
- **The gate is a run, not a claim.** `pnpm ci` passing is evidence;
  "tests should pass" is not. Same for visuals: a render change is not
  done until it has been *looked at* — via `verify:visual`, a screenshot,
  or the running app.
- **Green is not evidence of visible correctness.** Rive/WASM bugs,
  asset failures, and blank canvases compile and test clean. If the task
  touches anything a player sees, `pnpm run verify:visual` is the check.
- **Read [docs/TRAPS.md](docs/TRAPS.md) before debugging** — many
  failures here have already been paid for once and named. If your bug
  isn't in it and it compiles-green-and-is-wrong, add the entry.
- Architecture and boundaries: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md);
  story mode: [docs/STORY_MODE.md](docs/STORY_MODE.md); Rive pipeline:
  [docs/RIVE_MOTION.md](docs/RIVE_MOTION.md).
- Work cycles are logged one line per cycle in
  [docs/PROGRESS.md](docs/PROGRESS.md); git is the machine-readable state.
