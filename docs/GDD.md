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
| **Run verdict** | S/A/B/C/D grade with kanji stamp per run | Instant dopamine; par scales with difficulty |
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
- Tests: 149 frontend + backend + contract suites, all passing
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
