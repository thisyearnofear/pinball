# Architecture (Core Principles)

> **North star:** the world's first *verifiable arcade*. The architecture is
> designed to support a path from trusted EIP-191 signed settlement toward a
> trustless on-chain score-verification protocol. See
> [VISION.md](./VISION.md) for the strategic framing.

Production-credible architecture with clean layering and strict domain
boundaries. The frontend is a **Next.js 16.2 static export** with client-side-only game rendering — zero SSR cost, zero server runtime. The long-term
goal is that every score is provably honest from a deterministic input stream,
retiring the trusted signer entirely.

Core Principles:
- **ENHANCEMENT FIRST**: extract and reuse existing engine/contract logic before creating anything new.
- **CRYPTO IS SUBSTANCE, NOT WRAPPER**: every on-chain feature must be inseparable from the fun. If a feature would work identically without blockchain, it is table stakes, not a differentiator (see [VISION.md](./VISION.md) decision filter).
- **VERIFIABLE BY DESIGN**: prefer architectures that move us toward trustless score proof. The deterministic physics engine (fixed time step) is the foundation — preserve it.
- **CONSOLIDATION**: delete dead code once parity is reached (no long-lived deprecations).
- **PREVENT BLOAT**: audit + consolidate before adding features.
- **DRY**: single source of truth for shared logic (config, ABIs, tx helpers).
- **CLEAN**: explicit dependencies and separation of concerns.
- **MODULAR**: composable, testable modules with narrow APIs.
- **PERFORMANT**: lazy loading, caching, minimal runtime work.
- **ORGANIZED**: predictable, domain-driven file structure.

## System overview

### Frontend (Next.js 16.2 · Turbopack · Static Export)
- **`app/`** — Next.js App Router shell: root layout, providers, Sentry boundaries, dynamic game import.
- **`src/game/`** — All game logic, UI components, hooks. Renamed from `src/app/` to avoid conflicting with Next.js's `app/` convention.
- **`src/services/`** — Contract clients, high-scores service, audio, haptics, toast.
- **`src/domains/`** — Wallet port abstraction (EIP-1193 adapter), cleanly injected into all contract clients.
- **`src/config/`** — Tournaments, worlds, contracts, wagmi config.
- **`src/theme/`** — Design tokens + global CSS variable injection.
- **`src/hooks/`** — Shared React hooks (media queries, world theme, wallet).

Build produces static `out/index.html` for Netlify/any CDN. Game runs entirely client-side via `dynamic(() => import(...), { ssr: false })` — no server-side rendering of pinball physics or canvas.
- **Observability**: `@sentry/nextjs` v10 with instrumentation.ts, global-error.tsx boundary, and source map upload (gated behind `SENTRY_ORG`/`SENTRY_PROJECT` env vars).
- **Dev speed**: Turbopack (400% faster startup claim).
- **Styling**: 4 core CSS modules (Button, Modal, AppHeader, PinballHUD) + 4 newly migrated (ArcadeLobby, WorldLoadingOverlay, ScoreSubmissionOverlay, SettingsModal) + design tokens via CSS custom properties. Remaining inline styles are mostly dynamic (glow colors, particle positions).
- **In-run render budget**: the playfield already runs three render loops (matter-js step, zcanvas worker, 3D splat world), so the React tree around it stays off the critical path. `GameMount` samples the engine for the readout at ~20Hz (`HUD_SAMPLE_MS`) rather than 60, and every write still compares against its previous value — so a table that is not changing costs no render at all. The readout is its own memoised component (`src/game/ui/RunHud.tsx`), which bounds a sample to the panel. Two things deliberately keep the full frame rate: the shot-calling timing meter (a gameplay input, not a readout) and all camera/audio work, which is imperative and never routed through state. `AmbientBackground` takes `paused` and is paused while a run is live.
- **Two readout layouts**: desktop floats the panel over the playfield; phones get a slim strip above it, because the overlay is ~200×300 and a phone table is ~358×477. `tests/unit/game/run-hud.spec.ts` guards both, including that the strip does not grow back into the overlay's full row list.
- **Feedback costs no frames**: the haptic vocabulary is ranked (`src/utils/haptics.ts`) so texture cannot blur and the ceremony cannot be truncated, and its visual echo (`src/utils/screen-pulse.ts`) is one already-mounted overlay animated with the Web Animations API — opacity only, compositor work, no layout, no rAF of its own, and no per-event DOM. It is behind `prefers-reduced-motion` like every other effect here.

### Backend
- `backend/` — Node.js Express server for score signing API.
- Redis-backed rate limiter + nonce tracker with in-memory fallback (`REDIS_URL` env var).
- `/admin/metrics` endpoint for operational visibility.

### Contracts
- `contracts/` — Solidity (Hardhat) for TournamentManager + MissionPool on Mezo.
- `finalizeWithSignedWinners()` replaces O(n^2) on-chain sort with O(topN) via EIP-191 signed winner list from the trusted backend signer.
- **Protocol path:** the signed-settlement design is the bridge to trustless verification. Once deterministic input streams are stored and replayable (see [VISION.md](./VISION.md) Inversion 3), the signer can be retired and the contract becomes the referee.

### Verification & audit surfaces

