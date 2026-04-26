# Architecture (Core Principles)

This repository is evolving towards a **React-only (Mezo Passport-first)** frontend while **reusing** the existing TypeScript game engine, backend score signer, and Solidity contracts.

The goal is to make the system **scalable, maintainable, and modular**, aligned with our Core Principles:

- **ENHANCEMENT FIRST**: extract and reuse existing engine/contract logic before creating anything new.
- **CONSOLIDATION**: delete legacy shells once parity is reached (no long-lived deprecations).
- **PREVENT BLOAT**: audit + consolidate before adding features.
- **DRY**: single source of truth for shared logic (config, ABIs, tx helpers).
- **CLEAN**: explicit dependencies and separation of concerns.
- **MODULAR**: composable, testable modules with narrow APIs.
- **PERFORMANT**: lazy loading, caching, minimal runtime work.
- **ORGANIZED**: predictable, domain-driven file structure.

## System overview

### Frontend
- **Target:** `apps/web-react/` becomes the only UI shell.
- **Temporary:** root Vue shell exists only while we migrate the UI; it should be deleted once parity is achieved.

### Backend
- `backend/` provides a score signing API and (optionally) mission award broadcasting.

### Contracts
- `contracts/` contains Mezo-focused Solidity contracts and deployment scripts.

## Domain-driven boundaries (DDD)

We treat the codebase as a set of domains with strict dependency rules.

### Domains
- **Game domain** (pure gameplay): physics + rendering + rules
  - Examples: `src/model/**`, `src/definitions/**`, `src/renderers/**`, `src/utils/**`
  - Must not depend on wallet/tournament concerns.

- **Tournament domain** (chain/business rules): contract reads/writes, tx helpers, score submission primitives
  - Examples: `src/services/contracts/**`
  - Must not depend on Vue/React components.

- **Wallet domain**: connection + chain switching adapters
  - Examples: `src/services/web3-service.ts` (temporary adapter)
  - Must not depend on UI components.

- **UI shell(s)**: views + UX flows
  - Vue: `src/components/**` (temporary)
  - React: `apps/web-react/src/**` (target)

### Allowed dependencies

**UI → (wallet, tournament, game)**

**tournament → (wallet adapter, config, ABIs, tx utils)**

**wallet → (config only)**

**game → (no dependencies on wallet/tournament/UI)**

Disallowed:
- game → tournament/wallet/UI
- tournament → UI framework
- wallet → UI framework

## Single source of truth

- **Config**: `src/config/app-config.ts` / `src/config/contracts.ts`
- **ABIs**: `src/services/contracts/abi.ts`
- **Tx/RPC utilities**: `src/services/contracts/contract-utils.ts`

## Migration plan (high level)

1. Extract a framework-agnostic `mountGame()` module (game domain boundary).
2. Update React shell to mount the game directly (remove iframe).
3. Consolidate tournament/wallet glue so React uses the same domain modules as Vue.
4. Delete Vue shell when parity is reached.

