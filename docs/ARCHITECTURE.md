# Architecture (Core Principles)

Production-credible architecture with clean layering and strict domain boundaries. The frontend is a **Next.js 16.2 static export** with client-side-only game rendering — zero SSR cost, zero server runtime.

Core Principles:
- **ENHANCEMENT FIRST**: extract and reuse existing engine/contract logic before creating anything new.
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

### Backend
- `backend/` — Node.js Express server for score signing API.
- Redis-backed rate limiter + nonce tracker with in-memory fallback (`REDIS_URL` env var).
- `/admin/metrics` endpoint for operational visibility.

### Contracts
- `contracts/` — Solidity (Hardhat) for TournamentManager + MissionPool on Arbitrum.
- `finalizeWithSignedWinners()` replaces O(n^2) on-chain sort with O(topN) via EIP-191 signed winner list from the trusted backend signer.

## Domain-driven boundaries (DDD)

We treat the codebase as a set of domains with strict dependency rules.

### Domains
- **UI shell** (`app/`): Next.js App Router — root layout, providers, Sentry boundaries, dynamic game import.
- **Game domain** (pure gameplay): physics + rendering + rules
  - Examples: `src/model/**`, `src/definitions/**`, `src/renderers/**`, `src/utils/**`
  - Must not depend on wallet/tournament/presentation concerns.
- **Presentation domain** (3D world stage): Marble splat scene + Spark renderer that hosts the game canvas
  - Examples: `src/presentation/**`, `src/config/worlds.ts`
  - Must not depend on game internals, tournament, wallet, or UI framework.
  - See [MARBLE_INTEGRATION.md](./MARBLE_INTEGRATION.md) for the full plan.
- **UI components** (`src/game/ui/`): Presentational React components with CSS modules + design tokens
  - Examples: `Button`, `Modal`, `AppHeader`, `PinballHUD`, `ArcadeLobby`, `SettingsModal`
- **Tournament domain** (chain/business rules): contract reads/writes, tx helpers, score submission primitives
  - Examples: `src/services/contracts/**`
  - Must not depend on UI components.
- **Wallet domain**: connection + chain switching adapters
  - Examples: `src/domains/wallet/` (WalletPort interface + EIP-1193 adapter)
  - Must not depend on UI components.
  - All contract clients require an explicit `wallet: WalletPort` parameter (no hidden globals).

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

- **Wagmi config**: `src/config/wagmi-config.ts` (shared by `app/providers.tsx` and `src/game/App.tsx`)
- **Tournament config**: `src/config/tournaments.ts`
- **Contracts config**: `src/config/contracts.ts`
- **ABIs**: `src/services/contracts/abi.ts`
- **Tx/RPC utilities**: `src/services/contracts/contract-utils.ts`
- **World catalogue**: `src/config/worlds.ts` (Marble splat URLs + per-world tuning)
- **Design tokens**: `src/theme/tokens.ts` → CSS custom properties via `injectGlobalStyles()`

## Test coverage

- **65 frontend tests** (Vitest + jsdom): model/game, actors, trigger groups, math utils
- **54 backend tests**: API endpoints, rate limiter, nonce tracker
- **10 contract tests**: `finalizeWithSignedWinners` signature validation, winner claims, legacy compat
- All passing. Run: `pnpm run test:all`

