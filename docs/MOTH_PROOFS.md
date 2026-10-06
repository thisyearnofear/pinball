# Auditing MOTH-seeded runs

A run is a deterministic function of `(table, inputs, seed)`, so the replay
verifier already proves a score came from a given seed. This doc covers the
other half: proving the **seed** came from a specific MOTH `comet-qrng-v1`
job, and whether that job ran on real quantum hardware or the simulator.

Tool: `backend/src/lib/moth-proof.ts` (pure, `node:crypto` only), CLI
`backend/src/scripts/verify-moth-seed.ts`.

```bash
cd backend
# by job id (fetches /jobs/{id}/result with MOTH_API_KEY from the env)
npm run verify:moth -- <job-id> --seed <run seed>
# or a saved result body, and/or several jobs in chain order
npm run verify:moth -- a.json b.json c.json
```

Exit code 0 = no check failed; 1 = a check failed; 2 = usage/fetch error.

## What is checked

All hash constructions below were established against live emu and QPU jobs
(fixtures in `backend/tests/fixtures/moth/`), not taken from docs.

| Check | Recomputed by us | Meaning |
|---|---|---|
| `output-hash` | `sha256(bytes(random.hex)) == pulse.output_hash` | the published bytes are the ones the pulse commits to |
| `derived-integers` | `derived.integers.values[i] == uint32_be(bytes[4i..4i+4])` (full `[0, 2^32-1]` range only) | integers are a plain read of the bytes — no hidden selection |
| `seed-in-output` | `seed ∈ derived.integers.values` | the run seed came from this job |
| `raw-counts-hash` | `sha256(canonical(raw.counts)) == pulse.raw_counts_hash == raw.counts_sha256` | the Born-rule measurement counts are the ones hashed into the pulse |
| `pulse-hash` | `sha256(canonical(pulse − pulse_hash)) == pulse.pulse_hash` | provenance (backend, mode, timestamps, job ids), commitment, entropy and extractor params are all bound into one hash |
| `pulse-binds-result` | `pulse.provenance` / `pulse.commitment` equal the top-level ones | the human-readable fields aren't a different record from what was hashed |
| `chain` | `pulse.prev_hash == previous pulse_hash` | beacon chain link (`prev_pulse_hash` param); `0…0` = genesis |
| `commitment` | `committed_at ≤ collected_at` | commitment formed before the hardware outcome existed (**engine-reported** timestamps) |
| `entropy-health` | `entropy_report.health_passed` | SP 800-90B-style health tests passed (engine-reported) |

`canonical(x)` is Python `json.dumps(x, sort_keys=True, separators=(",", ":"))`.
Number tokens are kept verbatim from the response (JS number formatting
differs from Python's `repr`, which would silently change the hashed bytes).

**Classification** is `hardware` only when `provenance.mode == "qpu"`, the
backend name is not a simulator, and `entropy_report.grade` starts with
`hardware` (observed: `hardware-accounted`). `mode: "emu"` / backend `aer` /
grade `simulator-baseline` is `simulator`. Because `mode` and `backend` are
inside the pulse hash, relabelling an emu job as QPU breaks `pulse-hash`.

## What is *not* independently verifiable

- **Commitment preimage.** `commitment.binds = [circuit_hash, backend,
  provider_job_id, salt]`, but no common encoding (concatenation with
  separators, JSON, length-prefix, hex-decoded salt, HMAC, sha256/sha3/blake2)
  reproduces `commitment.commit`. We check it is present, bound into the
  pulse, and timestamped before collection — not that the hash opens.
- **That IBM actually ran it.** `provider_job_id` (e.g. `db276hc7f06c73apdhmg`)
  is an IBM Quantum job id; confirming it needs IBM credentials for the
  account that ran it. The pulse hash proves MOTH *claimed* this device at
  this time, and that the claim hasn't been edited since.
- **Extractor output from raw counts.** Output bytes are a Toeplitz extraction
  (public seed `toeplitz-v1`) of the counts; the seed matrix isn't in the
  result, so we check the hashes rather than re-extracting.
- The Bell/CHSH witness is reported, not recomputed; it is a device-fidelity
  witness, not a device-independent randomness certificate.

## Observed live behaviour (2026-10-06)

| | emu (`aer`) | qpu #1 (`ibm_fez`) | qpu #2 (`ibm_marrakesh`, chained to #1) |
|---|---|---|---|
| submit → completed | ~8 s | ~78 s | ~142 s |
| `entropy_report.grade` | `simulator-baseline` | `hardware-accounted` | `hardware-accounted` |
| extractable budget @1024 shots | ~850–1260 bits | ~912 bits | ~882 bits |
| CHSH S | 2.84 | 2.51 ± 0.05 | 2.74 |

QPU jobs: 12 random qubits + 4 Bell pairs (20 qubits), 1024 shots, device
auto-selected (least busy), ~2 QPU-seconds each. Job #2 was submitted with
`prev_pulse_hash` = job #1's `pulse_hash` and `pulse_index: 1`; the chain
verifies across two different IBM devices.

Steps reported by `/status`: `build → submit → collect → format`. QPU time is
spent in `collect` (queued on IBM); queue time varies with device load, so
treat minutes as normal.

**Output is capped to the entropy budget.** `output_bytes` returns
`min(requested, extractable)`; a 32-integer request (128 bytes, 4096 shots, emu)
returned 31 integers. A seed adapter must accept fewer integers than asked
(or size requests to ~25 uint32s per 1024 shots) rather than treat it as a
failure. At ~900 bits/job, one QPU job yields ~25 run seeds.
