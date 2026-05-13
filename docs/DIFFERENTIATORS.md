# Differentiators

## Sponsored Missions (MUSD)

**Goal:** make the pinball feel “Mezo-native” by turning achievements into an onchain MUSD economy.

### What it is
- A sponsor funds a mission with MUSD (e.g., “Score 250k on Table 2” or “Hit Multiball within 45s”).
- The backend (trusted attestor) verifies a player’s achievement.
- The backend awards the player onchain in **MUSD**.

### Onchain component
`MissionPool.sol` (contracts/contracts/MissionPool.sol)
- `createMission(rewardPerWinner, maxWinners)` deposits `rewardPerWinner * maxWinners` MUSD into the pool.
- `awardWinner(missionId, winner)` can be called by the `attestor` (backend-controlled EOA) to pay a winner.

### Seamless in-game integration
The **score signing** request can optionally include a `missionId`.
If configured, the backend will:
1. sign the score (normal tournament flow)
2. *optionally* broadcast an `awardWinner(missionId, player)` transaction if the score meets a threshold

This enables a simple “achievement → reward” demo without adding new UX steps for the player.

### Why this is hackathon-friendly
- Minimal additional surface area (one small contract).
- Reuses the existing “trusted backend signer” model (same key can act as the attestor).
- Easy to demo: create mission → play → backend awards → wallet receives MUSD.

### Next iteration (optional)
Replace `awardWinner` authorization with an EIP-191 signature scheme so awards can be claimed permissionlessly.

## Jackpot Multiball (built on Sponsored Missions)

**Goal:** keep classic pinball, but add a “modern arcade jackpot” moment tied to a real pinball event: **MULTIBALL**.

### How it works
- Create a mission in `MissionPool` that represents the “jackpot”.
- Set the mission as active in the frontend (`VITE_ACTIVE_MISSION_ID`).
- Enable a backend guard so the award only triggers if the player actually hit multiball:
  - `MISSION_REQUIRE_MULTIBALL=true`

When a player triggers multiball in-game, the app adds `multiball: true` into the score metadata. On score signing, the backend checks that flag and then broadcasts the award transaction.

### Why this is strong
- It is pinball-native (not a generic “quest”).
- It is seamless (no extra claim screens).
- It’s auditable onchain (MUSD paid to winners).

## Marble Worlds (generative 3D presentation)

**Goal:** make the game visually unmistakable on the web by hosting the
playfield inside generative photoreal 3D worlds authored with World Labs'
Marble, rendered in real time by Spark on Three.js.

### What it is
- Each tournament binds to a `worldId` (Pirate Ship, Spaceship, Cozy Cottage,
  …) authored in Marble and exported as a Gaussian splat (`.spz`/`.rad`).
- The existing 2D Matter.js gameplay is composited *inside* the splat scene —
  same engine, no gameplay change, dramatic visual upgrade.
- A new isolated `src/presentation/` domain owns the Three.js + Spark
  lifecycle and exposes a tiny imperative `mountWorld()` API that mirrors the
  existing `mountGame()`. Game internals stay zero-dependency.

### Why this is strong
- **Differentiation:** no other Web3 pinball ships in a generative world
  model. Hard to copy without the toolchain.
- **Tournament-as-world:** the prize-pool theme literally is the rendered
  universe — strong shareable surface area for the lobby and recap cards.
- **UGC roadmap:** Tier 3 lets players generate their own table-worlds from a
  prompt and stake them as on-chain custom tournaments — extending, not
  replacing, the existing `MissionPool` flow.
- **No gameplay risk:** Tier 1 leaves the engine, contracts, and wallet flow
  untouched. Reduced-motion / low-end devices fall back to the legacy 2D
  background.

See [MARBLE_INTEGRATION.md](./MARBLE_INTEGRATION.md) for the full architecture
and rollout plan.
