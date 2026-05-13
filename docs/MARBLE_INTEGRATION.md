# Marble × Pinball Integration

> **Vision:** Mezo Pinball Arcade is no longer "another web pinball game." Each
> table lives **inside a generative photoreal 3D world** authored by World Labs'
> Marble. Tournaments are themed worlds. Players will eventually be able to
> generate their own table-worlds from a text prompt and stake them on-chain.

This document defines the **vision, UX, architecture, and rollout plan** for
integrating [Marble](https://marble.worldlabs.ai) (generative world model) and
[Spark](https://sparkjs.dev/2.0.0-preview) (Gaussian Splat web renderer) into
the existing engine, in line with our Core Principles.

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

This integration directly supports our pitch:
- **Web3-native arcade** (Mezo / MUSD prizes) +
- **AI-native presentation** (Marble worlds) +
- **User-generated content** (player-prompted tables).

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
   - `world-host.ts` - Three.js + Spark lifecycle manager
   - `spark-renderer.ts` - SparkJS renderer implementation
   - `splat-loader.ts` - Splat caching + LOD support
   - `quality.ts` - Adaptive quality system with FPS monitor
   - `camera-rig.ts` - Camera rig with flyTo() and preset positions
2. ✅ `src/config/worlds.ts` - World definitions (Hobbiton, Spaceship, Cottage)
3. ✅ `GameMount.tsx` - Integrated world rendering behind game canvas
   - Ball drain → flyToPreset('drain')
   - Ball start → flyToPreset('plunger')
   - Game over → flyToPreset('overview')
4. ✅ `StartMenu.tsx` - World selector for practice mode
5. ✅ Reduced-motion fallback via `prefersReducedMotion()` check
6. ✅ Graceful fallback to gradient background when SparkJS unavailable
7. ✅ SparkJS loaded via CDN in `index.html`
8. ✅ Per-world camera presets (custom plunger/overview/drain per world)
9. ✅ World selection persisted in localStorage
10. ✅ Post-processing pipeline (vignette, bloom, color grading)
11. ✅ Loading overlay component (WorldLoadingOverlay)
12. ✅ Error recovery (getLoadError, fallback background)
13. ✅ SparkJS lazy-loaded on demand (not in initial bundle)
14. ✅ Accessibility: aria-label on world dropdown

**Status:** Tables render inside Marble worlds on desktop. Mobile TBD.

### ✅ Milestone M2 — "Themed Tournaments" (Tier 2)  *DONE*
1. ✅ `src/config/tournaments.ts` - Tournament metadata registry with `worldId` binding
2. ✅ `src/config/worlds.ts` - Updated with Pirate Ship world (for Tournament 1)
3. ✅ `GameScreen.tsx` - `worldId` prop wired to `GameMount`
4. ✅ `src/app/ui/WorldPreview.tsx` - Lobby card preview component
5. ✅ Loading progress - `onProgress` callback in mountWorld() options
6. ⏳ Per-tournament ambience track (deferred)

**Status:** Tournament 1 loads Pirate Ship, Tournament 2 loads Spaceship.

### ✅ Milestone M3 — "Cinematic polish"  *DONE*
- ✅ `camera-rig.ts` - Camera rig with flyTo(), preset positions (plunger/overview/drain/side)
- ✅ Camera wired into world-host.ts render loop
- ✅ Ball drain detection → `flyToPreset('drain')` on ball loss
- ✅ Ball start detection → `flyToPreset('plunger')` on new ball
- 🔳 DOF on drain (deferred - requires post-processing pipeline)
- 🔳 Share card uses world still (deferred - requires Marble keyframe export)

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

- Do we self-host the showcase splats in `public/worlds/` or hot-link the
  World Labs CDN URLs? (Lean: self-host the small ones, CDN the 16 M+ ones.)
- Tier 3 UGC: do we gate Marble API costs behind MUSD (player burns MUSD to
  generate a world) or absorb them per tournament-creation fee?
- Tier 4: do we keep the 2D engine as an "Arcade Mode" toggle, or fully
  delete (CONSOLIDATION says delete)?

---

## 8. References

- Marble: <https://marble.worldlabs.ai>
- Marble API docs: <https://docs.worldlabs.ai/api>
- Spark 2.0 web renderer: <https://sparkjs.dev/2.0.0-preview>
- Spark examples (incl. LOD): <https://sparkjs.dev/examples>
- Splat Collider Builder: <https://splat-collider-builder.netlify.app>
- Spark + Rapier physics demo: <https://github.com/bmild/spark-physics>
- Rapier physics: <https://rapier.rs>
- World Labs API examples (web): <https://github.com/worldlabsai/worldlabs-api-examples>
