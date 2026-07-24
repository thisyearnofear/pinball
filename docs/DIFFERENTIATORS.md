# Differentiators

> **North star:** the world's first *verifiable arcade* — where every score is
> provably honest, every prize is Bitcoin-backed, and the on-chain mechanics
> are inseparable from the fun. See [VISION.md](./VISION.md) for the full
> strategic framing.

This document catalogs what makes Pinball Arcade defensible today and the
inversions that convert the crypto wrapper into the substance of the game.

---

## The moat: four layers no one else composes

### 1. Generative world stage (Marble + Spark)

No other Web3 pinball ships inside a generative photoreal 3D world. The 2D
Matter.js playfield is composited *inside* a Marble Gaussian splat scene,
rendered in real time by Spark on Three.js. This requires the full Marble +
Spark + Three.js toolchain and custom compositing glue — not a standard
integration anyone can copy in a weekend.

- Each tournament binds to a `worldId` (Pirate Ship, Spaceship, Cozy Cottage,
  …) authored in Marble and exported as a Gaussian splat (`.spz`/`.rad`).
- A new isolated `src/presentation/` domain owns the Three.js + Spark
  lifecycle and exposes a tiny imperative `mountWorld()` API that mirrors the
  existing `mountGame()`. Game internals stay zero-dependency.
- **Tournament-as-world:** the prize-pool theme literally is the rendered
  universe — strong shareable surface area for the lobby and recap cards.
- **UGC roadmap (the monopoly lever):** Tier 3 lets players generate their own
  table-worlds from a prompt and stake them as on-chain custom tournaments.
  Once players generate and stake worlds, we become the platform, not just a
  cabinet.
- **No gameplay risk:** Tier 1 leaves the engine, contracts, and wallet flow
  untouched. Reduced-motion / low-end devices fall back to the legacy 2D
  background.

See [MARBLE_INTEGRATION.md](./MARBLE_INTEGRATION.md) for the full architecture
and rollout plan.

### 2. Chain-portable arcade economy (ecosystem profile system)

Prizes, entry fees, and micro-rewards work with any token (MUSD on Mezo, NIM
on Nimiq, USDT on Polygon) via the ecosystem profile system. One codebase
serves N ecosystems — each new chain is a config file + wallet adapter, not a
fork. This preserves optionality (ship to any competition or ecosystem as a
config change) and scalability (each ecosystem brings its own user base with
zero codebase divergence).

- Tournament entry fees and prizes via `TournamentManager.sol`.
- Sponsored missions funded in any supported token via `MissionPool.sol`.
- `createMission(rewardPerWinner, maxWinners)` deposits
  `rewardPerWinner * maxWinners` tokens into the pool.
- `awardWinner(missionId, winner)` can be called by the `attestor`
  (backend-controlled EOA) to pay a winner.
- The `payment-token-client.ts` supports both ERC-20 (approve/transferFrom)
  and native token (value sent with tx) flows, selected by config.
- The `WalletPort` interface enables pluggable wallet adapters: `Eip1193WalletPort`
  for Wagmi/RainbowKit, `NimiqWalletPort` for Nimiq Pay.

### 3. O(topN) signed settlement

`finalizeWithSignedWinners()` replaces O(n²) on-chain sorting with an
EIP-191 signed winner list from the trusted backend signer. This is a
gas-efficient settlement primitive that generalizes beyond pinball, and it is
the bridge to trustless settlement (see Inversion 3 below).

### 4. Event-native rewards (Jackpot Multiball)

Real pinball events trigger on-chain token payouts, with no extra UX step for
the player. This is not a generic quest system — it is pinball-native.

- A mission in `MissionPool` represents the "jackpot."
- When a player triggers multiball in-game, the app adds `multiball: true`
  into the score metadata.
- On score signing, the backend checks that flag and broadcasts the
  `awardWinner` transaction if `MISSION_REQUIRE_MULTIBALL=true`.
- Seamless, auditable on-chain, and tied to a real pinball mechanic.

---

## The inversions: making the crypto inseparable from the fun

Conventional pinball with a crypto wrapper is forgettable. The following
inversions convert the wrapper into the substance. Each is ranked by
delight-per-engineering-hour and by how much it leverages the existing stack.

### Inversion 1 — Kamikaze Ball (drain to win + power-up tug-of-war)

**The pitch:** the ball wants to drain. The machine fights to keep it alive.
You steer the ball INTO the drain while AI flippers try to save it. A dual
power-up system (player munitions vs machine countermeasures) creates a
tug-of-war that makes each run feel different. Lowest time-alive wins.

**Why it's the headline inversion:**
- Mode toggle, not a rebuild — every table, body, and physics definition stays
  identical; only the win condition and score sign invert.
