# Pinball Arcade

Pinball Arcade is a Web3 pinball game built for the Mezo ecosystem, featuring on-chain tournaments where players compete for **MUSD** prizes. It combines retro pinball gameplay with blockchain tournament rails, allowing users to connect a wallet and win Bitcoin-backed stablecoin rewards based on their scores.

Built with **Next.js 16.2** (Turbopack, static export), Matter.js for physics, and Wagmi/RainbowKit for wallet connectivity. All tournament entry fees and prizes are denominated in **MUSD** (Bitcoin-backed stablecoin on Mezo).

## Live contracts (Mezo Testnet)

| Contract | Address | 
|---|---|
| TournamentManager | `0x39067C81a3ccc3184000b88b7466A4A77B59cfa0` |
| MissionPool | `0xC3fbd6315F00aB3fcc2d1855A75d6B0c3af235B3` |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

See [docs/MEZO_SETUP.md](docs/MEZO_SETUP.md) for full deployment and configuration guide.

## Architecture

Monorepo with three components:

- **Frontend**: Next.js 16.2 App Router → static export to `out/`. Game runs client-side only via `dynamic({ ssr: false })`.
- **Backend**: Node.js Express server for score signing, with Redis-backed rate limiting.
- **Contracts**: Solidity (Hardhat) — TournamentManager + MissionPool, with EIP-191 signed finalization.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full domain-driven design, dependency rules, and test coverage breakdown.

## Features

- **Pinball Gameplay**: Retro-style vertically scrolling pinball with physics-driven gameplay (Matter.js + zCanvas)
- **Generative 3D Worlds**: Tables hosted inside photoreal Marble worlds rendered by Spark (Gaussian Splats on Three.js). See [docs/MARBLE_INTEGRATION.md](docs/MARBLE_INTEGRATION.md).
- **On-Chain Tournaments**: Enter by paying MUSD, compete for prizes distributed to top players via `finalizeWithSignedWinners()`
- **Wallet Integration**: Wagmi + RainbowKit with an explicit WalletPort adapter (no hidden globals)
- **Sentry Error Tracking**: Frontend crash reporting with global error boundary and instrumentation
- **Arcade Cabinet UX**: CRT overlay, neon marquee, and atmospheric lobby with tournament card selection
- **Leaderboard**: View tournament rankings and scores
- **Cross-Platform**: Responsive design with reduced-motion / low-end device fallback

## Frontend Setup

### Prerequisites
- Node.js 18+
- pnpm

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Runs Next.js with Turbopack on `http://localhost:3000`.

### Production Build

```bash
pnpm build
```

Statically exports to `out/` — deploy to Netlify, Cloudflare Pages, or any CDN.

### Testing

```bash
pnpm test              # Frontend unit tests (65 tests, Vitest + jsdom)
pnpm run test:backend   # Backend API tests
pnpm run test:contracts # Contract tests (Hardhat)
pnpm run test:all       # All three suites

## Backend Setup

The backend provides a secure API for signing tournament scores.

### Prerequisites
- Node.js 18+
- A private key for score signing (generate with contracts/scripts/generate-key.js)

### Installation

```bash
cd backend
npm install
```

### Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- `SCORE_SIGNER_PK`: Private key for signing scores
- `PORT`: Server port (default: 8080)
- `ALLOWED_ORIGINS`: CORS allowed origins

### Running Locally

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

## Contracts Setup

Smart contracts handle tournament logic on Arbitrum. Uses Hardhat (not Foundry).

### Prerequisites
- Node.js 18+
- Hardhat

### Installation

```bash
cd contracts
npm install
```

### Generate Test Keys

```bash
node scripts/generate-key.js
```

### Testing

```bash
npm test
```

New in this release: `finalizeWithSignedWinners()` replaces O(n^2) on-chain sorting with an EIP-191-signed winner list from the trusted backend signer. See `contracts/test/TournamentManager.test.ts` for the full test suite (10 tests, all passing).

## Active Tournament

Mezo Testnet (Chain ID: 31611):

- **TournamentManager**: `0x39067C81a3ccc3184000b88b7466A4A77B59cfa0`
- **MUSD**: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
- **Entry Fee**: 1 MUSD (configurable by owner)
- **Winners**: Top N players eligible for prizes (configurable per tournament)
- **Explorer**: https://explorer.test.mezo.org/

## Deployment

### Frontend

Statically exports to `out/`. Deploy to Netlify (configured via `netlify.toml`), Cloudflare Pages, Vercel, or any CDN.

### Backend

Deploy to a VPS or serverless platform. Requires Redis for rate limiting (optional — falls back to in-memory). See `backend/README.md` for systemd service, nginx reverse proxy setup, and `/admin/metrics` endpoint.

### Contracts

```bash
cd contracts
npm run deploy:mezotestnet
```

## Gameplay

1. **Connect Wallet**: Connect via RainbowKit to participate
2. **Enter Tournament**: Pay MUSD entry fee to join an active tournament
3. **Play Pinball**: Achieve high scores across themed worlds
4. **Submit Score**: Scores are EIP-191 signed by the backend and submitted on-chain
5. **Finalization**: Backend calls `finalizeWithSignedWinners()` to settle the tournament
6. **Claim Rewards**: Top players claim MUSD rewards from the TournamentManager contract

## Adding Custom Tables

To add a new pinball table:

1. Create new `TableDef` in `src/definitions/tables/`
2. Define Actors and Trigger behaviors
3. Add SVG collision map and PNG background assets
4. Update table selection in `src/definitions/tables.ts`

See existing table files for examples.

## API Reference

### Backend Endpoints

- `POST /api/scores/sign`: Sign a tournament score submission
  - Body: `{ tournamentId: number, address: string, score: number, name?: string, metadata?: string }` (metadata must be a valid JSON string)
  - Returns: `{ signature: string, nonce: string }`

## Security

- Tournament scores are cryptographically signed by the backend
- Smart contracts enforce tournament rules and prize distribution
- Wallet connections use standard Web3 security practices

## License

MIT License - see individual component repositories for details.
