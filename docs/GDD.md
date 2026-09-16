# Game Design Document — Kamikaze Ball (神風)

> Living document. Last updated: 2026-09-15.
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

A run is **best of 3 balls**: each ball's score is its drain time, and the game
score is the fastest. A single drain is seconds (2–6s typical), so the three-ball
arc — not the single drain — is the session. Instant play, no wallet required for
practice.

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
| Nudge | Tap / click | Blended impulse toward the touch point |
| Dive | Swipe down / ↓ | Hard downward impulse |
| Deploy | Double-tap / D | Lateral shove |
| Tilt-Lock | Swipe up / Shift | Freezes AI flippers 1.2s (6s cooldown) |
| Charge | Hold (pointer **or Space**) | Aim guide + charged nudge, up to 3× |
| Power-ups | Automatic | Crates on table; roulette picks munition or countermeasure |

A charge is *felt* as it builds: each notch (1×, 2×, 3×) lands a charge-tick
sound and a deepening haptic, so the power reads without watching the bar. This
is the verb the whole mode rests on, and before this pass a hold gave no sound
and no tactile read at all — you could charge to full and only see it.

Space charges the same nudge for keyboard players, who otherwise had no nudge
verb in this mode (only flippers, dive, deploy, tilt-lock). With no pointer to
aim by, it resolves to a **save nudge** — up-table and away from the nearer wall
— which is the nudge you actually want when you cannot point.

### Feel — the haptic vocabulary

Haptics carry the verbs, so they are ranked rather than fire-and-forget. Two
properties of the Vibration API force that (both from MDN):

- **A new pattern halts the one in progress.** Played naively, a 15 ms flipper
tap truncates the 190 ms drain fanfare, and a bumper run re-triggers itself every
35 ms until it reads as one continuous buzz.
- **iOS Safari has no Vibration API at all.** On an iPhone every call is a no-op,
so the settings screen says so rather than offering a switch that does nothing.
It is the main reason the same beats also carry audio and a visual reaction.

| Event | Pattern (ms) | Rank | Hold |
|---|---|---|---|
| Flipper | 15 | 0 | — |
| Charge notch 1 / 2 / 3 | 8 / 12 / 16 | 0 | — |
| Nudge (tap) | 22 | 1 | — |
| Charge release, 1× → 3× | 22 → 52 | 1 | — |
| Dive, and the tap nudge in Classic | 35 | 1 | — |
| Tilt warning, level 1 → 3 | 16-runs, one more run per level | 1 | — |
| Tilt-lock on cooldown | 20·40·20 | 1 | — |
| Shot release: poor · good · perfect | 12·34·12 · 24 · 18·26·42 | 1 · 1 · 2 | perfect 130 |
| MAMORU save | 25 | 2 | 80 |
| Power-up | 15·30·15 | 2 | 90 |
| Tilt — the table gives up | 50·60·140 | 2 | 220 |
| Drain victory | 40·60·90 | 3 | 200 |

Within its gap the same event cannot re-fire; a higher rank always plays, and
may cut a lower one short; a lower rank is **dropped, never queued** — a flipper
tap swallowed by the fanfare does not surface as a late buzz. The shot verdict's
middle boundary is the mechanic's own `holdAccuracy`, so re-tuning the skill gate
re-tunes the feel with it, and Feint (no meter, accuracy always 1) gets a neutral
confirm rather than a verdict it did not earn.

#### The visual echo

Haptics are the narrowest of the three channels: iOS Safari has no Vibration API
at all, and a desktop browser exposes one that drives no hardware. So the events
above also carry a **weight** for a visual echo — a rim flash drawn across the
table (`src/utils/screen-pulse.ts`), 1 for a verb and 2 for a beat — and the
events where an echo would be noise carry none: a flipper already animates, and
at a 45ms gap it is the one event frequent enough to strobe.

