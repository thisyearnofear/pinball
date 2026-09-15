# Quantum-seeded runs

> Seed one run from a quantum RNG — without giving up replay verifiability.

---

## The constraint that decides everything

Kamikaze Ball's core promise is a **verifiable arcade**: a run is a deterministic
function of `(table definition, input stream, seed)`, the replay is re-simulated
(physics plausibility + hash binding), and only then is a score signed.

That means there is exactly **one** legitimate place for outside randomness: the
**seed**. A run's seed is already recorded in the replay digest
(`ReplayDigest.seed`), and every gameplay roll derives from it via `mulberry32`.

So the rule is:

| Where | Quantum RNG? | Why |
|---|---|---|
| **Run seed** (start of run) | ✅ yes | Replaces the one non-deterministic input. Recorded → replays still verify. |
| Bumpers / flippers / power-ups | ❌ no | These are the scored, replay-verified physics. Live entropy here breaks the verifier. |
| Cosmetic particles (sakura, ambient) | ✅ yes if desired | No scoring impact. |

If the seed is recorded, the run re-simulates identically no matter where the
seed came from. "Quantum-seeded, provably deterministic" is the honest claim —
and a much stronger one than "we call a quantum API mid-game".

---

## Architecture

```
client run start                 backend (holds the key)            QRNG provider
─────────────────                ───────────────────────            ─────────────
nextRunSeed()  ── buffer hit ──▶  (none)
      │
      └─ prefetch ──── GET /api/quantum/seed?count=N ──▶ fetchQuantumSeeds()
                                                              │
                                          QUANTUM_SEED_URL set? ──yes──▶ HTTP-JSON QRNG
                                                              │                  │
                                                              │      ok? ──yes──▶ { data: [uint16…] }
                                                              │                  │
                                                              └──no / unreachable / bad ──▶ CSPRNG
                                                          ◀── { seeds, source } ──┘
```

- **Backend** (`backend/src/lib/quantum-seed.ts`): provider-agnostic. Fetches from
  any HTTP-JSON RNG and combines `uint16` words into `uint32` seeds. **Never
  throws and never returns fewer than the requested count** — a provider outage
  degrades to a CSPRNG and reports it via `source`.
- **Route** (`backend/src/routes/quantum-seed.ts`): `GET /api/quantum/seed?count=N`
  (1..32, `no-store`). Proxied so the provider key never reaches the browser.
- **Client** (`src/services/quantum-seed.ts`): prefetches a small buffer so run
  creation stays synchronous. Prefers a buffered seed (`qrng`/`csprng`), falls
  back to a local CSPRNG (`local`), and never blocks play on the network.
- **Provenance**: the chosen source is stored on the `GameDef`, recorded as
  `ReplayDigest.seedSource`, so a verifier can see *where* a seed came from, and
  surfaced to the player as a badge (see below).

---

## Configuration

Backend env (see `backend/.env.example`):

| Var | Meaning |
|---|---|
| `QUANTUM_SEED_URL` | HTTP-JSON QRNG endpoint. Unset ⇒ feature is inert (CSPRNG seeds). |
| `QUANTUM_SEED_API_KEY` | Sent as `x-api-key`. Optional. |
| `QUANTUM_SEED_TIMEOUT_MS` | Request timeout (default 2000). |

The adapter is **ANU-QRNG compatible** by default: it appends
`?length=N&type=uint16` and reads `{ data: [uint16, …] }`. Example:

```bash
QUANTUM_SEED_URL=https://qrng.anu.edu.au/API/jsonI.php
```

Any provider with a different shape needs a small adapter in
`fetchQuantumSeeds` (or an endpoint that normalises to `{ data: […] }`).

### A note on MOTH

MOTH's public API (`api.mothquantum.com`, see its `/openapi.json`) is a
**creative-compute platform** — engines, jobs, assets, notebooks, showcases. It
is **not a randomness beacon**, so it does not slot into this path. MOTH is a
better fit for *offline* generation of world art / texture variants. For the run
seed, point `QUANTUM_SEED_URL` at an actual QRNG.

---

## Proof-of-provenance badge

Where the seed came from is surfaced to the player, from one formatter
(`src/utils/seed-provenance.ts`) so every surface agrees:

| Surface | Shows |
|---|---|
| **Lobby** (`NextSeedBadge`) | Provenance the **next** run will use — warms the buffer and flips to `⚛ QUANTUM-SEEDED` when the backend answers |
| **Celebration overlay** | The finished run's provenance, under the verdict seal |
| **Share card image** | A chip in the top-right corner |
| **Share text** | A `Seed: …` line |
| **Ghost race / replay viewer** (`SeedAudit`) | Provenance, the raw seed, a seed fingerprint, and the replay hash — the audit trail for a rival's run |
| **Replay viewer** (`ReplayVerification`) | Whether the replay's hash still matches the score metadata it was submitted with, plus a copy button for that metadata block |
| **Ghost race** (`ReplayVerification` compact) | The same check as a one-line status under the PiP: `✓ matches` / `✗ mismatch` / `○ unverified` |

