# Mezo Setup (Testnet → Mainnet)

Hackathon deployment guide for **Pinball Arcade**.

## Live deployment (Mezo Testnet)

| Contract | Address | 
|---|---|
| TournamentManager | `0x39067C81a3ccc3184000b88b7466A4A77B59cfa0` |
| MissionPool | `0xC3fbd6315F00aB3fcc2d1855A75d6B0c3af235B3` |
| MUSD (ERC20) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

- Chain ID: `31611`
- RPC: `https://rpc.test.mezo.org`
- Explorer: https://explorer.test.mezo.org/
- Entry fee: 1 MUSD (configurable via `setEntryFee()`)
- Score signer: set via `setScoreSigner()` — same key as backend

### Mezo Mainnet
- Chain ID: `31612`
- Explorer: https://explorer.mezo.org/
- RPC: `https://mainnet.mezo.public.validationcloud.io/`
- MUSD: `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186`

## Environment variables

### Frontend (`/ .env`)
```
NEXT_PUBLIC_CHAIN_ID=31611
NEXT_PUBLIC_RPC_URL_PUBLIC=https://rpc.test.mezo.org
NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS=0x39067C81a3ccc3184000b88b7466A4A77B59cfa0
NEXT_PUBLIC_MUSD_ADDRESS=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
NEXT_PUBLIC_MISSION_POOL_ADDRESS=0xC3fbd6315F00aB3fcc2d1855A75d6B0c3af235B3
NEXT_PUBLIC_BACKEND_URL=https://your-backend.ondigitalocean.app
```

Optional:
- `NEXT_PUBLIC_CHAIN_NAME` / `NEXT_PUBLIC_BLOCK_EXPLORER_URL` — wallet UX
- `NEXT_PUBLIC_ACTIVE_MISSION_ID` — triggers Sponsored Missions on score submit

### Backend (`backend/.env`)
```
CHAIN_ID=31611
SCORE_SIGNER_PK=<deployer-private-key>
RPC_URL=https://rpc.test.mezo.org
TOURNAMENT_MANAGER_ADDRESS=0x39067C81a3ccc3184000b88b7466A4A77B59cfa0
MISSION_POOL_ADDRESS=0xC3fbd6315F00aB3fcc2d1855A75d6B0c3af235B3
```

### Contracts (`contracts/.env`)
```
PRIVATE_KEY=<deployer-private-key>
SCORE_SIGNER_ADDR=<deployer-address>
MUSD_ADDRESS=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
ENTRY_FEE=1000000000000000000
```

## Deploying

```bash
cd contracts
pnpm install
cp .env.example .env    # fill in PRIVATE_KEY and SCORE_SIGNER_ADDR
pnpm run deploy:mezotestnet
```

Then update the frontend `.env` with the new addresses and rebuild.

## Creating a tournament

Use the contract owner wallet to call:

```solidity
createTournament(
  startTime,    // unix timestamp
  endTime,      // unix timestamp
  topN,         // number of winners (e.g. 3)
  prizeBps      // prize distribution in basis points (e.g. [5000, 3000, 2000])
)
```

## RPC provider bonuses

### Spectrum Nodes (Testnet)
`NEXT_PUBLIC_RPC_URL_PUBLIC=<SPECTRUM_URL>`

### Validation Cloud (Mainnet)
`https://mainnet.mezo.public.validationcloud.io/`
