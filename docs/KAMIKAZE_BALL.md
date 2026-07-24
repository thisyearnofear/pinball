# Kamikaze Ball — Design Spec

> **The pitch:** a pinball mode where you're trying to LOSE and the machine
> won't let you. The ball wants to drain. The machine fights to keep it alive.
> Power-ups create a tug-of-war between player (munitions) and machine
> (countermeasures). Lowest time-alive wins.

---

## Core concept

In normal pinball, the player fights gravity and the table to keep the ball
alive. In Kamikaze Ball, the **table fights the player** to keep the ball
alive. AI-controlled flippers actively try to save the ball. Bumpers bounce
it away from the drain. The player's job is to steer the ball INTO the drain
against the machine's will.

The machine is the protagonist. You are the antagonist.

## Scoring

| Metric | Normal mode | Kamikaze Ball |
|---|---|---|
| Primary score | Points (higher = better) | Time alive in ms (lower = better) |
| Bumper hits | +500 points | +500ms penalty (kept ball alive) |
| Trigger groups | +2500 bonus | +2500ms penalty |
| Multiball | Jackpot | Nightmare (3 balls to drain) |
| Tournament ranking | Descending (highest wins) | Ascending (fastest drain wins) |

**Contract integration:** the score submitted is time-alive-in-ms. The
`TournamentManager` gains an `invertedWinCondition` flag. When true,
`finalizeWithSignedWinners` sorts ascending. One boolean, one branch.

## Control scheme

**Primary: Tap to nudge.** Player taps anywhere on screen. Ball gets a small
impulse toward the tap location. AI flippers try to save it. One-thumb,
mobile-native, no precision needed.

**Alternative: Flipper Sabotage.** Player controls flippers but they're
inverted — pressing makes them go DOWN, creating gaps for the ball to drain
through. Familiar to pinball veterans but deeply confusing.

## Power-up system

### Munitions crates (the item box equivalent)

Glowing portals scattered on the table (reuse existing trigger positions).
When the ball passes through: screen dims, roulette spins (1.5s), lands on a
random power-up. 50/50 chance: player munition or machine countermeasure.

The ball keeps moving during the roulette — you can't pause to watch the
reveal. Tension.

### Rubber-banding (the secret sauce)

Mario Kart gives better items to players in last place. Kamikaze Ball does
the same:

- Ball alive >15s (player losing): crate biases 70/30 toward player munitions
- Ball drains <5s repeatedly (player dominating): crate biases 60/40 toward
  machine countermeasures
- Default: 50/50

This prevents one-sided games and creates dramatic comebacks.

### Player munitions (help you drain)

| Power-up | Effect | Duration |
|---|---|---|
| Homing Warhead | Ball gets pulled toward drain. AI flippers scramble. | 4s |
| Flipper Jam | AI flippers freeze completely. Ball undefended. | 3s |
| Ghost Ball | Ball phases through bumpers — no collision, no bouncing. | 3s |
| Bumper EMP | All bumpers go dark and inert. No bouncing. | 5s |
| Ball Swarm | Spawn 3 decoy balls. AI can only track one. | 6s |
| Slow-Mo Trap | AI reaction time triples. Player still full speed. | 5s |
| Tremor | Table shakes, redirecting ball toward drain. | 3s |
| Drain Amplifier | Drain hitbox doubles in size. | 4s |

### Machine countermeasures (keep ball alive)

| Power-up | Effect | Duration |
|---|---|---|
| Iron Dome | AI flippers become perfect — 100% save rate. | 5s |
| Bumper Frenzy | All bumpers activate and pulse, creating walls. | 4s |
| Force Field | Barrier appears over drain. Ball cannot enter. | 4s |
| Anti-Gravity | Ball floats upward, away from drain. | 4s |
| Ball Resurrection | If ball drains, it respawns at top. | 5s |
| Hyper Speed | Ball moves 2x faster. Harder to nudge. | 4s |

### Balance rules

1. Max 1 active player + 1 active machine power-up at a time
2. Munitions crates respawn every 8-12 seconds
3. Power-up duration: 3-5 seconds
4. Machine power-ups slightly weaker than player power-ups (player is the
   underdog, which is the fun role)
5. Multiball = nightmare: 3 balls, AI tracks one, others free to drain

## Visual design language

