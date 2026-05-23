# Hackathon Tooling (RPC / Indexing / Ops)

This doc is intentionally short and practical: it captures *exactly* where tooling is used in the stack so it’s easy to include in the final submission write-up.

## RPC providers

### Testnet (Mezo Testnet)
Default (until Spectrum URL is provided):
- `https://rpc.test.mezo.org`

Where it is configured:
- Frontend reads: `VITE_RPC_URL_PUBLIC`
- Contract deploys: `MEZO_TESTNET_RPC_URL` (contracts/.env)
- Backend tx broadcast (missions): `MEZO_RPC_URL` (backend/.env)

**Spectrum Nodes requirement (bonus):**
As soon as Spectrum provides an HTTPS RPC endpoint, set it in both places above and document:
- “Spectrum Nodes is our primary Mezo testnet RPC provider for contract reads + tx broadcast”

### Mainnet (Mezo Mainnet)
Validation Cloud provides a public endpoint:
- `https://mainnet.mezo.public.validationcloud.io/`

Where it is configured:
- Contract deploys: `MEZO_MAINNET_RPC_URL` (contracts/.env)
- Future mainnet frontend reads: `VITE_RPC_URL_PUBLIC`

## Data indexing (Goldsky)
If we need fast leaderboards / mission feeds without heavy RPC reads:
- Index TournamentManager + MissionPool events on Mezo
- Serve “top scores” and “recent mission awards” from indexed data

## Multi-chain ops (Tenderly)
Use Tenderly if/when we add any cross-chain pieces (bridges, external liquidity, etc.):
- Simulate transactions in pre-prod
- Monitor failures upstream so users don’t become debuggers
