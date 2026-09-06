# Marble × Pinball Integration (now Mint)

> **Vision:** Pinball Arcade is no longer "another web pinball game." Each
> table lives **inside a generative photoreal 3D world** authored in Mint.
> Tournaments are themed worlds. Players will eventually be able to generate
> their own table-worlds from a text prompt and stake them on-chain — the
> monopoly lever that turns a cabinet into a platform. See
> [VISION.md](./VISION.md) for the full strategic framing.

This document defines the **vision, UX, architecture, and rollout plan** for
integrating [Mint](https://mint.gg) (AI 3D creation platform, formerly
Marble/World Labs) and [Spark](https://sparkjs.dev/2.0.0-preview) (Gaussian
Splat web renderer) into the existing engine, in line with our Core Principles.

---

## Current Status

### ✅ Completed

- **Mint Three.js Skills installed** (`~/.claude/skills/mint-threejs-skills`)
  - Teaches the agent how to integrate Mint-generated assets into browser-based Three.js apps
  - Covers `.spz`/`.rad` loading, camera rigs, LOD handling, quality-tier degradation
- **Mint API Skill installed** (`~/.claude/skills/mint-api`)
  - Handles generation, polling, preview review, asset retrieval workflows
  - Protects against credential leaks, respects account ownership, bounds retries

### ⏳ Pending — Requires API Key

- **Mint API Key** not yet configured (not in `.env`, not in environment)
- **Next step**: Generate first tournament world via API, wire into `src/config/worlds.ts`

To get started when you're back:
1. Visit https://platform.mint.gg → Developer settings → Create API key
2. Add to `.env.local`: `MINT_API_KEY="..."` (this file is gitignored)
3. Run the integration flow below

---

## Mint ecosystem mapping

- **Mint** is the platform. It subsumed the former Marble and World Labs products.
  The API endpoint is `api.mint.gg`; docs live at `docs.mint.gg`.
- **Spark** (`sparkjs.dev`) is the web renderer — unchanged. It renders Gaussian
  splats (`.spz` / `.rad`) via Three.js. This is the runtime your app already uses.
- **Mint MCP** (`mcp.mint.gg`) lets a coding agent (you, me, Codex, Cursor)
  generate, review, and retrieve 3D worlds, models, asset packs, materials,
  audio, and video through a standardized JSON-RPC interface.
- **Mint Three.js Skills** (`github.com/mintdotgg/mint-threejs-skills`) teach
  an agent the exact patterns for integrating Mint-generated assets into
  browser-based Three.js apps — including `.spz`/`.rad` loading, camera rigs,
  LOD handling, and quality-tier degradation. Installing these skills means
  the agent can reason correctly about `src/presentation/` without guessing.
- **Mint API** (`platform.mint.gg` → Developer settings → API key) is the
  server-side production pipeline: generate worlds on demand, poll for
  completion via long-running operations, fetch the artifact manifest, and
  slot the `runtime.runtimeUrl` directly into `src/config/worlds.ts`.

### Why the MCP + skills matter right now

Right now every tournament world is **hand-authored**: you or someone on the
team goes to `docs.mint.gg` or the Mint web app, generates a world, downloads
the `.spz` / `.rad`, and hardcodes the URL into `src/config/worlds.ts`. This
works for 5 hackathon-era worlds. It does not scale to one new world per
tournament, per player, per season.

The MCP + skills install gives the dev agent the ability to:

1. **Generate a new tournament world on demand** via the API (prompt → wait →
   fetch manifest → write the URL into config).
2. **Integrate the generated world correctly** using the same `mountWorld()`
   pattern already in `src/presentation/index.ts` — the skills know the
   `WorldHandle` API, the camera preset contract, and the quality-tier
   degradation logic.
3. **Review before shipping** — the `review` mode in Mint stops at
   `preview_ready` so you approve the output before it hits main.

