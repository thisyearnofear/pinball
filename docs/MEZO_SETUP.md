# Mezo Setup (Testnet → Mainnet)

This project targets the **Mezo Hackathon** requirements:
- integrate **MUSD** + **Mezo Passport**
- deploy a working demo on **Mezo Testnet**

## Network constants

### Mezo Testnet
- Chain ID: `31611`
- RPC: `https://rpc.test.mezo.org`
- Explorer: https://explorer.test.mezo.org/

### Mezo Mainnet
- Chain ID: `31612`
- Explorer: https://explorer.mezo.org/
- Public RPC (Validation Cloud): `https://mainnet.mezo.public.validationcloud.io/`

## Token addresses

MUSD (ERC20):
- Testnet: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
- Mainnet: `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186`

## Environment variables

### Frontend (root `.env`)
Required:
- `VITE_CHAIN_ID`
- `VITE_RPC_URL_PUBLIC` (set to official testnet RPC for now; swap to Spectrum when ready)
- `VITE_TOURNAMENT_MANAGER_ADDRESS`
- `VITE_MUSD_ADDRESS`
- `VITE_BACKEND_URL`

Optional (differentiators):
- `VITE_MISSION_POOL_ADDRESS`
- `VITE_ACTIVE_MISSION_ID` (optional: triggers in-game mission/jackpot awarding on score submit)

### Mezo Passport (React)
Mezo Passport is a React/RainbowKit-based integration. A React shell lives at:
`apps/web-react/`

It will become the primary UI shell as the Vue shell is migrated out.

### Backend (`backend/.env`)
Required:
- `CHAIN_ID` (must match deployed chain)
- `SCORE_SIGNER_PK` (private key used for score signing)

Optional:
- `SCORE_PREFIX` (defaults to `PINBALL_SCORE:v2`)
- `MISSION_POOL_ADDRESS` (optional: enable Sponsored Missions payouts)
- `MISSION_SCORE_THRESHOLD` (optional)
- `MISSION_REQUIRE_MULTIBALL` (optional: enables Jackpot Multiball behavior)

### Contracts (`contracts/.env`)
Required for deploy:
- `PRIVATE_KEY`
- `SCORE_SIGNER_ADDR`
- `MUSD_ADDRESS`

Optional:
- `ENTRY_FEE` (default is 1 MUSD in 18-decimal base units)

## RPC provider bonuses

### Spectrum Nodes (Testnet)
When you have the Spectrum HTTPS RPC URL, set:
- `VITE_RPC_URL_PUBLIC=<SPECTRUM_URL>`
- `MEZO_TESTNET_RPC_URL=<SPECTRUM_URL>` (contracts deploy)

Document it in your submission as “primary testnet RPC provider”.

### Validation Cloud (Mainnet)
For mainnet testing/launch, you can use the public endpoint:
- `https://mainnet.mezo.public.validationcloud.io/`
