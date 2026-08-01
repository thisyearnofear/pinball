# Game Design Document — Kamikaze Ball (神風)

> Living document. Last updated: 2026-07-29.
> See also: [VISION.md](./VISION.md) · [KAMIKAZE_BALL.md](./KAMIKAZE_BALL.md) · [DIFFERENTIATORS.md](./DIFFERENTIATORS.md) · [NIMIQ_SETUP.md](./NIMIQ_SETUP.md)

---

## Pitch

**Drain-to-win pinball where the machine fights back.** You steer the ball INTO the drain while AI flippers try to save it. Fastest drain wins. Onchain tournaments settle in USDT (Polygon) or NIM (Nimiq). Built for the Nimiq Pay Mini Apps Competition.

One sentence: *"The pinball game where you're trying to lose and the machine won't let you."*

---

## Core Loop (30-second test)

```
ACTION    Tap/swipe to nudge the ball toward the drain
FEEDBACK  Physics responds; AI flippers scramble to save it; power-ups fire
REWARD    Drain = kanji verdict stamp (神/風/波/芽/石) + XP + rank-up
REPEAT    Next ball, harder machine, ghost of the leader racing beside you
```

A single run lasts 30–90 seconds. Three balls per game. Instant play, no wallet required for practice.

---

## Mechanics

### Modes

| Mode | Win condition | Score | Tournament? |
|---|---|---|---|
| **Kamikaze (神風)** | Drain the ball fastest | Time alive in ms (lower = better) | Yes (inverted) |
| **Classic** | Highest score | Points (higher = better) | Yes (standard) |

### Control verbs (6)

| Verb | Input | Effect |
|---|---|---|
| Nudge | Tap / drag | Blended impulse toward touch point |
| Dive | Swipe down | Hard downward impulse |
| Deploy | Swipe left/right | Lateral shove |
| Tilt-Lock | Shift / swipe up | Freezes AI flippers 1.2s (6s cooldown) |
| Charge | Hold | Aim guide + charged launch |
| Power-ups | Automatic | Crates on table; roulette picks munition or countermeasure |

### Control scheme: Shot-calling (守) — the serve-based duel

The six verbs above are the **Steer** scheme. Playtesting showed continuous
nudging feels random: a tap retains 85% of the ball's momentum, so input barely
bends a fast ball, and five stacked uncertainties (chaotic physics, AI accuracy,
hidden emergency saves, random power-ups, rubber-banding) mean a good input can
still be secretly revoked. The fix is a reframe:

> **Don't control the moving ball. Control the next shot.**

Shot-calling replaces steering with a discrete, legible contest. The ball is
held at the plunger; the player calls a shot, MAMORU contests it, a release
launches it; physics resolves the rest — no mid-flight steering. The duel starts
on the player's **first aim**: no lane, guard, or meter exists before intent.