- **Server (authoritative):** `backend/src/lib/replay-verifier.ts` re-simulates plausibility and re-derives `keccak256(utf8Bytes(replayJson))`, rejecting with `HASH_MISMATCH` before any score is signed.
- **Client (inspectable):** `src/utils/seed-audit.ts` derives seed provenance + seed/replay fingerprints; `src/utils/replay-verify.ts` recomputes a replay's hash and compares it with the `replayHash` committed by the signed score metadata.
- The client check is deliberately narrower than the server one: it proves the replay payload matches what was submitted. It is not a signature check and does not re-simulate the run. See [QUANTUM_SEEDS.md](./QUANTUM_SEEDS.md).
- `GET /api/replays/best/:tournamentId` returns the leader's replay **and** its signed metadata, so a ghost viewer runs the same check (`backend/src/routes/replays.ts`).
- **Enforced, not merely intended:** the physics path draws only from the run's `rngSeed` (IMMERSION_SPEC rule 1). `tests/sim/unseeded-draws.ts` fails the sim if any physics draw slips back to `Math.random()` — a run that does is unreproducible from the seed it recorded — and that sim runs on every pull request (`.github/workflows/sim-gate.yml`).

## Domain-driven boundaries (DDD)

We treat the codebase as a set of domains with strict dependency rules.

### Domains
- **UI shell** (`app/`): Next.js App Router — root layout, providers, Sentry boundaries, dynamic game import.
- **Game domain** (pure gameplay): physics + rendering + rules
  - Examples: `src/model/**`, `src/definitions/**`, `src/renderers/**`, `src/utils/**`
  - Must not depend on wallet/tournament/presentation concerns.
  - **Verifiable by design:** the fixed-timestep physics engine (see [PHYSICS_FIX.md](./PHYSICS_FIX.md)) produces deterministic output from a given input stream. This determinism is the foundation for trustless score proof — preserve it when extending the engine.
- **Presentation domain** (3D world stage): Marble splat scene + Spark renderer that hosts the game canvas
  - Examples: `src/presentation/**`, `src/config/worlds.ts`
  - Must not depend on game internals, tournament, wallet, or UI framework.
  - See [MARBLE_INTEGRATION.md](./MARBLE_INTEGRATION.md) for the full plan.
- **UI components** (`src/game/ui/`): Presentational React components with CSS modules + design tokens
  - Examples: `Button`, `Modal`, `AppHeader`, `PinballHUD`, `ArcadeLobby`, `SettingsModal`
- **Tournament domain** (chain/business rules): contract reads/writes, tx helpers, score submission primitives
  - Currently uses trusted EIP-191 signer; architected to be replaceable by trustless verification (deterministic replay) without breaking downstream consumers.
  - Examples: `src/services/contracts/**`
  - Must not depend on UI components.
- **Wallet domain**: connection + chain switching adapters (ecosystem-pluggable)
  - Examples: `src/domains/wallet/` (WalletPort interface + Eip1193WalletPort for Wagmi, NimiqWalletPort for Nimiq Pay)
  - Must not depend on UI components.
  - All contract clients require an explicit `wallet: WalletPort` parameter (no hidden globals).
  - The adapter is selected at runtime by the ecosystem profile (`NEXT_PUBLIC_WALLET_ADAPTER`).

### Allowed dependencies

**UI (app/) → game → (wallet, tournament, presentation)**

**presentation → (config only — splat asset URLs, world tuning)**

**tournament → (wallet adapter, config, ABIs, tx utils)**

**wallet → (config only)**

**game → (no dependencies on wallet/tournament/presentation/UI)**

Disallowed:
- game → tournament/wallet/presentation/UI
- presentation → game internals / tournament / wallet / UI framework
- tournament → UI framework
- wallet → UI framework

## Single source of truth

- **Ecosystem profile**: `src/config/app-config.ts` — `NEXT_PUBLIC_ECOSYSTEM_PROFILE` selects the chain, wallet adapter, payment token, and contract addresses. One codebase serves Mezo (MUSD, Wagmi), Nimiq (NIM/USDT, Nimiq SDK), or any EVM chain.
- **Wagmi config**: `src/config/wagmi-config.ts` (only active when `NEXT_PUBLIC_WALLET_ADAPTER=wagmi`)
- **Tournament config**: `src/config/tournaments.ts` (token symbol derived from profile)
- **Contracts config**: `src/config/contracts.ts` (payment token config from profile)
- **Payment token client**: `src/services/contracts/payment-token-client.ts` (ERC-20 + native token support)
- **ABIs**: `src/services/contracts/abi.ts`
- **Tx/RPC utilities**: `src/services/contracts/contract-utils.ts`
- **World catalogue**: `src/config/worlds.ts` (Marble splat URLs + per-world tuning)
- **Design tokens**: `src/theme/tokens.ts` → CSS custom properties via `injectGlobalStyles()`

## Test coverage

- **403 frontend tests** (Vitest + jsdom): model/game, actors, trigger groups, math utils, HUD layout, audio fetch policy
- **54 backend tests**: API endpoints, rate limiter, nonce tracker
- **10 contract tests**: `finalizeWithSignedWinners` signature validation, winner claims, legacy compat
- All passing. Run: `pnpm run test:all`

