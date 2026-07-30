# Nimiq / Polygon Setup (Production — Polygon Mainnet)

Deployment guide for the **Nimiq Pay Mini App Competition** profile of
Kamikaze Ball. Production runs on Polygon mainnet (chain 137) with real
USDT (ERC-20, 6 decimals) entry fees, plus a native NIM payment path for the
competition bonus.

## ✅ Competition readiness — LIVE

All payment paths are built, deployed, and verified end-to-end.

- **USDT (eligibility gate):** TournamentManager deployed to Polygon mainnet,
  prod config flipped, backend on chain 137. Verified on-chain.
- **NIM (bonus points):** Nimiq Pay SDK integration live; NIM treasury set;
  backend verifies NIM transactions on the Nimiq chain before registering entry.
- **Framework compliance:** built on `@nimiq/mini-app-sdk`, MIT licensed,
  public repo, no secrets, skill-based game.

### Completed steps

1. **Deployed USDT TournamentManager to Polygon mainnet** via
   `contracts/scripts/deploy-polygon-mainnet-usdt.ts` (EIP-1559 dynamic fees,
   `USDT_ADDRESS` passed via env). 4 tournaments created (2 kamikaze inverted
   + 2 classic), 30-day window, 0.1 USDT entry, 50/30/20 prize split.
2. **Flipped prod config** (`netlify.toml` → chain 137, USDT, TM address) and
   backend env (`CHAIN_ID=137`, `TOURNAMENT_MANAGER_ADDRESS`,
   `MEZO_RPC_URL=https://polygon.drpc.org`). Restarted service.
3. **Set NIM treasury** to `NQ88 8AG0 1CXT 9Y11 77FU L706 M1TA R1FC DNKU`
   in both frontend (`netlify.toml`) and backend env.

### Status snapshot

| Item | State |
|---|---|
| NIM payment path (code) | ✅ live, treasury configured |
| USDT payment path (code) | ✅ live, ERC-20 flow active |
| Mainnet USDT contract | ✅ deployed (0x3906…cfa0) |
| Prod config flip (USDT) | ✅ applied |
| NIM treasury address | ✅ set |
| Backend chain/RPC | ✅ chain 137, drpc.org |

## Live deployment (Polygon mainnet)

| Contract | Address |
|---|---|
| TournamentManager (USDT) | `0x39067C81a3ccc3184000b88b7466A4A77B59cfa0` |
| USDT (Tether, 6 decimals) | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| MissionPool | `0x1F7f7fBd49957d8175e7c9DC44643deF7f89405C` |

- Chain ID: `80002`
- RPC: `https://polygon-amoy.publicnode.com`
- Explorer: https://amoy.polygonscan.com/
- Entry fee: 1 USDT (1,000,000 base units, 6 decimals)
- Score signer: `0x9f654bc7880EADa88c3E2CfFd6103e2518f17468`
- Tournament #1: 30-day window, top 3, 50/30/20 split
- Mission #1: 10 USDT per winner, up to 100 winners

## Environment variables

### Frontend (`.env`)

See `.env.nimiq` for the complete Nimiq profile. Key vars:

```
NEXT_PUBLIC_ECOSYSTEM_PROFILE=nimiq
NEXT_PUBLIC_WALLET_ADAPTER=nimiq
NEXT_PUBLIC_CHAIN_ID=80002
NEXT_PUBLIC_RPC_URL_PUBLIC=https://polygon-amoy.publicnode.com
NEXT_PUBLIC_PAYMENT_TOKEN_TYPE=erc20
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=0xD391D6131F92E0A9717a98aD69BAeCfcA4c23A66
NEXT_PUBLIC_PAYMENT_TOKEN_SYMBOL=USDT
NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS=6
NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS=0xF6A372cB188636691cC6f0eF952210285100B5C9
NEXT_PUBLIC_MISSION_POOL_ADDRESS=0x1F7f7fBd49957d8175e7c9DC44643deF7f89405C
NEXT_PUBLIC_ACTIVE_MISSION_ID=1
```

### Backend (`backend/.env`)

```
CHAIN_ID=80002
SCORE_SIGNER_PK=<same deployer key>
RPC_URL=https://polygon-amoy.publicnode.com
TOURNAMENT_MANAGER_ADDRESS=0xF6A372cB188636691cC6f0eF952210285100B5C9
MISSION_POOL_ADDRESS=0x1F7f7fBd49957d8175e7c9DC44643deF7f89405C
```

### Contracts (`contracts/.env`)

```
PRIVATE_KEY=<deployer-private-key>
SCORE_SIGNER_ADDR=0x9f654bc7880EADa88c3E2CfFd6103e2518f17468
ENTRY_FEE=1000000
```

## Deploying

```bash
cd contracts
pnpm install
# Deploy all contracts + create tournament + mission:
pnpm run deploy:polygonamoy

# Or deploy individual contracts using env vars for already-deployed ones:
EXISTING_TOKEN_ADDRESS=0x... EXISTING_TM_ADDRESS=0x... npx hardhat run scripts/deploy-polygon.ts --network polygonamoy
```

Then copy the `.env.nimiq` contents into `.env` and rebuild.

## Nimiq Pay Mini App testing

To test inside Nimiq Pay:

1. Run the dev server with `--host`:
   ```bash
   pnpm dev -- --host
   ```
2. Copy the Network URL (e.g. `http://192.168.1.42:3000`)
3. Open **Nimiq Pay** on your phone (same Wi-Fi network)
4. Go to **Mini Apps** and enter the URL
5. The app will use the Nimiq Pay injected EIP-1193 provider (`window.ethereum`)

The Nimiq Pay app supports both the Nimiq provider (for NIM payments via
`@nimiq/mini-app-sdk`) and the EVM provider (for USDT on Polygon). The game
uses the EVM provider for the onchain tournament contract, and the Nimiq
provider for the NIM bonus path (`src/services/nimiq/`): the player pays NIM
to the treasury via `sendBasicTransactionWithData`, and the backend
`/api/nim-entry` verifies the tx on the Nimiq chain before registering entry.
The `PaymentMethodSelector` modal lets a player choose USDT or NIM when
running inside Nimiq Pay.

See:
- [Nimiq Mini Apps overview](https://nimiq.dev/mini-apps/)
- [EVM tokens in Mini Apps](https://nimiq.dev/mini-apps/features/evm-tokens)
- [Dual-chain tutorial](https://nimiq.dev/mini-apps/tutorials/dual-chain-mini-app-tutorial)

## Polygon mainnet (if needed for competition)

- Chain ID: `137`
- RPC: `https://polygon.drpc.org`
- USDT on Polygon: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`
- Explorer: https://polygonscan.com/

To deploy on mainnet:
```bash
pnpm run deploy:polygon
```
