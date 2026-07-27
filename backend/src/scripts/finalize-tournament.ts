import 'dotenv/config';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getBytes,
  keccak256,
  solidityPacked,
} from 'ethers';
import { env } from '../lib/env.js';

/**
 * Finalize a tournament via finalizeWithSignedWinners.
 *
 * Reads the on-chain leaderboard, sorts direction-aware (ascending for
 * inverted/kamikaze tournaments, descending for classic), signs the
 * PINBALL_FINALIZE:v1 message with the score signer key, and submits.
 *
 * Usage:
 *   npm run finalize -- <tournamentId> [--dry-run] [--tm <address>]
 */

const TM_ABI = [
  'function tournaments(uint256) view returns (uint256 id, uint64 startTime, uint64 endTime, uint16 topN, bool finalized, bool invertedWinCondition, uint256 totalPot)',
  'function viewLeaderboard(uint256 id, uint256 offset, uint256 limit) view returns (address[] addrs, uint256[] scores)',
  'function finalizeWithSignedWinners(uint256 id, address[] winnerAddrs, bytes signature)',
  'function scoreSigner() view returns (address)',
];

const PAGE_SIZE = 200;

function buildFinalizeInnerHash(
  tournamentId: bigint,
  chainId: bigint,
  topN: number,
  inverted: boolean,
  winnerAddrs: string[]
): string {
  return keccak256(
    solidityPacked(
      ['string', 'uint256', 'uint256', 'uint16', 'bool', 'address[]'],
      ['PINBALL_FINALIZE:v1', tournamentId, chainId, topN, inverted, winnerAddrs]
    )
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tmFlagIdx = args.indexOf('--tm');
  const tmAddress =
    (tmFlagIdx >= 0 ? args[tmFlagIdx + 1] : undefined) ?? process.env.TOURNAMENT_MANAGER_ADDRESS;
  const idArg = args.find((a) => /^\d+$/.test(a));

  if (!idArg) {
    console.error('Usage: npm run finalize -- <tournamentId> [--dry-run] [--tm <address>]');
    process.exit(1);
  }
  if (!tmAddress || !tmAddress.startsWith('0x') || tmAddress.length !== 42) {
    console.error('TournamentManager address required: set TOURNAMENT_MANAGER_ADDRESS or pass --tm <address>');
    process.exit(1);
  }

  const tournamentId = BigInt(idArg);
  const provider = new JsonRpcProvider(env.MEZO_RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(env.CHAIN_ID)) {
    throw new Error(`RPC chainId ${network.chainId} does not match CHAIN_ID env (${env.CHAIN_ID})`);
  }

  const wallet = new Wallet(env.SCORE_SIGNER_PK, provider);
  const tm = new Contract(tmAddress, TM_ABI, wallet);

  const onChainSigner: string = await tm.scoreSigner();
  if (onChainSigner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`SCORE_SIGNER_PK address ${wallet.address} != on-chain scoreSigner ${onChainSigner}`);
  }

  const t = await tm.tournaments(tournamentId);
  if (t.id !== tournamentId) throw new Error(`Tournament ${tournamentId} does not exist`);
  if (t.finalized) throw new Error(`Tournament ${tournamentId} is already finalized`);
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec <= Number(t.endTime)) {
    throw new Error(`Tournament ${tournamentId} has not ended yet (ends ${new Date(Number(t.endTime) * 1000).toISOString()})`);
  }

  const topN = Number(t.topN);
  const inverted = Boolean(t.invertedWinCondition);
  console.log(`Tournament #${tournamentId}: topN=${topN}, inverted=${inverted}, pot=${t.totalPot}`);

  // Page through the full leaderboard
  const entries: { addr: string; score: bigint }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const [addrs, scores] = await tm.viewLeaderboard(tournamentId, offset, PAGE_SIZE);
    for (let i = 0; i < addrs.length; i++) {
      entries.push({ addr: addrs[i], score: scores[i] });
    }
    if (addrs.length < PAGE_SIZE) break;
  }
  console.log(`Participants: ${entries.length}`);

  // score 0 on-chain means "no score submitted" (real kamikaze scores >= MIN_DRAIN_MS)
  const scored = entries.filter((e) => e.score > 0n);
  scored.sort((a, b) => {
    const diff = inverted ? a.score - b.score : b.score - a.score;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  });

  const winners = scored.slice(0, topN).map((e) => e.addr);
  if (winners.length < topN) {
    console.warn(
      `Only ${winners.length} scored players for topN=${topN}; padding with zero address (those prize shares stay in the pot).`
    );
    while (winners.length < topN) winners.push(ZeroAddress);
  }

  console.log('Winners (ranked):');
  scored.slice(0, topN).forEach((e, i) => {
    const display = inverted ? `${(Number(e.score) / 1000).toFixed(1)}s` : e.score.toString();
    console.log(`  #${i + 1} ${e.addr} — ${display}`);
  });

  const innerHash = buildFinalizeInnerHash(tournamentId, network.chainId, topN, inverted, winners);
  const signature = await wallet.signMessage(getBytes(innerHash));
  console.log(`Inner hash: ${innerHash}`);
  console.log(`Signature:  ${signature}`);

  if (dryRun) {
    console.log('Dry run — not submitting.');
    return;
  }

  const tx = await tm.finalizeWithSignedWinners(tournamentId, winners, signature);
  console.log(`Submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Finalized in block ${receipt.blockNumber} (status=${receipt.status})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