- "Kamikaze Ball: the pinball game where you're trying to lose and the machine
  won't let you" is a line that gets retweeted and remembered. It is the kind
  of contrarian mechanic that defines a category.
- Turns the tournament contract into something stranger and more newsworthy
  than "yet another skill-based payout."
- The power-up system transforms it from "a clever inversion" into "a
  genuinely replayable game with emergent drama." Mario Kart's item-box
  model applied to inverted pinball.
- Most Thiel-compatible: contrarian, category-defining, hard to copy because
  no one else would dare.

**Implementation surface:** drain mode in `game.ts` (score = time alive),
AI flipper heuristic, tap-to-nudge control, munitions crates (reuse trigger
positions), power-up effects, visual inversion (red bumpers, green drain),
machine taunt messages, tournament `invertedWinCondition` flag. No new
assets, no physics changes. See [KAMIKAZE_BALL.md](./KAMIKAZE_BALL.md) for
the full spec.

### Inversion 2 — The ball IS the token

**The pitch:** the ball is literally the ecosystem's native token (MUSD on
Mezo, NIM on Nimiq, USDT on Polygon). Bumper hits = mining a block (live
micro-payout via MissionPool). Drain = liquidation ("rekt"). Multiball = bull
market (multiplier chaos). The ecosystem's token stops being a sponsor
sticker and becomes the gameplay metaphor.

**Why it locks in the ecosystem monopoly:**
- No one else can credibly do "token pinball" on that chain. Thematic
  exclusivity is a small, real monopoly — and it scales to every ecosystem
  the profile system supports.
- Every bumper hit is a live on-chain transaction — a demo judges cannot unsee.
- Reuses the existing MissionPool micro-payout path; no new contract surface.
- Converts the payment token from a prize wrapper into the substance of the game.

**Implementation surface:** bumper collision handler triggers a micro-payout
request (throttled), visual reskin of the ball, metadata flag for
bumper-streak rewards. The MissionPool contract is unchanged.

### Inversion 3 — Ghost runs / on-chain replays (the long-term moat)

**The pitch:** every submitted score stores the deterministic input stream
(on-chain or IPFS). Players challenge a *ghost* of anyone's run, side by
side. The replay is deterministic — same inputs, same score, provably.

**Why this is the last-mover move:**
- Operationalizes the contrarian secret: pinball is the most verifiable
  competitive game in existence. Full game state = one ball's position,
  velocity, and static body definitions.
- If the input stream is verifiable, the trusted EIP-191 signer can eventually
  be retired. The contract becomes the referee — trustless arcade protocol.
- Creates a durable social/competitive graph — players don't just compare
  scores, they race each other's actual runs.

**Implementation surface:** input stream serialization in `game.ts`,
deterministic replay mode, on-chain/IPFS storage of run data, ghost-rendering
in the playfield. Heavier work; better suited to post-hackathon. This is the
foundation for the trustless-settlement protocol.

---

## Production-quality architecture (the schlep that deters copiers)

The architecture is not a differentiator on its own, but it is the schlep that
makes the differentiators defensible. A competitor would need to reproduce all
of this *and* the four layers above.

- **Next.js 16.2** with Turbopack, static export to `out/`
- **Game isolation**: canvas/physics run client-side only via
  `dynamic({ ssr: false })` — zero SSR cost
- **Sentry error tracking**: instrumentation.ts + global-error.tsx boundary +
  source maps
- **CSS modules** with design tokens: 8 components powered by centralized CSS
  custom properties from `src/theme/tokens.ts`
- **Clean wallet adapter**: WalletPort interface with explicit injection —
  contract clients require `wallet: WalletPort`, no hidden globals
- **Test coverage**: 65 frontend + 54 backend + 10 contract tests, all passing
- **Domain-driven boundaries**: game, presentation, tournament, wallet domains
  with strict dependency rules (see [ARCHITECTURE.md](./ARCHITECTURE.md))
- **Dead code purge**: 6 obsolete files removed, `@mezo-org/passport`
  dependency dropped, legacy `web3-service.ts` wallet adapter deleted

---

## Decision filter

When evaluating new features, ask:

1. **Does it make the crypto mechanic more inseparable from the fun?** If no,
   defer. Wrapper features are the fragile layer.
2. **Does it move us toward the trustless arcade protocol?** If yes,
   prioritize even if it's not shippable this phase.
3. **Is it copyable by a conventional pinball game without blockchain?** If
   yes, it's not a differentiator — it's table stakes.
4. **Does it create network effects (UGC, replays, wagering)?** If yes, it's
   a monopoly lever, not just a feature.
