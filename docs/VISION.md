# Vision & North Star

> **North star:** Build the world's first *verifiable arcade* — a pinball
> cabinet where every score is provably honest, every prize is real value, and
> the game itself is something no other stack could produce. The arcade is
> chain-portable: the same cabinet runs on Mezo with MUSD, on Nimiq with NIM,
> or on any EVM chain with its native token. The game is the constant; the
> chain is the variable.

---

## The problem with "pinball, but with blockchain"

Most Web3 games are conventional games with a crypto wrapper bolted on. The
blockchain parts are additive novelty, not the substance of the fun. Players
would return even if the chain vanished. That is the fragile layer this project
must close.

Our north star is the opposite: **the on-chain mechanics are inseparable from
the gameplay.** If you removed MUSD, signed settlement, or the verifiable score
stream, the game would be a lesser, less honest, less surprising thing.

---

## The contrarian secret

> **Pinball is the most verifiable competitive game in existence.**

The entire game state is one ball's position, velocity, and a small set of
static body definitions. Unlike an FPS, MOBA, or RTS — where game state is
enormous and trustless on-chain verification is infeasible — a pinball run is
a deterministic function of `(table definition, input stream, seed)`.

This means:

1. A score can be proven legitimate **without a trusted backend** — by hashing
   the table def + input stream and verifying the resulting score on-chain.
2. A run can be **replayed deterministically** by anyone, from the stored input
   stream, producing the same score.
3. A tournament can be **settled trustlessly** — no attester, no signer, no
   trusted oracle. The contract is the referee.

Today we use a trusted EIP-191 signer (pragmatic, hackathon-shippable). The
north star is to retire that signer and become the **trustless arcade
protocol**: a standard for verifiable competitive pinball that anyone can build
cabinets on top of.

This is the Thiel-style secret: a fact most people wouldn't believe, that if
true, changes what's possible. "Verifiable arcade" is a category, not a game.

---

## What makes this stack defensible (the creative monopoly)

No one else composes these four layers:

| Layer | What it is | Why it's hard to copy |
|---|---|---|
| **Generative world stage** | 2D Matter.js playfield composited *inside* a Marble Gaussian splat scene via Spark/Three.js | Requires the Marble + Spark + Three.js toolchain and the compositing glue; not a standard integration |
| **Chain-portable arcade economy** | Prizes, entry fees, and micro-rewards in any token (MUSD on Mezo, NIM on Nimiq, USDT on Polygon) via the ecosystem profile system | One codebase serves N ecosystems; each new chain is a config file + wallet adapter, not a fork |
| **O(topN) signed settlement** | `finalizeWithSignedWinners()` replaces O(n²) on-chain sorting with an EIP-191 signed winner list | Gas-efficient, generalizes beyond pinball, and is the bridge to trustless settlement |
| **Event-native rewards** | Real pinball events (multiball, bumper streaks) trigger on-chain token payouts via MissionPool, with no extra UX step | Ties the *feel* of pinball to the *flow* of money; not a generic quest system |

Each piece is individually copyable. The **assembly** is not. That is the moat.

The ecosystem profile system is itself a defensible architectural choice: it
makes the arcade chain-portable without forks, preserving optionality (ship to
any competition or ecosystem as a config change) and scalability (each new
ecosystem brings its own user base with zero codebase divergence).

---

## Strategic framing (Graham + Thiel lens)

### Paul Graham: make something people want, and do the schlep

- **Schlep is good.** Matter.js tuning, Marble splat pipelines, EIP-191
  signing, RainbowKit wiring, CRT shader aesthetics, 129 tests across three
  suites — this is unglamorous work that deters copiers. We did it properly,
  not as a throwaway demo.
- **Small obsessive audience first.** Hackathon judges, crypto-native arcade
  nostalgics, and the Mezo community. That is a fine starting wedge. PG loves
  small, obsessive communities.
- **The sharpest question:** *if the blockchain parts vanished, would players
  still come back?* Today, probably not — the gameplay is faithful but
  conventional. The inversions below close that gap by making the crypto
  mechanic the substance, not the wrapper.

### Peter Thiel: creative monopoly, last mover

- **New category, not incremental.** "Verifiable arcade" is a category no one
  else occupies. We are not building "a better pinball" — we are building the
  protocol for provably honest arcade competition.
- **Last mover advantage via UGC.** Today, tournaments and tables are
  first-party. The monopoly lever is Tier 3 (player-generated table-worlds
  staked as on-chain tournaments). Once *players* generate and stake worlds, we
  become the platform others build on, not just a cabinet.
- **Power law in content.** Today all tables are first-party and roughly equal.
  The UGC roadmap introduces power-law distribution: a few player-generated
  worlds will dominate, creating liquidity and reputation moats.

---

## The inversions: making it memorable

Conventional pinball with a crypto wrapper is forgettable. The following
inversions convert the wrapper into the substance. Each is ranked by
delight-per-engineering-hour and by how much it leverages the existing stack.

### Inversion 1 — Kamikaze Ball (drain to win + power-up tug-of-war)

