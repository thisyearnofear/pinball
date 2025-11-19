# Farcaster Mini-App Integration Guide

This document records the technical approach and best practices established for the Pinball Farcaster Mini-App, specifically regarding blockchain interactions, network management, and reliability.

## 1. Network Configuration

**Strategy: Strict Arbitrum One Support**

We explicitly support **Arbitrum One (Chain ID: 42161)** only.
- **Removed Sepolia Support**: To avoid confusion and simplify logic, all testnet/Sepolia code paths have been removed.
- **Network Switching**: The app checks `window.ethereum` (or the Farcaster provider) and forces a switch to 42161 if the user is on the wrong chain.

## 2. Read-Only Operations (Critical)

**Problem**: In the Farcaster context, the wallet provider state can be transitional or inconsistent during app initialization. Relying on the wallet provider for read-only data (like fetching the active tournament ID or leaderboard) caused the UI to fail to load details.

**Solution: Public RPC Preference**
All read-only functions in `src/services/contracts/tournament-client.ts` follow this pattern:
1.  **Attempt Public RPC**: Use a standard `JsonRpcProvider` pointing to `https://arb1.arbitrum.io/rpc`. This works immediately without waiting for wallet connection.
2.  **Fallback to Wallet**: Only if the public RPC fails do we attempt to use the user's connected wallet provider.

**Affected Functions**:
- `getActiveTournamentId()`
- `getEntryFeeWei()`
- `getTournamentInfo()`
- `fetchLeaderboard()`
- `getWinners()`
- `getPrizeBps()`

## 3. Transaction Reliability & Verification

**Problem**: Farcaster embedded wallets sometimes return a transaction hash even if the state update hasn't fully propagated, or fail silently. Gas estimation also frequently fails.

**Solution: "Trust but Verify"**

### A. Pre-Flight Checks
Before sending a transaction (e.g., `enterTournament`), we validate:
- **Wallet Balance**: Ensure `balance >= entryFee`.
- **Tournament State**: Verify `startTime <= now <= endTime` and `!finalized`.
- **Player Status**: Check `playerInfo` to see if already entered (preventing "duplicate entry" errors).

### B. Explicit Gas Limits
We bypass gas estimation for critical write operations by setting explicit limits:
- `enterTournament`: `gasLimit: 300000n`

### C. Post-Transaction Verification (Crucial)
After a transaction is confirmed (`tx.wait()`), we **do not assume success**.
1.  Wait for a short delay (e.g., 1000ms).
2.  Query the contract state (e.g., `playerInfo(tournamentId, address)`).
3.  **Verify**: If the state doesn't reflect the action (e.g., `entered` is still `false`), throw an error.

```typescript
// Example Verification Logic
const receipt = await tx.wait();
// ... wait ...
const playerInfo = await checkContract.playerInfo(tournamentId, address);
if (!playerInfo.entered) {
    throw new Error('Entry transaction succeeded but player was not registered.');
}
```

## 4. Error Handling Patterns

### User Rejection
Farcaster wallets and MetaMask return specific error codes when a user cancels. We catch these early to show friendly "Cancelled" toasts instead of "Transaction Failed" errors.
- **Codes**: `ACTION_REJECTED`, `4001`
- **Strings**: "user rejected", "user denied"

### "NOT_ENTERED" Handling
Previously, `NOT_ENTERED` errors were sometimes mistaken for "Already Entered" success cases.
- **Correct Logic**: `NOT_ENTERED` means the user cannot submit a score because they haven't paid the entry fee. This is treated as a blocking error requiring the user to join.

## 5. Debugging

We have implemented extensive logging in `tournament-client.ts` prefixed with `=== ENTER TOURNAMENT DEBUG ===`.
- **Logs**: Provider type, Network ID, Wallet Balance, Entry Fee, Transaction Params.
- **Use Case**: If a user reports issues, these logs in the browser console are the first place to look.
