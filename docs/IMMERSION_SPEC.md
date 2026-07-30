# Immersion Spec — "The Machine Has a Self"

> Living document. Created: 2026-07-30. Target: competition demo first, retention depth second.
> Builds on [GDD.md](./GDD.md) · [KAMIKAZE_BALL.md](./KAMIKAZE_BALL.md) · [DIFFERENTIATORS.md](./DIFFERENTIATORS.md)

---

## Status

| System | Phase | State |
|---|---|---|
| A1 · Machine mood (MAMORU 守) | demo | ✅ shipped — `computeMood` + mood-keyed taunts + mood-colored overlay |
| A2 · Kill cam | demo | ✅ shipped — ball capture + 900ms slow-mo + camera push + deep taiko |
| A3 · Hash-sealed stamp | demo | ✅ shipped — `sealFromReplayHash` + verdict seal overlay + share-card stamp |
| A4 · World-physics coupling | demo | ✅ shipped — `worldGravityX/Y` + per-world sway/drift + tournament ruleset line |
| B1 · Machine memory | retention | ✅ shipped — persistent 守 memory, greeting/nemesis/habit taunts |
| B2 · Relationship-skinned ranks | retention | ✅ shipped — rank-tier address; max rank earns the machine's silence |
| B3 · Adaptive audio (taiko pulse) | retention | ✅ shipped — mood-driven heartbeat + 200ms audio dodge |

**Verified:** 213 frontend unit tests + a real-engine sim guard proving the
kill cam never alters the scored time-alive (hard rule 3). The machine mood is
derived purely from seeded/run state; its only physics touch is a bounded
±0.05 accuracy variance within the rubber-band precedent, so replays stay
verifiable.

---

## Premise

The inversion already gives us an antagonist; this spec turns it into a **character**, gives every
run a **signature moment**, makes the **cryptographic proof visible**, and makes the **worlds play
instead of just render**. Four systems, one identity:

1. **MAMORU (守)** — the machine as a named guardian with moods, memory, and grief
2. **Kill cam** — the last 900ms of every run becomes the clip people share
3. **Sealed stamp** — the kanji verdict carries the replay hash; the proof is the aesthetic
4. **World-physics coupling** — each world bends the table; tournament choice = ruleset choice

### Character concept

The machine is not evil. It is a **guardian that loves the ball**. Draining is bereavement.
That gives the taunt system emotional range no "evil AI" has: pride when it saves, panic when
the ball nears the gate, grief when it fails, and — over many encounters — respect for you.

> *"It only wants to save the ball. You won't let it."*

Name proposal: **MAMORU** (守, "to protect"). HUD prefix changes from `MACHINE:` to `守:`.

---

## Hard rules (protect the moat)

These constraints keep every feature below compatible with replay verification and tournaments:

1. **Physics time is `tickCount`, never wall clock.** Any feature that touches gravity, AI
   decisions, or ball motion must derive from `getTickCount()` + `rngSeed` (deterministic).
   Wall-clock is only for cosmetics (overlays, audio, DOM transforms).
2. **Memory talks, never touches.** Cross-session machine memory (localStorage) may drive
   taunt text and greetings only. It must never influence physics or AI in a way that isn't
   reconstructible from the seeded run — otherwise replays stop being verifiable.
3. **Kill cam is post-outcome.** Score for the ball is frozen *before* the drama starts. The
   cam must have zero effect on `time-alive` scoring.
4. **Mood-driven AI variance follows the rubber-band precedent:** derived from seeded rng,
   bounded (±0.05 accuracy within the difficulty band), symmetric for all players.

---

## Phase A — demo systems (P0)

### A1. Machine mood state machine

Today `updateRubberBand` (kamikaze.ts:192) silently writes `rubberBandBias`, and game.ts
already detects bias crossings (`pendingMomentumShift`, game.ts:480–492, exposed via
`getMomentum()`/`consumeMomentumShift()` game.ts:125–126). We surface that hidden math as
**visible emotion**.

**New pure function** (testable, no side effects):

```ts
// src/model/kamikaze.ts
export type MachineMood = "calm" | "smug" | "wary" | "desperate" | "enraged" | "grieving";
export function computeMood(signals: MoodSignals): MachineMood;
```

`MoodSignals` is assembled in game.ts from state that already exists:

| Signal | Source |
|---|---|
| `timeAliveMs` | `now - kamikaze.roundStartTime` (same as updateRubberBand) |
| `drainStreak` | `KamikazeState.drainStreak` (definitions/game.ts:148–175) |
| `recentSave` | AI save site, game.ts:632 |
| `nearDrain` | drain proximity factor already computed at game.ts:483–488 |
| `playerPowerUpActive` | `hasPowerUp(...)` (kamikaze.ts:247) |

Transitions:

| Mood | Enter when | Behavior |
|---|---|---|
| `calm` | default, timeAlive < 8s | baseline taunts, slow taiko pulse |
| `smug` | spike, 2.5s after an AI save | save taunt pool, pulse holds |
| `wary` | timeAlive > 8s or player munition active | edged taunts, pulse 1.5× |
| `desperate` | timeAlive > 15s (same threshold as bias 0.7) | over-committed saves: accuracy +0.05, occasional seeded whiff; grief-tinged taunts |
| `enraged` | `drainStreak >= 2` (fast player drains) | accuracy −0.05 (tilted = sloppy), short furious taunts, pulse 2× irregular |
| `grieving` | spike, during kill cam | final-line pool, pulse stops dead |

**Hook points:**

- `KamikazeState` gains `mood: MachineMood` + `moodSince: number` (definitions/game.ts:148–175);
  reset in `startRound` (game.ts:762–774) alongside the other per-ball resets.
- `computeMood` called once per AI check tick (already throttled by `aiReactionMs`,
  kamikaze.ts:93) — cheap.
- Accuracy nudges apply inside `updateAIFlippers` where accuracy is already modified by
  IRON_DOME / SAKURA_STORM (kamikaze.ts:~110) — same pattern, bounded ±0.05.
- Exposure to UI/audio follows the momentum precedent: module-level `getMachineMood()`
  in game.ts (pattern at game.ts:121–130).

**Taunt pools become mood-keyed.** Existing pools (kamikaze.ts:363–374) become the `calm`
tier; new pools per mood. Examples:

- smug (save): `"MINE."`, `"Not today. Not ever."`, `"I read you like a table schematic."`
- wary: `"Persistent."`, `"You fight like the last one. They drained too."`
- desperate: `"STAY. STAY—"`, `"Please. Not this one."`, `"I cannot lose another."`
- enraged: `"ENOUGH."`, `"You think this is skill?"`
- grieving (drain): `"…I failed it."`, `"It trusted me."`, `"NOOO"` (kept from current pool)

**UI:** taunt overlay (GameMount.tsx:1136) color shifts per mood (calm red `#ff4444` →
desperate amber `#f59e0b` → enraged white-hot → grieving dim indigo). Prefix `守:`.

### A2. Kill cam (the signature moment)

Slow-mo infrastructure already exists: `requestSlowMo(durationMs, target)` (game.ts:115) with
eased timeScale (game.ts:466–471), and an auto slow-mo near drain (game.ts:483–488). The kill
cam is a **directed sequence** on the drain-success branch (game.ts:655–684), inserted after
score freeze, before `removeBall` (game.ts:667):

| t (wall) | Beat | Mechanism |
|---|---|---|
| 0ms | Commit | `requestSlowMo(900, 0.18)`; `duckMusic(900, 0.10)` (audio-service.ts:125) |
| 0–900ms | Camera push | CSS `transform: scale(1.06) translateY(-2%)` on the playfield container, 900ms ease — DOM-only, no physics |
| 0ms | Ball capture | `Matter.Body.setStatic(ballBody, true)`; ball sinks into the drain glow (canvas alpha/scale fade, ~600ms) |
| ~250ms | World reacts | `worldHandle.triggerImpact(1.0)` — presentation API already exists (world-host) |
| ~300ms | Grief line | mood = `grieving`; final-line taunt via existing `AI_TAUNT` path (game.ts:663) |
| impact | Taiko + furin | deep taiko variant (audio-service.ts:151, lower fundamental), furin tail (audio-service.ts:185) |
| 0ms | Haptics | existing `haptics.drainVictory()` (game.ts:661) |
| 900ms | Release | `removeBall`; existing `endRound(game, 2000)` window absorbs the sequence |

Score safety: the drain score is captured from `getKamikazeScore` before this block runs
(current code already computes score before `removeBall`), and scoring is wall-clock while the
cam only stretches physics ticks — so time-alive is unaffected. Hard rule 3 holds.

