## Root Cause
- The frontend ABI for `tournaments(uint256)` includes a dynamic `uint16[] prizeBps` in the returned tuple.
- Solidity’s auto-generated getter for `mapping(uint256 => Tournament)` does not return nested dynamic arrays in-place; the dynamic field position appears as a zero offset, which breaks ethers v6 decoding and triggers `BAD_DATA`.
- The on-chain data is correct (id, start/end, topN, finalized, totalPot), but the ABI shape is mismatched, causing the decode failure.

## Changes
- Update the ABI signature used in `src/services/contracts/tournament-client.ts` to return only static fields.
- Refactor callers to use positional indices consistently (ethers v6 tuples) and correct the `totalPot` index.
- Keep prize distribution rendering out of this path; if needed later, add a separate accessor (optional).

## Implementation Steps
1. Modify `TOURNAMENT_MANAGER_ABI` in `src/services/contracts/tournament-client.ts:6–18`:
   - Replace the current signature with:
     - `"function tournaments(uint256) view returns (tuple(uint256,uint64,uint64,uint16,bool,uint256) t)"`
2. Update `getTournamentInfo` (`src/services/contracts/tournament-client.ts:82–97`):
   - Read fields by index and shift `totalPot` from `t[6]` → `t[5]`:
   - `startTime: Number(t[1])`
   - `endTime: Number(t[2])`
   - `topN: Number(t[3])`
   - `finalized: Boolean(t[4])`
   - `totalPot: BigInt(t[5])`
3. Update `getActiveTournamentId` (`src/services/contracts/tournament-client.ts:31–41`):
   - Use indices instead of property names:
   - `const isActive = Number(t[1]) <= nowSec && nowSec <= Number(t[2]) && !Boolean(t[4]);`
4. Build and verify on Arbitrum One (`Chain ID: 42161`) using the configured `VITE_TOURNAMENT_MANAGER_ADDRESS`.

## Validation
- Start the app, connect MetaMask on Arbitrum One (42161).
- Confirm `getTournamentInfo` and `getActiveTournamentId` succeed without `BAD_DATA`.
- Observe the console no longer logs `could not decode result data` and UI shows tournament details.

## No Redeploy Needed
- The on-chain contract layout aligns with the static fields we consume; the issue is purely ABI and client decoding. Redeployment is not required for this fix.

## Optional Contract Enhancement (Future)
- If the UI needs `prizeBps` as a whole array, add a view helper to the contract:
  - `function getTournament(uint256 id) external view returns (Tournament memory)`
- Redeploy and update the frontend ABI accordingly. Not necessary to unblock starting a tournament now.