### Normal mode
- Bumpers: glowing, inviting (blue/green) — hit them for points
- Flippers: player-controlled, responsive
- Drain: dark, ominous — the threat
- Score: counting UP, celebratory
- Palette: warm, neon, arcade-bright

### Kamikaze Ball
- Bumpers: red, hostile, pulsing — they bounce your ball AWAY
- Flippers: robotic, AI-controlled, cold metallic — they are the enemy
- Drain: bright, glowing green — this is the target
- Score: timer counting UP (lower = better), urgency-driven
- Palette: dark background with red accents, drain glows green
- All HUD elements flip meaning: "SAVED!" is bad, "DRAINED!" is victory

### Power-up visuals

- Homing Warhead: green particle trail from ball to drain
- Iron Dome: blue shimmer over flippers
- Force Field: golden dome over drain
- Ghost Ball: translucent, ethereal ball
- Bumper EMP: bumpers flicker and go dark
- Ball Swarm: 3 ghost balls spawn

### Machine taunts

When the AI saves the ball near the drain:
- "SAVED!"
- "NICE TRY"
- "I WILL NOT LET YOU LOSE"
- "PATHETIC"

When you finally drain:
- "NOOO"
- "HOW?"
- "REKT"

## Mobile optimization

- One-thumb control (tap anywhere to nudge)
- Short rounds: 30-90 seconds per ball, 3 balls per game
- Large tap targets: entire playfield is the control surface
- Visual feedback: ripple effect on tap, ball flashes when nudged
- Haptic feedback: buzz on bumper hit (bad), strong buzz on drain (good)
- Power-up bar at top: two slots (player green, machine blue) with countdown
- Roulette: 1.5s spin, ball keeps moving (tension)
- Reduced motion: CRT overlay and particles can disable
- Portrait orientation (already pinball format)
- Share card after each drain: time, AI difficulty, machine taunt

## Game modes

| Mode | Description | Tournament? |
|---|---|---|
| Speed Drain | Fastest drain wins. 3 balls, best time. | Yes (default) |
| Minimum Score | Normal scoring, lowest total wins. | Optional |
| AI vs Me | Difficulty scales: easy/medium/hard AI. | Social |
| Sabotage | Player controls inverted flippers. | Hard mode |

## Tournament integration

- `TournamentManager` gains `invertedWinCondition` boolean
- When true, `submitScoreWithSignature` stores time-alive (lower = better)
- `finalizeWithSignedWinners` sorts ascending when flag is set
- Backend signs the time-alive score (same EIP-191 flow)
- Same contract, same ABI, one boolean flag

## Build tiers

### Tier 1: MVP (competition ship)
- Drain-to-win mode (score = time alive, lowest wins)
- AI flippers (simple heuristic, medium difficulty)
- Tap-to-nudge control
- 3 power-ups per side (Homing Warhead, Flipper Jam, Ghost Ball / Iron Dome,
  Force Field, Bumper Frenzy)
- Munitions crates (reuse trigger positions)
- Roulette reveal animation
- Rubber-banding
- Visual inversion (red bumpers, green drain)
- Machine taunt messages
- Share card with drain time

### Tier 2: Polish
- Full power-up arsenal (8 player, 6 machine)
- Difficulty ladder (easy/medium/hard AI)
- Sabotage control mode (inverted flippers)
- Power-up rarity tiers
- Unique SFX per power-up

### Tier 3: Deep
- Custom Kamikaze Ball tables
- Power-up loadouts (pick 3 before each run)
- Machine personality types
- Replay system for best drains
- Cross-mode leaderboards

## AI flipper heuristic (MVP)

```
onEngineTick:
  for each flipper:
    ballDistance = abs(ball.x - flipper.x)
    ballApproaching = ball.y > flipper.y && ball.vy > 0

    if ballApproaching && ballDistance < threshold:
      // Ball is coming toward this flipper — activate to save
      if random() < aiAccuracy:  // 0.8 for medium difficulty
        flipper.activate()
      // else: AI "misses" (intentional gap for fairness)

  // Reaction delay: AI checks every 150ms, not every frame
  // This creates the "medium" difficulty feel
```

Parameters by difficulty:
- Easy: accuracy 0.5, reaction 250ms
- Medium: accuracy 0.8, reaction 150ms
- Hard: accuracy 0.95, reaction 80ms