Ghost/attract modes: kill cam runs in attract mode too (it is the lobby's best advertisement),
but is skipped during ghost replay viewing to keep the timeline pure.

### A3. Hash-sealed verdict stamp

The replay hash already exists: `keccak256(toUtf8Bytes(replayJson))` (GameMount.tsx:582),
bound into signed metadata (GameMount.tsx:603). We make it **visible identity**.

**Seal derivation (pure util, testable):**

```ts
// src/utils/seal.ts
export function sealFromReplayHash(hash: string): { fragment: string; ring: string };
// fragment = hash.slice(2, 6)          // e.g. "a6f3"
// ring     = hash byte 0 → one of 5 vermillion ring rotations/imperfections (hanko feel)
```

**Rendering:**

- `CelebrationOverlay` (ui/CelebrationOverlay.tsx, verdict block lines 78–122): beneath the
  verdict kanji, render the seal — Mincho fragment + CSS hanko ring (rotated imperfect circle,
  `#e34234`). Reads: `神 · a6f3`. Sub-caption: `"sealed"` (or `"unsealed · practice"` when no
  hash — see below).
- New prop `replayHash?: string` threaded GameMount → GameScreen `handleRunEnd` →
  CelebrationOverlay.
- `ShareCard` / `share-card-image.ts`: stamp the seal ring + fragment onto the card image with
  microcopy `"provably sealed · replay hash a6f3…"`. The share card now literally carries the
  cryptographic proof — differentiator and aesthetic in one object.
- Practice runs: if recording is active the seal appears (honest); if not, an outline-only
  ring with `"unsealed · practice"` — the absence is itself a tutorial on what sealing means.

### A4. World-physics coupling (MVP)

Gravity is set once (engine.ts:75, `GRAVITY = 0.85`) and the engine is reachable via
`getPhysicsEngine()` (game.ts:133). The tick loop (game.ts:502–516) gives us a deterministic
clock. MVP = two worlds bend gravity, everything else stays still.

**Config** (src/config/worlds.ts, `MarbleWorld` line 9):

```ts
physics?: {
  sway?: { amplitude: number; periodTicks: number };  // gravity.x oscillation
  gravityScale?: number;                              // multiplies gravity.y
};
```

Assignments: `PIRATE_SHIP`: `sway { amplitude: 0.06, periodTicks: 240 }` (gentle 4s roll);
`SPACESHIP`: `gravityScale: 0.92` + `sway { amplitude: 0.02, periodTicks: 600 }` (floaty drift).
Others: none (yet). Values tuned in playtest.

**Application:** per tick inside `handleEngineUpdate`, before the drain check:

```ts
if (game.worldPhysics?.sway)
  engine.gravity.x = Math.sin((2 * Math.PI * tickCount) / sway.periodTicks) * sway.amplitude;
engine.gravity.y = GRAVITY * (game.worldPhysics?.gravityScale ?? 1);
```

`tickCount`-only (hard rule 1). Reset `gravity.x = 0` in `init`/`startRound`.

**Flow:** GameScreen already resolves `activeWorldId` (~line 182); GameMount resolves the world
(line 317). Add `worldPhysics` to the game def passed to `mountGame`, looked up from
`getWorldById(worldId)`.

**Replay completeness:** `ReplayDigest` (replay-recorder.ts:27) gains `world?: string`. The
verifier's plausibility bounds are unaffected by a ±0.06 gravity.x sway (ball stays in bounds);
the field exists so future exact re-simulation has full context.

**Tournament surface:** tournament cards show the physics modifier as the ruleset line:
"Pirate Ship — rolling seas (table sways)". Tournament choice = physics choice. Seeded,
deterministic, verifiable — this is "tournament-as-world" made literal.

---

## Phase B — retention systems (P1)

### B1. Machine memory (persistent adversary)

New key inside the `ps_data` blob (utils/local-storage.ts pattern):

```ts
// "pinball_machine_memory"
{
  encounters: number; firstSeenDay: string; lastSeenDay: string;
  bestPlayerDrainMs: number | null; lastRunMs: number | null;
  habits: { left: number; center: number; right: number; dives: number; tiltLocks: number };
}
```

- **Written** at run end in GameScreen `handleRunEnd` (alongside `recordRunProgress`).
- **Habit counters** incremented in `nudgeBallToward` (game.ts:810, bucket `tapX` into
  thirds) and the dive site (game.ts:824).
- **Read** at `startRound` → greeting line injected as a special `AI_TAUNT`:
  - First meeting: `"A new killer. I am 守. I will not let you."`
  - Returning: `"You again. Last time: {lastRunMs}ms. I have practiced."`
  - Nemesis (best drain < 6s): `"{bestPlayerDrainMs}ms. I dream about that number."`
- **Habit taunts** when one bucket ≥ 60% after ≥ 10 nudges: `"Left again? Predictable."`
- **No mechanical adaptation** in Phase B — memory talks, never touches (hard rule 2).
  If we later want pre-positioning, it must derive from the seeded run, not localStorage.

### B2. Relationship-skinned progression

Ranks are already wind-themed (progression.ts:17–24: そよ風 → 神風). Re-skin the *delivery*,
keep the math:

| Rank tier | Machine's address |
|---|---|
| Breeze / Tailwind | dismissive (`"A breeze. Barely worth saving against."`) |
| Gale / Storm | wary (`"Storm-class. Noted."`) |
| Tempest | strained respect (`"I studied your replays. All of them."`) |
| Kamikaze (max) | **silence** — no greeting, just `"…"`; save taunts become short and subdued |

Silence-as-respect is the punchline of the whole progression system and costs nothing but a
lookup keyed on `rankForLevel(level)`.

### B3. Adaptive audio in full

Phase A delivers kill-cam duck + deep taiko. Phase B adds the continuous layer:

- **Machine pulse:** synthesized taiko heartbeat (no assets, per the WebAudio synth pattern in
  audio-service.ts:151–312). Lookahead scheduler (100ms interval, 200ms schedule-ahead),
  pattern per mood: calm 60bpm single low hit · wary 90bpm doublet · desperate 120bpm + noise
  burst · enraged irregular · grieving: **stops**. Mixed ~−18dB under the music loop
  (`enqueueTrack` graph, audio-service.ts:335).
- **Audio dodge:** on an AI save with high drain proximity (game.ts:632), 200ms masterGain
  cut — silence reads louder than any SFX. New `momentarySilence(ms)` in audio-service beside
  `duckMusic` (line 125).
- Driven by `getMachineMood()` from A1; respects existing mute prefs and `setAudioSuppressed`
  (attract mode handles its own mix).
- Optional: wire `ambienceUrl` (world-ambience.ts already implements the ducking loop manager;
  no world defines a URL yet) for sakura-shrine furin ambience.

---

## Demo beat updates (docs/DEMO_SCRIPT.md)

| Time | Beat | System shown |
|---|---|---|
| 0:00 | Attract mode: machine greets, saves, taunts | A1 character |
| 0:15 | First player drain → kill cam | A2 signature moment |
| 0:30 | Rally past 15s → desperate mood swing live | A1 visible tilt |
| 0:45 | Celebration: sealed stamp close-up → share card | A3 proof-as-aesthetic |
| 1:00 | "This table sways — the world is the ruleset" (pirate) | A4 world physics |
| 1:15 | Ghost race vs leader | existing |

---

## Implementation order (Phase A)

1. **A1 mood core** — `computeMood` pure fn + state fields + mood-keyed taunts + overlay colors.
   No physics change yet (accuracy nudges behind a flag, tuned in step 4).
2. **A2 kill cam** — biggest visual wow per hour; all infrastructure exists.
3. **A3 sealed stamp** — small surface, huge story; needs only prop threading + seal util.
4. **A4 world physics** — tune sway/gravityScale by feel; replay digest field.
5. Demo script + tests.

## Testing plan

- `computeMood`: pure transition table tests (each signal → expected mood, hysteresis).
- Kill cam: drain-time score identical with cam on/off (rule 3 regression guard).
- `sealFromReplayHash`: deterministic fragment/ring; malformed hash handling.
- World physics: same seed + tick → identical `gravity.x` (determinism); gravity reset between
  rounds; replay digest includes `world`.
- Habit bucketing + greeting selection: pure selector tests.
- Backend: verifier unchanged (bounds-based); add digest `world` field passthrough test.

## Anti-goals (explicitly not doing)

- No mechanical habit-adaptation from localStorage (breaks replay verifiability).
- No new audio assets for the pulse layer (synthesized, consistent with existing identity SFX).
- No kill cam in ghost-replay viewing.
- No mood accuracy swing beyond ±0.05, and never outside the difficulty band.
