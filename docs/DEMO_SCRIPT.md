# Kamikaze Ball — 90-Second Demo Script

Target: hackathon judges. One take, no wallet fumbling (pre-connect before recording).

**Setup (before recording):** open `/?demo=1` in a fresh browser profile, wallet already connected to Polygon Amoy and entered in the active kamikaze tournament.

---

**0:00 – 0:10 — Hook.**
"Every pinball game wants you to keep the ball alive. Kamikaze Ball inverts it: you're trying to DRAIN the ball as fast as possible — and the machine itself fights back to save it."

*Screen: `/?demo=1` auto-launches a guided kamikaze run. AI flippers visibly saving the ball.*

**0:10 – 0:30 — The fight.**
"The machine plays the flippers with a rubber-band AI. Tap to nudge the ball toward the drain. Munition crates give you power-ups — Iron Dome, Ghost Ball — and the machine rolls its own countermeasures. It taunts you when it saves."

*Screen: tap-nudges, a crate pickup, power-up HUD countdown, an AI taunt banner.*

**0:30 – 0:45 — The payoff.**
"Drain it, and that's your score: 4.5 seconds. Lower is better. Victory FX, then a full ghost replay of your run — every input was recorded against a seeded, deterministic RNG."

*Screen: DRAINED! flash + confetti → Watch Replay ghost viewer.*

**0:45 – 1:10 — The verifiable arcade.**
"Here's the differentiator: before the backend signs any score, it verifies the replay — physics plausibility, no teleports, drain segments that actually produce the claimed time, human input rates. The replay hash is bound into the EIP-191 signature, and the contract settles top-3 USDT prizes on Polygon with O(topN) signed finalization. Inverted win condition is enforced on-chain."

*Screen: score submission overlay stepping validating → verifying → signing → ready; "Replay verified" toast; wallet confirm; leaderboard.*

**1:10 – 1:30 — Close.**
"And you're never racing alone — the tournament leader's verified replay plays live as a ghost in the corner, with its own audit line: where its RNG seed came from, and whether its replay hash still matches the score metadata it was signed with. Open any replay and the picker shows the same — seed provenance, seed and replay fingerprints, one tap to copy. You don't have to trust the scoreboard; you can check it."

*Screen: live ghost race PiP during a run (audit line visible) → Watch Replay with the `SEED AUDIT` + `SCORE METADATA ✓ HASH MATCHES` panels → lobby attract mode as outro.*

---

## Judge quick links

| What | Where |
|---|---|
| Instant guided demo | append `?demo=1` to the app URL |
| Watch the machine play itself | lobby attract mode (no wallet needed) |
| Replay verification engine | `backend/src/lib/replay-verifier.ts` |
| Ghost racing | `src/game/ui/GhostRace.tsx` + `GET /api/replays/best/:id` |
| In-app audit readout (seed provenance + fingerprints) | `src/game/ui/SeedAudit.tsx` + `src/utils/seed-audit.ts` |
| Replay-hash ↔ signed-metadata check | `src/utils/replay-verify.ts` + `src/game/ui/ReplayVerification.tsx` |
| Inverted-win contract | `contracts/contracts/TournamentManager.sol` |
| Signed O(topN) settlement | `finalizeWithSignedWinners` + `backend/src/scripts/finalize-tournament.ts` |
