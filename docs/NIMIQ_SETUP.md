# Nimiq / Polygon Setup (Amoy Testnet)

Deployment guide for the **Nimiq Pay Mini App Competition** profile of
Pinball Arcade. Uses Polygon Amoy testnet for EVM contract deployment with
a test USDT (ERC-20, 6 decimals) as the payment token.

## ⚠️ Competition readiness — PENDING ACTIVATION

The payment code (USDT via EVM + NIM via the Nimiq provider) is **built and
merged**, but production is still pointed at Polygon **Amoy with native
MATIC**. Two manual steps remain before the submission clears the rules. Do
NOT flip prod until the mainnet deploy succeeds and is verified on Polygonscan.

### Step 1 — Deploy USDT TournamentManager to Polygon mainnet (you run this)

```bash
cd contracts
USDT_ADDRESS=<USDT_ADDRESS> ENTRY_FEE=1000000 \
  npx hardhat run scripts/deploy-polygon-mainnet-usdt.ts --network polygon
```

- `<USDT_ADDRESS>` = canonical Tether on Polygon (6 decimals).
- `contracts/.env` needs `PRIVATE_KEY` + `SCORE_SIGNER_ADDR`; the wallet must hold POL for gas.
- The script prints the exact env lines to paste and the new `<TM_ADDRESS>`.

### Step 2 — Flip prod config (you apply after Step 1)

Copy `netlify.mainnet-usdt.toml.example` over the `[build.environment]` block
in `netlify.toml`, filling:
- `<TM_ADDRESS>` from the deploy output
- `<USDT_ADDRESS>` (the Tether contract)
- `<YOUR_REAL_NQ_ADDRESS>` (your Nimiq treasury, see Step 3)

Then update backend env: `CHAIN_ID=137`, `TOURNAMENT_MANAGER_ADDRESS`,
`NIM_TREASURY_ADDRESS`, `NIM_ENTRY_FEE_LUNA=100000`, `NIMIQ_RPC_URL`.

### Step 3 — Provide a real NIM treasury address (BLOCKING for the bonus)

NIM payments are **dormant** until `NEXT_PUBLIC_NIM_TREASURY_ADDRESS`
(frontend) and `NIM_TREASURY_ADDRESS` (backend) are set to a **real Nimiq
address you control**. The placeholder was intentionally removed so no funds
can route to an uncontrolled address. Provide the NQ address to enable the
NIM bonus path.

### Status snapshot

| Item | State |
|---|---|
| NIM payment path (code) | ✅ built, dormant until real treasury set |
| USDT payment path (code) | ✅ built, ERC-20 flow ready |
| Mainnet USDT contract | ⏳ pending Step 1 deploy |
| Prod config flip (USDT) | ⏳ pending Step 2 |
| NIM treasury address | ❗ pending user input (Step 3) |

## Live deployment (Polygon Amoy)

| Contract | Address |
|---|---|
| MockERC20 (test USDT) | `0xD391D6131F92E0A9717a98aD69BAeCfcA4c23A66` |
| TournamentManager | `0xF6A372cB188636691cC6f0eF952210285100B5C9` |
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