| Value | Chip | Meaning |
|---|---|---|
| `qrng` | `⚛ QUANTUM-SEEDED` | Seed came from the configured quantum RNG |
| `csprng` | `◈ SERVER ENTROPY` | Backend CSPRNG (provider unset/unreachable) |
| `local` | `◇ DEVICE ENTROPY` | On-device CSPRNG (offline / cold buffer) |
| absent | *(no chip)* | Practice/legacy run with no recorded provenance |

The copy states **where the entropy came from** and nothing more — it never
claims a quantum seed makes a run fairer, stronger, or unhackable, because it
does not: the physics and the verifier are identical either way.

---

## Auditing a rival's replay

Watching a ghost or a stored replay is only meaningful if the viewer can check
*what* they are watching. `SeedAudit` (`src/game/ui/SeedAudit.tsx`) renders that
for a rival's run — in the **ghost-race PiP** (compact, one line) and in the
**replay viewer** (full panel) — from the replay digest alone:

| Row | Value | Recomputable by a viewer? |
|---|---|---|
| Provenance | `qrng` / `csprng` / `local` chip | Yes — `ReplayDigest.seedSource` |
| Seed | the raw `uint32` seed | Yes — `ReplayDigest.seed` |
| Seed hash | `keccak256("KB_SEED:v1:<seed>")`, shortened to `0x1234567890…` | Yes — `seedFingerprint()` in `src/utils/seed-audit.ts` |
| Replay hash | `keccak256(utf8Bytes(replayJson))`, shortened | Yes — hashing the stored replay string |

Two things are deliberately kept distinct:

- The **seed hash** is a *derived* handle for comparing seeds. It is namespaced
  (`KB_SEED:v1:`) so it can never be mistaken for another keccak in the system.
- The **replay hash** is the handle that actually binds a replay to a scored
  submission — it is the value carried inside the signed score metadata and
  re-derived by the backend (`keccak256(toUtf8Bytes(replayJson))` in
  `backend/src/lib/replay-verifier.ts`).

Because the seed lives *inside* the replay, the replay hash transitively commits
to it: a viewer who recomputes the replay hash has checked the seed, the inputs
and the trace in one step. The readout therefore never labels a seed hash as a
fairness proof — it labels a derived fingerprint, and it renders nothing at all
for a legacy/practice digest that recorded no seed.

### Taking the values with you

Every audited value is **tap-to-copy** (`copyToClipboard` in
`src/utils/clipboard.ts`, with a hidden-textarea fallback for older WebViews):

- **Replay viewer** — one copy button per row, copying that row's *full* value
  (never the shortened display form): the seed, the seed fingerprint, or the
  replay hash.
- **Ghost race** — the whole compact line is one tap, copying a paste-ready
  `formatSeedAuditSummary()` block (`source`, `seed`, `seed hash`, `replay hash`)
  so a rival's run can be reported in one gesture. The tap stops propagation so
  it never registers as a playfield input.

### Checking the score binding

Seeds and hashes are only worth reading if the replay you are watching is the one
that was scored. `ReplayVerification` (`src/game/ui/ReplayVerification.tsx`) does
that check in the replay viewer, using `verifyReplayBinding()` in
`src/utils/replay-verify.ts`:

1. it **recomputes** `keccak256(encodeReplay(digest))` from the digest on screen
   (or, for a ghost, hashes the stored payload) — a supplied hash is never the
   basis of the check;
2. it compares that against the `replayHash` inside the run's **signed score
   metadata** (`metaData`), the same payload the backend verifies before signing;
3. it reports `match` / `mismatch` / `unavailable`, plus non-fatal notes when
   metadata fields (`mode`, `table`, `aiDifficulty`) disagree with the replay or
   when a locally recorded hash drifts from the recomputed one.

When there is no metadata to check — a practice run, or a run submitted before
this existed — the result is `unavailable`, **not a pass**. The check is also
deliberately narrow: it proves the replay payload matches what was submitted. It
is not a signature check and it does not re-simulate the run, so it does not
replace the backend verifier.

**Ghost replays.** The backend keeps the leader's *signed metadata* alongside the
replay (`maybeStoreBestReplay(..., metadata)` in `backend/src/routes/replays.ts`,
returned by `GET /api/replays/best/:tournamentId`), so a ghost can be checked
too. For a ghost the checked value is the hash of the **stored payload**
(`verifyReplayHash`), not a re-encode of the decoded digest, because the stored
bytes are the true submission binding. Entries stored before this existed carry
no metadata and correctly report `○ unverified`.

Ghost taps must never register as gameplay, so the PiP's audit and verification
lines stop event propagation before the playfield's tap-to-nudge handler sees
them.

**Copying the metadata.** The replay viewer's `SCORE METADATA` panel has a copy
button that puts the whole signed metadata payload on the clipboard — the exact
string a viewer would paste elsewhere to re-check the binding independently.

---

## Failure behaviour (by design)

| Situation | Result |
|---|---|
| `QUANTUM_SEED_URL` unset | `source: "csprng"`, everything works |
| Provider 500 / timeout / bad JSON | `source: "csprng"`, request never fails |
| Backend unreachable / offline WebView | `source: "local"` (client CSPRNG) |
| Buffer empty at run start | local seed immediately + background refill |

Play never waits on the network, and no failure mode can make a run
unreproducible — the seed is always recorded.