The echo rides the same vocabulary *because* it rides the same engine, and so
inherits the gaps and holds: it can no more strobe the screen than the motor can
buzz continuously. It is a **separate channel** from the haptics switch — muting
the buzz is not a request for a silent screen — and it is switched off by
`prefers-reduced-motion`, where the audio still carries the beat. Colour is left
to the existing world-reaction flash, so the two systems do not both claim the
same effect. It is drawn as opacity on one overlay (clear centre, bright rim) so
the playfield stays readable and the cost stays on the compositor.

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
  skill-discrimination harness that validates this — it runs on every pull
  request, alongside a watch that fails the run if a physics draw ever comes
  from an unseeded source (`.github/workflows/sim-gate.yml`).
- MAMORU's guard is **embodied**: the flipper on the guarded lane rises
  (visual-only — the deterministic lane resolver is the single authority).

**守 Precision** — *is calling and executing a shot fun?*
- MAMORU visibly **pre-commits** a lane (fixed, shown from serve start); no live
  reaction race.
- Pick the open lane, then a timing meter sets launch precision.
- **The landing lane is resolved from the shot, not the descent.** The meter is
  a precision gate: a release inside the sweet spot (accuracy ≥ `holdAccuracy`)
  holds the called lane; a wild release loses the call and lands MAMORU's lane
  (the save). It is deterministic — no random scatter — so input → error →
  outcome is learnable.
- The ball is **guided into that lane** at a commit gate just above the drain
  (a real, bounded lateral velocity), so what the player sees matches the
  outcome. This replaced a physically-degenerate design: from the right plunger
  the ball rode the right channel, crossed at the top, and the bottom funnel
  herded *every* shot to the central drain, so the raw landing x never crossed
  the lane boundary and both the aim and the meter were meaningless. See the
  precision skill-gate assertion in `tests/sim/shot-calling-skill.sim.ts`.
- **Tight meter:** the sweet spot is narrow (10% of the half-range), so holding
  the call takes real timing; a bad release costs the save and the re-serve time.

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
- **Status:** prototype behind a lobby **Advanced** disclosure. **Steer is the
  ranked default**; Advanced reveals 守 Feint duel | 守 Precision. The two
  variants are not peers of the default until one proves fun — exposing them as
  equal options made an unproven mechanic look like a shipped feature. Core in
  `src/model/shot-calling.ts`; tuning in `src/config/immersion-tuning.ts`
  (`shotCalling`). Test each variant alone; combine only after one proves fun;
  then add mid-table possession (flipper cradles, catch zones).

### Readability rules (UI)

Four constraints keep a seconds-long drain legible. They are rules, not
preferences:

1. **The HUD is a glance, not a dashboard.** Time, lives and streak are always
   on; everything else (time tax, munition, underworld charge) appears only when
   it applies. A four-second run cannot afford reading.
2. **Teach on the table, not in front of it.** The first run has **no intro
   slides** — no screen the player must page through before touching the
   machine. Instead `src/config/table-coach.ts` plays cues **on the playfield,
   while the ball is live**: one card carrying both the inversion and the
   winning verb, then a contextual callout the moment the table taxes the player.
   The card is `pointer-events: none`, so a tip can never eat the nudge it asks
   for. Cues are selected from *observations* (engaged / dived / taxed) rather
   than an event stream, so the outcome never depends on the order the player
   does things. Each cue carries an auto-dismiss budget in seconds, because a
   run is measured in seconds. **Zero blocking beats.** A standing **? How to
   win** chip on the table carries both depth and breadth: **tap** replays the
   script from the top, **hold** (550ms) opens the full reference. It swallows
   the tap either way, so asking for help is never a nudge, and the hold is only
   wired when there is a guide to open. A hold is one gesture, not two — the
   click it produces is eaten. The time-tax
   callout is edge-triggered on the tax counter so a replay waits for a *new*
   hit rather than reopening something the player already understood. The secondary verbs
   (power nudge, munition, tilt-lock) live in **How to Play**
   (`extraControlLines()`), never in the critical path; the desktop side panel
   owns the same reference. Transient cues (charge feedback, "munition banked")
   still fire when relevant.
