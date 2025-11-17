# ArbiPinball

ArbiPinball is a Web3 pinball game built as a Farcaster miniapp, featuring on-chain tournaments on Arbitrum where players compete for ETH prizes. It combines retro pinball gameplay with blockchain technology, allowing users to connect their wallet, enter tournaments, and win crypto rewards based on their scores.

The game is built with Vue 3, uses Matter.js for physics simulation, and leverages Web3 technologies for tournament management. It currently runs as a Farcaster Frame and supports various EIP-1193 compatible wallets.

## Architecture

This is a monorepo containing three main components:

- **Frontend**: Vue 3 application that runs in the browser/Farcaster miniapp
- **Backend**: Node.js server that handles score signing for tournament submissions
- **Contracts**: Solidity smart contracts for tournament management on Arbitrum

## Features

- **Pinball Gameplay**: Retro-style vertically scrolling pinball with physics-driven gameplay
- **On-Chain Tournaments**: Enter tournaments by paying ETH, compete for prizes distributed to top players
- **Wallet Integration**: Connect MetaMask, Coinbase Wallet, or other Web3 wallets
- **Farcaster Integration**: Native support for Farcaster miniapps and frames
- **Leaderboard**: View tournament rankings and scores
- **Cross-Platform**: Play on desktop or mobile devices

## Frontend Setup

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
npm install
```

### Development

Start the local development server:

```bash
npm run dev
```

### Production Build

Build for production (output goes to `./dist`):

```bash
npm run build
```

### Preview Production Build

```bash
npm run serve
```

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

Smart contracts handle tournament logic on Arbitrum.

### Prerequisites
- Foundry (modern Ethereum development toolbox)

### Installation

```bash
cd contracts
npm install
```

### Generate Test Keys

Generate a new keypair for testing:

```bash
node scripts/generate-key.js
```

### Testing

```bash
npm test
```

## Active Tournament

Current tournament details on Arbitrum One (Chain ID: 42161):

- **Tournament ID**: 1
- **Contract Address**: `0xD6E3E1c800F26cE18C8D5bc3115aA35f59A99952`
- **Duration**: 7 days (Nov 16, 2024 - Nov 23, 2024)
- **Start Time**: 1763226400 (Unix timestamp)
- **End Time**: 1763831200 (Unix timestamp)
- **Winners**: Top 3 players eligible for prizes
- **Prize Distribution**: 
  - 1st Place: 50%
  - 2nd Place: 30%
  - 3rd Place: 20%
- **Entry Fee**: Set via contract (see `.env` or contract call `entryFeeWei()`)
- **Transaction Hash**: `0x28116391229168d5306a11461d9c9de67a5f3c957763a8bc6f1a77c4226e0cf6`

## Deployment

### Frontend

Deploy the built `./dist` folder to any static hosting service (Netlify, Vercel, Cloudflare Pages, etc.).

### Backend

Deploy to a VPS or serverless platform. See `backend/README.md` for systemd service configuration and nginx reverse proxy setup.

### Contracts

Deploy contracts to Arbitrum mainnet:

```bash
cd contracts
npm run deploy:mainnet
```

## Gameplay

1. **Connect Wallet**: Users connect their Web3 wallet to participate in tournaments
2. **Enter Tournament**: Pay ETH entry fee to join an active tournament
3. **Play Pinball**: Play through the pinball tables, achieving high scores
4. **Submit Score**: Scores are signed by the backend and submitted on-chain
5. **Claim Rewards**: Top players can claim their ETH rewards after tournament ends

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