The `mint-threejs-skills` package also teaches the agent about the specific
Mint output format (`.spz` for web, `.rad` for LOD streaming) so it never
confuses it with Tripo's `.glb` / `.obj` pipeline (which is a different
paradigm — mesh vs. splat, and not useful for this project).

See the [integration plan](#integration-plan) below for the concrete steps.

---

## 1. Why this exists

Today the game is a high-quality but visually conventional 2D vertical-scroller.
Marble + Spark gives us a unique, hard-to-copy differentiator on the web:

- **Marble** generates persistent, spatially-consistent 3D worlds from
  text/image/video and exports **Gaussian splats** (`.spz`/`.rad`), **collider
  meshes** (`.glb`), and keyframe video.
- **Spark 2.0** renders those splats in real time in the browser via Three.js.

We can drop the existing 2D playfield **inside** any of those worlds with zero
gameplay risk — and progressively unlock player-generated worlds, fully 3D
pinball physics, and tournament-as-world.

This integration is one of four moat layers (see
[DIFFERENTIATORS.md](./DIFFERENTIATORS.md)):

- **Web3-native arcade** (Mezo / MUSD prizes, verifiable scores) +
- **AI-native presentation** (Marble worlds — no other Web3 pinball ships in a
  generative world model) +
- **User-generated content** (player-prompted tables staked on-chain — the
  monopoly lever that makes us a platform, not just a cabinet) +
- **Bitcoin-backed economy** (MUSD as the substance of the game, not just a
  prize wrapper).

The compositing approach (2D gameplay inside a splat scene, not 3D physics)
is deliberately chosen to preserve the deterministic, verifiable nature of the
physics engine — a key requirement for the trustless arcade protocol
(see [VISION.md](./VISION.md)).

---

## 2. Product vision & user experience

### 2.1 Tiered experience

```diagram
╭──────────────────────────────────────────────────────────────────╮
│ TIER 0 — Today                                                   │
│   Flat 2D table, PNG background, zCanvas.                        │
╰──────────────────────────────────────────────────────────────────╯
                              ▼
╭──────────────────────────────────────────────────────────────────╮
│ TIER 1 — Worlded Tables  (ship first)                            │
│   Same 2D Matter.js gameplay, but the playfield is composited    │
│   into a Spark-rendered Marble splat scene with parallax,        │
│   ambient particles, and a tilted camera. Visually 3D, gameplay  │
│   identical.                                                     │
╰──────────────────────────────────────────────────────────────────╯
                              ▼
╭──────────────────────────────────────────────────────────────────╮
│ TIER 2 — Themed Tournaments                                      │
│   Each on-chain tournament is bound to a Marble world preset.    │
│   Tournament 1 = Pirate Ship. Tournament 2 = Spaceship. The      │
│   prize-pool theme literally is the rendered universe.           │
╰──────────────────────────────────────────────────────────────────╯
                              ▼
╭──────────────────────────────────────────────────────────────────╮
│ TIER 3 — Player-Generated Tables                                 │
│   Player types a prompt → Marble generates a world → we drop a   │
│   procedural table in → Splat Collider Builder authors the       │
│   bumpers/rails → table is registered as an on-chain custom      │
│   tournament. UGC pinball, no other Web3 arcade has it.          │
╰──────────────────────────────────────────────────────────────────╯
                              ▼
╭──────────────────────────────────────────────────────────────────╮
│ TIER 4 — True 3D Pinball  (stretch)                              │
│   Replace 2D Matter.js with 3D Rapier. Ball is a real rigid      │
│   body inside the splat-meshed environment. The playfield IS     │
│   the world. (Reference: bmild/spark-physics.)                   │
╰──────────────────────────────────────────────────────────────────╯
```

We will **ship Tiers 1 + 2** as the headline visual upgrade and architect
Tiers 3–4 so they are additive (no rewrites).

### 2.2 Player journey (post-Tier 2)

1. **Lobby** — Tournament cards each show a 6-second Marble keyframe video of
   their world. Hovering plays the loop.
2. **Connect wallet** — unchanged (Mezo Passport).
3. **Enter tournament** — pay MUSD; the chosen tournament's `worldId`
   determines which splat scene we preload.
4. **Loading curtain** — we stream the `.spz` (or `.rad` for big worlds) with a
   progress bar; the table SVG/PNG is preloaded in parallel.
5. **Play** — the table renders inside the world with subtle camera dolly,
   ambient world audio under the existing FX, depth-of-field on drains.
6. **Drain → next ball** — short cinematic camera move through the world to
   the plunger (free polish from Spark camera tweens).
7. **Game over** — the world stays; score panel + share card with a still
   frame of the player's run inside the world.

### 2.3 UX guardrails

- The world **never obstructs gameplay**. The 2D playfield is always crisply
  readable; the splat scene is treated as a **stage**, not a HUD.
- Reduced-motion and low-end-device users get the **legacy 2D background** with
  a single low-res still frame from the world. No regression.
- Audio: world ambience is **ducked** under hit/bumper FX and disabled with
  the existing mute toggle.

---

## 3. Architecture

### 3.1 New domain: `presentation/`

The game and world rendering must stay decoupled. We add **one new domain** —
the *presentation* domain — and nothing else moves.

```diagram
╭──────────────────╮      ╭───────────────────╮      ╭─────────────────╮
│   game domain    │      │ presentation/     │      │ tournament      │
│  (Matter.js,     │◀────▶│ (Marble + Spark   │◀────▶│ domain          │
│   zCanvas, model)│ stage│  scene host)      │ world│ (chain, prizes) │
╰──────────────────╯      ╰───────────────────╯      ╰─────────────────╯
         ▲                          ▲                        ▲
         │                          │                        │
         ╰──────────────╮  ╭────────╯                        │
                        ▼  ▼                                 │
                   ╭──────────────────────────────────────╮  │
                   │ UI shell (apps/web-react)            │◀─╯
                   │  - Lobby, Tournament screens         │
                   │  - mounts <GameStage worldId=... />  │
                   ╰──────────────────────────────────────╯
```

**Dependency rules** (additions to existing rules):
- `presentation → (game stage API, config, splat assets)`. **No** dependency on
  tournament/wallet/UI.
- `game → no change` (still has zero outbound deps).
- `UI shell → presentation` (composes the stage with the existing game canvas).

### 3.2 Proposed file layout

```diagram
src/
  presentation/                    ← NEW domain (single source of truth for 3D world)
    index.ts                       ← public API: mountWorld(), WorldHandle
    spark-host.ts                  ← Three.js + Spark renderer lifecycle
    splat-loader.ts                ← .spz/.rad loader with cache + LOD
    world-registry.ts              ← worldId → { splatUrl, camera, audio, license }
    camera-rig.ts                  ← tilt/dolly/drain-flythrough behaviors
    composite-layer.ts             ← integrates the zCanvas <canvas> as a 3D layer
    quality.ts                     ← adaptive quality (FPS budget, splat density)
    worlds/                        ← per-world tuning (camera, ambience, fog)
      pirate-ship.ts
      spaceship.ts
      cozy-cottage.ts
  domains/
    game/
      mount-game.ts                ← UNCHANGED public API; gains optional `stage` hook
  config/
    worlds.ts                      ← env-driven world catalogue
public/
  worlds/                          ← optional self-hosted splats (else CDN URLs)
    pirate-ship.spz
    ...
apps/web-react/
  src/components/
    GameStage.tsx                  ← composes mountWorld() + mountGame()
    WorldPreview.tsx               ← lobby card preview (keyframe video poster)
```

No existing files are renamed or moved. We **only add** `src/presentation/` and
a thin React component (`GameStage.tsx`) that composes the existing
`mountGame()` with the new `mountWorld()`. This is **enhancement first**:
`mount-game.ts` keeps its current public surface.

### 3.3 Public API (single source of truth)

```ts
// src/presentation/index.ts
export type WorldId = "pirate-ship" | "spaceship" | "cozy-cottage" | "haunted-house" | string;

export type MountWorldOptions = {
  container: HTMLElement;          // same convention as mountGame
  worldId: WorldId;
  quality?: "auto" | "low" | "high";
  reducedMotion?: boolean;
  onReady?: () => void;
  onProgress?: (loadedRatio: number) => void;
};

export type WorldHandle = {
  /** Returns a CSS-transformable layer where the 2D pinball canvas is mounted. */
  getStageElement: () => HTMLElement;
  /** Cinematic dolly between balls. Resolves when the move completes. */
  flyTo: (preset: "plunger" | "table" | "overview") => Promise<void>;
  /** Toggle ambient world audio (respects existing mute service). */
  setAmbienceEnabled: (enabled: boolean) => void;
  /** Suspend rendering when tab hidden / game paused. */
  setPaused: (paused: boolean) => void;
  destroy: () => void;
};

export function mountWorld(opts: MountWorldOptions): Promise<WorldHandle>;
```

`mountGame()` gains **one optional argument**:

```ts
mountGame({ container, game, touchscreen, onMessage, stage? }):
   stage?: { getStageElement(): HTMLElement }   // NEW, optional
```

When `stage` is supplied, `mountGame` mounts its `<canvas>` into
`stage.getStageElement()` instead of `container`. When omitted, behavior is
**identical to today** (Tier 0 still works out of the box; this is the
non-breaking switch).

### 3.4 Rendering pipeline

```diagram
                      ╭───────────────────────────╮
                      │ Marble world (.spz/.rad)  │
                      ╰─────────────┬─────────────╯
                                    ▼  fetch + cache
              ╭────────────────────────────────────────────╮
              │ presentation/spark-host                    │
              │  Three.js scene  ─────►  Spark splat pass  │
              │      ▲                                     │
              │      │ camera-rig (tilt, dolly, fly)       │
              │      │                                     │
              │      ╰──── compositeLayer (CSS3D plane) ◀──┼──╮
              ╰────────────────────────────────────────────╯  │
                                                              │
              ╭────────────────────────────────────────────╮  │
              │ domains/game/mount-game (zCanvas)          │──╯
              │  Matter.js + sprite renderers (UNCHANGED)  │
              ╰────────────────────────────────────────────╯
```

The 2D `<canvas>` is positioned on a CSS3D plane inside the WebGL scene (or, in
the simplest implementation, layered above it with `mix-blend-mode: normal`
and a transparent background). Either way **the game loop is untouched** —
we never copy pixels between worlds.

### 3.5 Performance & adaptive loading (PERFORMANT principle)

- **Default world** ships as `.spz` ≤ 80 MB; very large worlds use `.rad` LOD
  (Spark streams them).
- `presentation/quality.ts` measures the first 60 frames after mount; if the
  rolling FPS < 50 we step down splat density / disable post-effects / drop
  ambience. Headless / `prefers-reduced-motion` users get the static fallback.
- Splats are cached in `Cache Storage` (service-worker friendly) keyed by
  `worldId@hash`.
- Asset preloader (existing `src/services/asset-preloader.ts`) is **enhanced**
  to optionally start the splat fetch in parallel with sprite preload — same
  service, no new equivalent.
- A single per-tab Three.js renderer instance is reused across world swaps
  (DRY: `spark-host.ts` is the single owner).

### 3.6 Tournament ↔ World binding

Add a `worldId` field to the tournament metadata read from the contract /
config:

```ts
// src/config/worlds.ts (single source of truth)
export const WORLDS = {
  "pirate-ship":  { splat: "/worlds/pirate-ship.spz",  ambience: "...",  preview: "..." },
  "spaceship":    { splat: "/worlds/spaceship.rad",    ambience: "...",  preview: "..." },
  // ...
} as const;
```

Tournament metadata (off-chain JSON pinned alongside the existing
tournament config) carries `{ tournamentId, worldId, tableId }`. The lobby
and the active-game route both read from this single map — no duplication.

### 3.7 Tier 3 (UGC) — extension points already provided

- `world-registry.ts` accepts dynamic entries (`registerWorld(id, def)`),
  so a player-generated splat URL slots in without code changes.
- The existing `MissionPool` / tournament contracts already accept arbitrary
  metadata; player-created tables register with `metadata.worldId`.
- The Splat Collider Builder
  ([https://splat-collider-builder.netlify.app](https://splat-collider-builder.netlify.app))
  output (`.glb`) maps to the existing `TableDef` SVG-collision boundary
  pipeline via a tiny `glb-to-tabledef` utility (Tier-3 only; not built now).

### 3.8 Tier 4 (3D physics) — extension points

If/when we move to Rapier 3D:
- `presentation/` already owns the Three.js scene — it becomes the renderer.
- A new `src/model/physics-3d/` lives next to existing `src/model/physics/`,
  swappable behind the same `model/game.ts` engine API.
- Sprite renderers in `src/renderers/**` are **deleted** in favor of 3D meshes
  (CONSOLIDATION: no parallel 2D/3D codepaths shipped to prod).

---

## 4. Adherence to Core Principles

| Principle           | How this plan complies                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ENHANCEMENT FIRST   | `mountGame()` keeps its current API; gains **one optional** `stage` hook. Asset preloader is extended, not duplicated.       |
| CONSOLIDATION       | When Tier 4 lands, 2D sprite renderers are **deleted**, not deprecated. No parallel pipelines.                               |
| PREVENT BLOAT       | Exactly **one** new domain (`src/presentation/`). No new global state, no new wallet code, no new contracts in Tiers 1–3.    |
| DRY                 | `src/config/worlds.ts` is the **single** world catalogue used by lobby, loader, and tournament binding.                      |
| CLEAN               | `presentation` has **no** outbound deps to game/tournament/UI. Game still has zero outbound deps.                            |
| MODULAR             | `mountWorld()` returns a small imperative `WorldHandle`, mirroring `MountedGame`. Each world's tuning lives in its own file. |
| PERFORMANT          | `.spz`/`.rad` LOD, adaptive quality based on measured FPS, splat caching, single shared Three.js renderer.                   |
| ORGANIZED           | Domain-driven layout (`presentation/` is a sibling of `game/`, `wallet/`, `tournament/`). Predictable per-world files.       |

---

## 5. Rollout plan

### ✅ Milestone M1 — "Worlded Tables" (Tier 1)  *DONE*
1. ✅ `src/presentation/` created with:
   - `index.ts` - Public API (`mountWorld`, `WorldHandle`, `isSplatSupported`, `prefersReducedMotion`)
   - `world-host.ts` - Three.js + Spark lifecycle manager with FPS-based quality degradation
   - `splat-loader.ts` - Splat caching + LOD support
   - `quality.ts` - Adaptive quality system with FPS monitor (runtime degradation wired)
   - `camera-rig.ts` - Camera rig with flyTo() and preset positions
   - `post-processing.ts` - CSS vignette, bloom, color grading
   - `world-ambience.ts` - Per-world ambient audio with ducking under game FX
2. ✅ `src/config/worlds.ts` - 5 worlds with gradients, camera presets, ambience URLs
3. ✅ `GameMount.tsx` - Integrated world rendering behind game canvas
   - Ball drain → flyToPreset('drain')
   - Ball start → flyToPreset('plunger')
   - Game over → flyToPreset('overview')
   - Ambience ducking on score changes (ball hits/bumpers)
4. ✅ `StartMenu.tsx` - World selector for practice mode
5. ✅ Reduced-motion fallback via `prefersReducedMotion()` check
6. ✅ Graceful fallback to world gradient when SparkJS unavailable
7. ✅ SparkJS loaded via CDN in `index.html`
8. ✅ Per-world camera presets (custom plunger/overview/drain per world)
9. ✅ World selection persisted in localStorage
10. ✅ Post-processing pipeline (vignette, bloom, color grading)
11. ✅ Loading overlay component (WorldLoadingOverlay)
12. ✅ Error recovery (getLoadError, fallback background)
13. ✅ SparkJS lazy-loaded on demand (not in initial bundle)
14. ✅ Accessibility: aria-label on world dropdown

**Status:** Tables render inside Marble worlds on desktop and mobile.

### ✅ Milestone M2 — "Themed Tournaments" (Tier 2)  *DONE*
1. ✅ `src/config/tournaments.ts` - Tournament metadata registry with `worldId` binding
2. ✅ `src/config/worlds.ts` - 5 worlds (Pirate Ship, Spaceship, Hobbiton, Cottage, Haunted House)
3. ✅ `GameScreen.tsx` - `worldId` prop wired to `GameMount`
4. ✅ `TournamentLobby.tsx` - Full lobby with world preview cards, entry/play buttons
5. ✅ `WorldPreview.tsx` - Gradient-based poster cards per world
6. ✅ Loading progress - `onProgress` callback in mountWorld() options
7. ✅ Per-tournament ambience track support (WorldAmbienceManager wired)

**Status:** Lobby shows themed tournament cards. Tournament 1 loads Pirate Ship, Tournament 2 loads Spaceship.

### ✅ Milestone M3 — "Cinematic polish"  *DONE*
- ✅ `camera-rig.ts` - Camera rig with flyTo(), preset positions (plunger/overview/drain/side)
- ✅ **Ball-following camera** - Real-time ball tracking through the 3D world (exponential smoothing)
- ✅ Camera wired into world-host.ts render loop
- ✅ Ball drain detection → `flyToPreset('drain')` on ball loss (pauses ball tracking during transition)
- ✅ Ball start detection → `flyToPreset('plunger')` on new ball (pauses ball tracking during transition)
- ✅ Game over → `flyToPreset('overview')` (pauses ball tracking during transition)
- ✅ Share card with world gradient on game over (ShareCard component)
- ✅ FPS monitor wired for runtime quality degradation (auto-degrades high→medium→low)
- ✅ `MountedGame` exposes `getBallPosition()` and `getBallCount()` for external tracking
- ✅ **Score milestone world reactions** - World transforms at 10K/25K/50K/100K (lights, particles, weather, breathe)
- ✅ **Ball impact particles** - 3D particle bursts at ball position on bumper hits
- ✅ **Ball-casting light** - Dynamic point light follows ball, color shifts by velocity (warm→cool)
- ✅ **WorldReactor** - Tracks milestones, multiball, impacts; triggers CSS-based world effects
- ✅ **WorldParticles** - Particle system with bumper-specific colors, milestone celebrations
- ✅ **BallLight** - CSS-based point light with radial gradient, velocity-based color interpolation
- 🔳 DOF on drain (deferred - requires WebGL post-processing pipeline)

### Milestone M4 — "Player-Generated Tables" (Tier 3)  *post-jam*
- Marble API key flow + prompt UI.
- Splat Collider Builder integration → `glb-to-tabledef` utility.
- On-chain registration of `worldId + tableHash` per custom tournament.

### Milestone M5 — "True 3D Pinball" (Tier 4)  *stretch / next jam*
- Rapier 3D, mesh renderers replace sprite renderers, deletes 2D pipeline.

---

## 6. Risks & mitigations

| Risk                                                  | Mitigation                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Splat download too large on mobile / poor connection  | `.spz` first; `.rad` LOD for big worlds; fallback to legacy 2D background under `prefers-reduced-data`.   |
| WebGL performance regression on low-end devices       | `presentation/quality.ts` adaptive degrade; static-still fallback path is always available.               |
| Visual chaos behind the playfield reduces readability | Per-world tuning file (`worlds/*.ts`) sets fog/exposure/blur; gameplay canvas always has crisp contrast.  |
| Marble license / asset terms                          | Each world entry in `worlds.ts` carries a `license` field; only worlds we have rights to ship are listed. |
| Coupling creep between game and presentation          | Architectural test (lint rule / CI grep) forbids `src/model/**` and `src/renderers/**` importing `three`. |

---

## 7. Open questions

- Tier 3 UGC: do we gate Marble API costs behind MUSD (player burns MUSD to
  generate a world) or absorb them per tournament-creation fee?
- Tier 4: do we keep the 2D engine as an "Arcade Mode" toggle, or fully
  delete (CONSOLIDATION says delete)?
- Ambience audio: source royalty-free tracks per world or use procedural audio?

### Resolved

- ~~Do we self-host the showcase splats in `public/worlds/` or hot-link the
  World Labs CDN URLs?~~ → Hot-linking from GCS works; self-hosting optional.
- ~~FPS monitor not wired~~ → Runtime quality degradation now active in render loop.
- ~~No lobby screen~~ → `TournamentLobby.tsx` ships with gradient-based world cards.
- ~~No poster images~~ → Per-world gradients serve as visual posters.
- ~~No ambience audio~~ → `WorldAmbienceManager` with ducking under game FX.
- ~~No share card~~ → `ShareCard` component with copy-to-clipboard on game over.
- ~~Dead code: spark-renderer.ts~~ → Removed orphaned files.
- ~~Ball-following camera~~ → Real-time ball tracking with exponential smoothing, pauses during cinematic transitions.
- ~~Score milestone reactions~~ → World transforms at 10K/25K/50K/100K with CSS effects (brightness, saturation, scale).
- ~~Ball impact particles~~ → 3D particle bursts at ball position with bumper-specific colors.
- ~~Ball-casting light~~ → Dynamic point light follows ball, color shifts by velocity (warm→cool).

---

## 9. Mint MCP + Three.js Skills integration plan

### Status: Skills Installed, Awaiting API Key

This section documents how we move from hand-authored worlds (5 hardcoded
`.spz`/`.rad` URLs) to an agent-driven generation pipeline. The goal is **Tier 3
UGC** — where each tournament (and eventually each player) can have a unique
world without manual asset creation.

**What's done:**
- ✅ `mint-threejs-skills` installed — agent knows the `WorldHandle` API, camera presets, quality tiers
- ✅ `mint-api` skill installed — handles generation, polling, asset retrieval
- ⏳ `MINT_API_KEY` — pending (add to `.env.local` when available)

**What's next when you're back:**
1. Generate a test world via the API (prompt → poll → fetch manifest)
2. Wire it into `src/config/worlds.ts` with proper camera presets
3. Test in the running game
4. Iterate on the world theme until it matches the Kamikaze vision

### Why now

The current pipeline is: someone generates a world in the Mint web app,
downloads the files, uploads them to GCS, and hardcodes the URL into
`src/config/worlds.ts`. This works for 5 worlds. It does not scale.

Mint MCP (`mcp.mint.gg`) + Mint Three.js Skills (`mintdotgg/mint-threejs-skills`)
give the dev agent everything it needs to generate, review, and integrate a new
world in a single flow — without ever leaving the codebase.

### Step 0 — Install the skills

Run this once in the project root:

```bash
npx skills add mintdotgg/mint-threejs-skills -a claude-code -g -y
npx skills add mintdotgg/mint-api-skill -a claude-code -g -y
```

Set the API key in the environment (never paste it into chat):

```bash
export MINT_API_KEY="..."  # from https://platform.mint.gg → Developer settings
```

### Step 1 — Generate a world on demand

From the agent, a single prompt triggers the full workflow:

```
Use the mint-api skill to generate a "sunken pirate ship with bioluminescent coral" world.
Use auto mode, poll with bounded backoff, then retrieve the artifact manifest.
Slot the runtime.runtimeUrl into src/config/worlds.ts as a new PIRATE_V2 entry.
```

The skill handles:
- `POST /v1/worlds:generate` with the prompt
- Polling `GET /v1/operations/{opId}` with exponential backoff (2s → 3.2s → … → cap 15s)
- `GET /v1/assets/world/{worldId}/artifact-manifest` to get `runtime.runtimeUrl` (the `.rad` file) and `runtime.collider.runtimeUrl` (the collision mesh)
- Writing the new world entry into `src/config/worlds.ts` following the existing pattern

### Step 2 — Review before shipping (optional but recommended)

For tournament-quality worlds, use review mode instead of auto:

```
Use the mint-api skill with generationMode: "review".
Stop at preview_ready, show me the preview image, and wait for my approve or revise decision.
```

This pauses generation so you can see the preview before it commits credits.
Revise with feedback (e.g., "make the lighting darker, add more coral") and
resume until satisfied, then approve.

### Step 3 — Wire the generated world into the game

The Mint Three.js Skills teach the agent how to integrate the generated asset
into the existing `src/presentation/` pipeline. The agent should:

1. Use the same `mountWorld()` pattern already in `src/presentation/index.ts`
2. Respect the existing `WorldHandle` API (camera presets, quality tiers,
   ball tracking, reactor events)
3. Pull the `.rad` URL from the artifact manifest's `runtime.runtimeUrl`
4. Optionally pull the collider from `runtime.collider.runtimeUrl` for
   future physics integration (see Tier 4)

### Step 4 — Add to the tournament config

Once the world is in `src/config/worlds.ts`, bind it to a tournament:

```ts
// src/config/tournaments.ts
export const TOURNAMENTS = {
  // ...existing...
  "pirate-v2": {
    id: "pirate-v2",
    name: "Sunken Treasury",
    worldId: "pirate-v2",  // matches the new entry in worlds.ts
    tableId: "table1",
    // ...
  },
};
```

### What the agent already knows (from the skills)

- **`.spz` vs `.rad`**: `.spz` is the base splat (30-350 MB); `.rad` is the LOD
  streaming version for high quality. The existing `splat-loader.ts` already
  prefers `.rad` for high tier — the agent should follow this pattern.
- **Camera presets**: The `MarbleWorld` type already has `camera` with
  `plunger`, `overview`, `drain`, and optional `side` presets. New worlds
  should define these to match the table layout.
- **Quality degradation**: The existing `quality.ts` monitors FPS and
  auto-degrades from high → medium → low. New worlds should not break this.
- **Fallback**: If SparkJS fails to load or the splat fails to download, the
  game falls back to the world's `gradient` background (already handled in
  `GameMount.tsx`).

### What's NOT useful (and why)

- **Tripo Studio**: Generates polygon meshes (.glb, .obj) with clean topology.
  Your pipeline uses Gaussian splats (point clouds), not meshes. Different
  representation, different renderer, no conversion path worth taking.
- **Mint 3D models**: Standalone .glb assets are useful for table decorations
  (bumpers, targets) but not for the world stage itself. Save this for Tier 3
  when we add agent-authored pinball components.
- **Mint MCP for browser code**: The MCP endpoint (`https://mcp.mint.gg/mcp`)
  is for the dev agent only. Never call it from the browser — all generation
  happens server-side via the API key.

### Next milestones this unlocks

- **M4 (Player-Generated Tables)**: Replace hand-authored worlds with an API
  call that generates a world from the tournament prompt, waits for completion,
  and registers the result on-chain.
- **Tier 4 (True 3D Pinball)**: The collider URL from the artifact manifest
  (`runtime.collider.runtimeUrl`) becomes the basis for 3D physics in Rapier.
  The agent already knows how to fetch and store this URL.

---

## 8. References

- Mint: <https://mint.gg>
- Mint API docs: <https://docs.mint.gg/developers/quickstart>
- Spark 2.0 web renderer: <https://sparkjs.dev/2.0.0-preview>
- Spark examples (incl. LOD): <https://sparkjs.dev/examples>
- Splat Collider Builder: <https://splat-collider-builder.netlify.app>
- Spark + Rapier physics demo: <https://github.com/bmild/spark-physics>
- Rapier physics: <https://rapier.rs>