3. **A save must explain itself.** MAMORU's emergency save is named together with
   its counter-play ("a drainward nudge beats the roll", or the countermeasure
   that fired). An adversary that simply refuses to lose reads as unfair rather
   than hard.
4. **The proof never covers the product.** In the replay viewer the seed-audit and
   score-metadata panels sit **below** the replay and stay **collapsed** behind a
   one-line `AUDIT` status and an *Audit trail* toggle. The thing you came to
   watch comes first; the evidence is one tap away.

5. **The lobby asks for nothing either.** The same rule one screen earlier: a
   newcomer cannot evaluate two game modes, three machine difficulties and three
   control schemes before playing any of them, so the lobby leads with a single
   **PLAY NOW** and puts every picker behind one **Change setup** disclosure that
   opens **closed**. The toggle carries a summary of what the run will actually
   be (`Kamikaze 神風 · machine: medium · control: Steer`), so the setup is
   *stated* rather than *asked for*, and never has to be opened just to check it.
   Inside the panel all three control schemes sit side by side — the block is
   already opt-in, so a second nested disclosure would only be one more thing to
   open. The connect-a-wallet prompt stays, but **below** the run: "what is
   this" is a better first question than "do you have a wallet".
   (`tests/unit/game/arcade-lobby.spec.ts` guards the closed default.)

**The cheat-sheet replaces itself.** The persistent one-line control cheat-sheet
still appears on the first ball, but **not on a coached run** — the coach is
saying the same thing better, and saying it twice is what makes a HUD read as a
dashboard.

**Time tax:** bumper/trigger assists cost **150ms / 750ms** (down from
500/2500). The old values made avoiding the table's toys the optimal play; a
light tax keeps the machine's assists meaningful without dominating the clock.
See [KAMIKAZE_BALL.md](./KAMIKAZE_BALL.md).

### AI machine (the antagonist)

- AI flippers activate when the ball approaches (accuracy + reaction speed scale with difficulty)
- Difficulty: Easy (50% accuracy, 250ms reaction) · Medium (80%, 150ms) · Hard (95%, 80ms)
- Rubber-banding: crates bias toward the losing side (70/30 when behind, 60/40 when dominating)
- **Named escalation:** the HUD shows MAMORU's current mood state (CALM → SMUG →
  WARY → DESPERATE → ENRAGED → GRIEVING) with a one-line reason for it.
  Rubber-band difficulty that goes unnamed reads as the game cheating; naming the
  state makes the same escalation read as character. Copy in
  `src/utils/mood-display.ts`.

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
- Looping music tracks are local MP3s, and they are the largest thing the game sends. Encoded at 112 kbps (4.2 MB for both tables, down from 7.0 MB at ~190 kbps) and withheld entirely when the browser reports `saveData` or a `2g`/`slow-2g` link — a few megabytes of soundtrack is not worth the run it would degrade
- The track is fetched at game init, which `GameMount` only reaches after the 3D world has loaded, so the music never races the assets that gate play
- Reduced-motion setting disables CRT overlay and particles

---

## Platform

- Next.js 16 static export, deployed on Netlify
- Runs inside Nimiq Pay WebView (mini app) and standalone browser
- Matter.js physics + zCanvas rendering, client-only (`dynamic({ ssr: false })`)
- Backend: Fastify (score signing, replay storage, NIM entry verification)
- Contracts: Solidity 0.8.28 (TournamentManager ERC-20 + Native variants, MissionPool)
- Tests: 403 frontend + backend + contract suites, all passing; plus a sim harness (`tests/sim/`) that runs headless bot matchups to validate skill discrimination and enforce seeded physics — gated in CI on every PR
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