To find what's actually fun, the scheme ships as **two isolated variants**
rather than one combined test (you can't debug six variables at once):

**守 Feint duel** — *is baiting and beating MAMORU's recovery fun?*
- Full launch accuracy; no timing meter.
- Two-stage: **BAIT** (choose a lane; FIRE locked) → MAMORU commits after a
  **human-scale** delay (Easy 1200ms · Medium 800ms · Hard 500ms — not the old
  80–250ms AI polling) → **BREAK** (switch lanes and FIRE during the recovery
  window, before it re-commits).
- The feint is **mandatory**: FIRE stays locked until MAMORU commits, so there
  is no quick-draw; firing into the guarded bait lane (never switching) is a
  save. The gotcha is the experiment.
- **Adaptive guard policy:** each serve, MAMORU rolls a per-serve policy (40%
  hold, 60% chase, seeded from the run RNG so replays re-simulate identically):
  - *Chase* — classic: commits to the bait lane after its reaction delay.
  - *Hold* — reads the feint and pre-commits a fixed lane from serve start
    (revealed by the flipper embodiment). There is no reaction race; the
    player can fire immediately. The rote script (bait→switch→fire) is a
    coin flip, not a guaranteed win.
  This breaks the rote script so feinting requires reading the guard, not
  memorizing a pattern. See `tests/sim/shot-calling-skill.sim.ts` for the
  skill-discrimination harness that validates this.
- MAMORU's guard is **embodied**: the flipper on the guarded lane rises
  (visual-only — the deterministic lane resolver is the single authority).

**守 Precision** — *is calling and executing a shot fun?*
- MAMORU visibly **pre-commits** a lane (fixed, shown from serve start); no live
  reaction race.
- Pick the open lane, then a timing meter sets launch precision.
- Misses are **signed and deterministic**: release left of center drifts left,
  right of center drifts right, distance sets the magnitude — so the player
  learns "I released late, so I pushed it right." No random scatter.
- **Tight meter:** the sweet spot is narrow (10% of the half-range) and the
  max angle error (1.0) exceeds the lateral bias (0.55), so an off-center
  release can override the intended lane. A bad release costs time (weaker
  launch + wrong direction); a good release threads the open lane.
- **Known limitation:** physics bouncing after launch can wash out the meter's
  directional effect, so a well-timed release doesn't yet reliably outperform
  a careless one. See the precision critique in
  `tests/sim/shot-calling-skill.sim.ts`.

**Both:** at the drain the contest is telegraphed and deterministic — land in
MAMORU's guarded lane and it saves (re-serve); an open lane drains (scores). No
hidden coin flip. After each shot the HUD shows the causal chain (called lane ·
accuracy · drift · landing lane · guard · SAVED/DRAINED) so only the player, not
just the code, understands why.

- **Input:** tap a side to aim/feint · RELEASE (or Space/↑/Enter) to fire.
  Legacy nudge/dive/tilt-lock/deploy gestures are disabled in shot-call mode.
- **Replay-verifiable by construction:** each serve records tick-stamped `aim`,
  `release`, `serve` events and the run's `controlScheme`; the guard commit and
  launch error derive from `(tickCount, seed)` only.
- **Status:** prototype behind a lobby toggle (Control → Steer | 守 Feint duel |
  守 Precision), serves-only. Core in `src/model/shot-calling.ts`; tuning in
  `src/config/immersion-tuning.ts` (`shotCalling`). Test each variant alone;
  combine only after one proves fun; then add mid-table possession (flipper
  cradles, catch zones).

### AI machine (the antagonist)

- AI flippers activate when the ball approaches (accuracy + reaction speed scale with difficulty)
- Difficulty: Easy (50% accuracy, 250ms reaction) · Medium (80%, 150ms) · Hard (95%, 80ms)
- Rubber-banding: crates bias toward the losing side (70/30 when behind, 60/40 when dominating)

### Power-up tug-of-war

Player munitions (help drain): Homing Warhead, Flipper Jam, Ghost Ball, Bumper EMP, Ball Swarm, Slow-Mo Trap, Tremor, Drain Amplifier.

Machine countermeasures (keep alive): Iron Dome, Bumper Frenzy, Force Field, Anti-Gravity, Ball Resurrection, Hyper Speed.

Max 1 active per side. Crates respawn every 8–12s. Durations 3–6s.

### Onchain settlement

- Scores signed EIP-191 by a trusted backend signer, submitted via `submitScoreWithSignature()`
- `finalizeWithSignedWinners()`: O(topN) gas-efficient settlement (no on-chain sort)
- Replays stored server-side; ghost of the tournament leader races beside you
- Skill-based (not chance), compliant with competition rules

### Payments

| Method | Chain | How |
|---|---|---|
| USDT (ERC-20) | Polygon | approve + transferFrom via Nimiq Pay EVM wallet |
| NIM (native) | Nimiq | `sendBasicTransactionWithData()` via `@nimiq/mini-app-sdk` |
| POL (native) | Polygon Amoy | Direct value with tx (testnet only) |

---

## Progression

| Layer | What advances | Hook |
|---|---|---|
| **Early win** | First deliberate action grants bonus XP instantly | Hook before the first run ends |
| **Skill** | Player gets better at nudging, timing tilt-locks | Flow state via difficulty ladder |
| **Rank** | XP → ranks (recruit → shogun), streaks, daily PB | RankStrip in lobby; NEW DAILY BEST badge |
| **Run verdict** | S/A/B/C/D grade with kanji stamp per run | Instant dopamine; par calibrated so passive play gets B/D, not S/A |
| **Kami Trials** | Pause-time mini-games grant temporary boons | Variable reward schedule; seeded daily |
| **Tournament** | Enter → play → leaderboard → prize payout | Killer motivation; ghost racing |
| **Social** | Friend challenge links, share cards, community dojo | Socializer motivation; challenge a rival's last run |

Pacing: early wins (bonus XP on the very first touch, first grade after first run), gradually increasing challenge (AI difficulty), rest beats (lobby, Kami Trials between runs), meaningful choices (mode, difficulty, payment method).

---

## Art Style

- **Identity:** Japanese neo-arcade. Kanji watermarks (神風), sakura petals, taiko/furin SFX
- **Palette:** ai (indigo #1a0a2e), shu (vermillion #e34234), kin (gold #d4a017)
- **CRT cabinet:** scanline overlay, neon title, dark background with world-specific accents
- **Worlds:** each tournament binds to a themed world (Hobbiton, Pirate Ship, Spaceship, …) with unique gradients
- **Kamikaze inversion:** red hostile bumpers, green glowing drain (target), cold metallic AI flippers
- **Typography:** Hiragino Mincho ProN / Noto Serif JP for kanji; Neon Overdrive for titles

---

## Audio

- Synthesized WebAudio SFX (no asset downloads): per-verb sounds (nudge, dive, deploy, tilt-lock, charge tick)
- Taiko drum on drain; furin (wind chime) on power-up pickup
- Sakura storm SFX on multiball; machine taunt text overlays ("SAVED!", "PATHETIC", "NOOO")
- Reduced-motion setting disables CRT overlay and particles

---

## Platform

- Next.js 16 static export, deployed on Netlify
- Runs inside Nimiq Pay WebView (mini app) and standalone browser
- Matter.js physics + zCanvas rendering, client-only (`dynamic({ ssr: false })`)
- Backend: Fastify (score signing, replay storage, NIM entry verification)
- Contracts: Solidity 0.8.28 (TournamentManager ERC-20 + Native variants, MissionPool)
- Tests: 251 frontend + backend + contract suites, all passing; plus a sim harness (`tests/sim/`) that runs headless bot matchups to validate skill discrimination
- MIT license, public GitHub repo

---

## Player psychology coverage (Bartle types)

| Type | How we serve it |
|---|---|
| **Achiever** | Grades, XP, ranks, daily PB, streaks |
| **Explorer** | Multiple worlds, Kami Trials, power-up variety |
| **Socializer** | Friend challenge links, share cards, leaderboards |
| **Killer** | Tournament competition, ghost racing, inverted dominance |

---

## Anti-patterns check

| ❌ Don't | ✅ We do |
|---|---|
| Design in isolation | Playtested with real users; control overhaul driven by feedback |
| Polish before fun | Core drain-to-win loop fun before any polish |
| Force one way to play | 6 control verbs, 2 modes, 3 difficulties, 2 payment methods |
| Punish excessively | Rubber-banding, boons, instant retry, free practice |
| Reward passivity | Verdict pars calibrated against a bot harness so doing nothing gets B/D, not S/A; adaptive guard policy breaks the rote feint script |