**The pitch:** the ball wants to drain. The machine fights to keep it alive.
You steer the ball INTO the drain while AI flippers try to save it. A
dual power-up system (player munitions vs machine countermeasures) creates
a tug-of-war that makes each run feel different. Lowest time-alive wins.

**Why it's strong:**
- Mode toggle, not a rebuild — every table, body, and physics definition stays
  identical; only the win condition and score sign invert.
- "Kamikaze Ball: the pinball game where you're trying to lose and the machine
  won't let you" is a line that gets retweeted and remembered. It is the kind
  of contrarian mechanic that defines a category.
- Turns the tournament contract into something stranger and more newsworthy
  than "yet another skill-based payout."
- The power-up system transforms it from "a clever inversion" into "a
  genuinely replayable game with emergent drama." Each run creates a unique
  story of tug-of-war between you and the machine.
- Most Thiel-compatible: contrarian, category-defining, hard to copy because
  no one else would dare.

See [KAMIKAZE_BALL.md](./KAMIKAZE_BALL.md) for the full design spec, power-up
arsenal, AI flipper heuristic, and build tiers.

### Inversion 2 — The ball IS the token

**The pitch:** the ball is literally the ecosystem's native token (MUSD on
Mezo, NIM on Nimiq, USDT on Polygon). Bumper hits = mining a block (live
micro-payout via MissionPool). Drain = liquidation ("rekt"). Multiball = bull
market (multiplier chaos). The ecosystem's token stops being a sponsor sticker
and becomes the gameplay metaphor.

**Why it's strong:**
- Locks in the ecosystem monopoly. No one else can credibly do "token pinball"
  on that chain. Thematic exclusivity is a small, real monopoly — and it
  scales to every ecosystem the profile system supports.
- Every bumper hit is a live on-chain transaction — a demo judges cannot unsee.
- Reuses the existing MissionPool micro-payout path; no new contract surface.
- On Nimiq specifically: "the ball is a NIM" is cleaner than "the ball is a
  Bitcoin" — NIM is a native L1 token, not a wrapped stablecoin. The metaphor
  is tighter and earns the NIM-usage bonus in the competition.

**Alignment:** Converts the payment token from a prize wrapper into the
substance of the game. This is the inversion that makes the crypto mechanic
inseparable from the fun.

### Inversion 3 — Ghost runs / on-chain replays

**The pitch:** every submitted score stores the deterministic input stream
(immutably, on-chain or IPFS). Players challenge a *ghost* of anyone's run,
side by side. The replay is deterministic — same inputs, same score, provably.

**Why it's strong:**
- Operationalizes the contrarian secret: pinball is the verifiable game.
- Creates a durable social/competitive graph — players don't just compare
  scores, they race each other's actual runs.
- Foundation for the trustless-settlement protocol: if the input stream is
  verifiable, the trusted signer can eventually be retired.

**Alignment:** This is the long-term moat. It is heavier work and better suited
to a post-hackathon phase, but it is the last-mover move that turns a cabinet
into a protocol.

---

## Roadmap (vision-aligned)

```
NOW (hackathon ship)
  ✓ Matter.js pinball + CRT cabinet aesthetic
  ✓ MUSD tournaments with EIP-191 signed settlement
  ✓ Marble splat world compositing (Tier 1)
  ✓ Jackpot Multiball -> MissionPool payout
  ✓ Ecosystem profile system (Mezo + Nimiq, one codebase)
  ✓ Polygon Amoy deployment (USDT, TournamentManager + MissionPool)
  → Ship Kamikaze Ball (drain-to-win + power-ups)  [highest delight/effort]
  → Ship Inversion 2 (ball-is-token metaphor)     [locks ecosystem monopoly]

NEXT (post-hackathon, protocol foundation)
  → Ghost runs: store deterministic input stream, replay challenges
  → Trustless score proof prototype (retire the signer for a mode)
  → Spectator wagering on live runs (single-player becomes multiplayer)
  → Add ecosystem profiles for Base, Arbitrum, Optimism (config-only)

LATER (the monopoly move)
  → Tier 3: player-generated table-worlds staked as on-chain tournaments
  → Trustless arcade protocol: open standard for verifiable pinball
  → Last mover: become the platform, not just a cabinet
```

Each phase makes the on-chain mechanics more inseparable from the fun, and
moves us from "a pinball game with blockchain" toward "a new kind of arcade
that only this stack could produce."

---

## Decision filter

When evaluating new features, ask:

1. **Does it make the crypto mechanic more inseparable from the fun?** If no,
   defer. Wrapper features are the fragile layer.
2. **Does it move us toward the trustless arcade protocol?** If yes, prioritize
   even if it's not shippable this phase.
3. **Is it copyable by a conventional pinball game without blockchain?** If yes,
   it's not a differentiator — it's table stakes.
4. **Does it create network effects (UGC, replays, wagering)?** If yes, it's a
   monopoly lever, not just a feature.

The north star is not "more pinball." It is "the most honest arcade ever built,
chain-portable, powered by real value."
