# CI/CD

This repo ships three workflows: a checks gate and a physics gate for the frontend, and a backend
deploy for the Hetzner VPS. Each is one signal with a name that says what it is, because a check
run is identified by workflow + job — "Sim Gate / sim" is a stable thing to require.

## GitHub Actions

### Checks — `.github/workflows/checks.yml`
- **Triggers:** every pull request, pushes to `master`, and manual `workflow_dispatch`
- **Runs three jobs**, each on the Node version in `.nvmrc`:
  - `frontend` — frozen `pnpm install`, `pnpm run typecheck`, `pnpm test` (Vitest + jsdom)
  - `backend` — `npm ci --prefix backend`, `npm --prefix backend run build` (the same `tsc` the
    deploy runs on the server), then the backend suite. Installs from the npm lockfile because the
    backend *is* an npm package; that is the tree the server resolves
  - `contracts` — frozen pnpm install, then the Hardhat suite
- **The backend and contract jobs exist because Deploy Backend now waits for a green Checks run.**
  A gate that never tested the tree it deploys would be worse than no gate — but the flip side is
  real: **a red or flaky job here is now a deploy outage, not just a red tick.**
- **None of these jobs needs a secret.** The backend suite does not import
  `backend/src/lib/env.ts` (the only thing that reads the signer env), and
  `contracts/hardhat.config.ts` falls back to `accounts: []` when `PRIVATE_KEY` is unset.
- **The contracts suite was broken before this**, and only under pnpm: the tests import `chai` and
  `@nomicfoundation/hardhat-ethers` directly, both of which `hardhat-toolbox@5` supplies as
  *peers*. npm's flat `node_modules` hid that; pnpm's strict layout does not, so `hardhat test`
  died with `ERR_MODULE_NOT_FOUND`. They are now direct devDependencies, at the versions the
  lockfile had already resolved, which also un-breaks `pnpm run ci`.
- **Why it is not a job inside Sim Gate:** "a type does not check" and "the physics invariants
  moved" are different signals, and these take seconds rather than the sim's ~50s. Two jobs in one
  workflow would each install dependencies on their own runner anyway, so separating them costs
  nothing.
- **`master` has no branch protection**, so these report as check runs; they do not by themselves
  block a merge until that is switched on in repository settings.
- **Deliberately not included:** `pnpm run build` (the Next export) — see "Not gated in CI" below.

### Sim Gate — `.github/workflows/sim-gate.yml`
- **Triggers:** every pull request, pushes to `master`, and manual `workflow_dispatch`
- **Runs:** `pnpm install`, then `pnpm run sim:kamikaze`, on the Node version in `.nvmrc` — read
  from that file rather than repeated in the workflow, so CI and local dev cannot drift apart.
  (Netlify is pinned separately by `NODE_VERSION` in `netlify.toml`, which takes precedence over
  `.nvmrc` there.)
- **Node is enforced, not just documented:** `engines.node` in `package.json` plus
  `engine-strict=true` in `.npmrc` makes an install on the wrong Node fail with
  `ERR_PNPM_UNSUPPORTED_ENGINE`. The root `.npmrc` is not inherited by `backend/` or `contracts/`,
  so those still install on whatever Node they have.
- **Guards two things only the real engine can catch:** skill discrimination collapsing (passive
  play grading as well as active play, or the precision meter ceasing to gate), and an unseeded
  draw reaching the physics path — which would make a run unreproducible from the seed it
  recorded (`tests/sim/unseeded-draws.ts`)
- **Deliberately the full grid:** `SIM_DEBUG` narrows the sim to one seed, variant and difficulty,
  and the unseeded-draw watch can only vouch for paths a run actually walks
- **Installs are frozen, by the repo rather than by the builder:** `frozen-lockfile=true` in
  `.npmrc` makes every pnpm install resolve from the committed lockfile — local, CI and Netlify
  alike. pnpm otherwise only freezes when it detects `CI=true`, which leaves the guarantee resting
  on the host's environment rather than on the repo. A lockfile/`package.json` disagreement is now
  `ERR_PNPM_OUTDATED_LOCKFILE` instead of a silent resolve to something newer. The step cache is
  keyed on the lockfile too.
- **One lockfile per package, and it is committed:** `pnpm-lock.yaml` (frontend),
  `contracts/pnpm-lock.yaml`, and `backend/package-lock.json`. The backend is an **npm** package
  because that is what the deploy server installs from, with `npm ci`, so the deployed tree is
  exactly what its lockfile pins. `backend/pnpm-lock.yaml` was a second resolution of that same
  tree and is gone, which is what makes the backend's local, CI and deployed installs agree.
- **This replaced a real hazard:** the lockfile used to be gitignored, so CI and Netlify installed
  whatever resolved that day, and a *second*, tracked lockfile for the same `package.json` had
  drifted to a different resolution of the same tree (react 19.2.8 vs the 19.2.6 pnpm actually
  installed). Two lockfiles for one `package.json` is the bug that was fixed, not a missing file.
  Both are now gone: the frontend's stray `package-lock.json` was deleted, and
  `backend/pnpm-lock.yaml` was removed in favour of the npm lockfile the server actually uses.
- **If a dependency changes:** run `pnpm install` and commit the updated `pnpm-lock.yaml` in the
  same commit, or the frozen install fails. `pnpm install --lockfile-only` re-checks the lockfile
  against `package.json` without touching `node_modules`.
- **Runtime:** ~1 min locally, most of it the shot-calling grid. The suite is deterministic (seeded
  RNG + fake timers) and yields to the worker's event loop between runs, so a slower runner changes
  how long it takes, never whether it passes.

### Deploy Backend — `.github/workflows/deploy-backend.yml`
- **Triggers:** a **green `Checks` run on `master`** (`workflow_run`), or manual `workflow_dispatch`.
  It deliberately no longer triggers on `push`: a `paths: backend/**` filter cannot express "and CI
  was green", so the old form would have deployed a commit that failed its own tests. The checkout
  is pinned to `workflow_run.head_sha` — the commit Checks actually tested — rather than whatever
  `master` points at by the time the job starts.
- **A run where the backend has not changed is a no-op.** rsync compares *content*
  (`--checksum`), not mtimes: a fresh checkout stamps every file with the checkout time, so an
  mtime compare would see the whole tree as new and restart the signer for nothing. When
  `--itemize-changes` prints nothing, the build, restart and verify steps are skipped. That is what
  makes it affordable to sit behind every green Checks run instead of filtering on paths.
- **A wrong credential can now cost you an hour of deploys.** fail2ban runs on the VPS with
  5-tries-then-1-hour bans, so a runner authenticating with a bad key or user gets its IP banned —
  and correcting the credential alone will not restore deploys until the ban expires. If deploys
  fail immediately after a credential change, check `fail2ban-client status sshd` on the box before
  debugging the workflow.
- **It had never run until 2026-09-16.** It triggered on `main`, and the default branch is
  `master`. With the branch fixed, the first commit carrying a `backend/**` file fired it — that
  was `backend/pnpm-lock.yaml`, committed alongside the trigger fix itself. A deploy on a
  lockfile-only change is intended: a dependency bump changes what the server should be running.
- **What was actually wrong (found 2026-09-16): two independent faults.** Failures were in
  `Add host to known_hosts`, but neither cause was the host, the key or the firewall:
  1. **The port.** Every command assumed 22 and this VPS runs sshd on 49152, so `ssh-keyscan`
     reached nothing. `Rsync backend to server` / `Build and restart service` are recorded as
     **skipped** on every run before this — no production change had ever been made by this
     workflow.
  2. **The user.** `DEPLOY_USER` was `root`, and the box has `AllowUsers deploy` with
     `PermitRootLogin no`, so root cannot authenticate at all. It surfaces as
     `Permission denied (publickey)`, which reads like a key problem and is not one.
  With both corrected the first fully green run was 2026-09-16 22:18 UTC, which deployed a backend
  that had been stale since ~Jul 29 (the client's `quantum-seed.ts` calls had been silently
  falling back to a local CSPRNG because `/api/quantum/seed` 404'd). The port now lives in one
  place (`env.DEPLOY_PORT`) instead of five, which is how those call sites drifted in the first place.
- **The host was verified rather than assumed** (from the runner's own egress): 49152 answers,
  sshd is OpenSSH 9.6p1 with `PasswordAuthentication no` and `PermitRootLogin no`, and UFW allows
  49152 and 80/443 from anywhere while **not** allowing the backend's own `0.0.0.0:8081` — so the
  signer is reachable only through nginx on 443. The non-standard port is scaffolding, not a
  security control; key-only auth is what protects the host.
- **An edit to *only* this file cannot deploy production code**, but that is weaker than "editing
  it is safe in any commit": the `paths` filter is evaluated against the whole push, so a commit
  that edits this file *and* touches `backend/**` does deploy. Use `workflow_dispatch` to exercise
  the workflow deliberately.
- **The rsync excludes what the server builds.** `node_modules` and `dist` are excluded so
  `--delete` cannot remove them and a local (macOS) `node_modules` is never uploaded over the
  server's; `.env*` is excluded so `--delete` can never remove server-side config. The signer keys
  live at `/etc/pinball-backend/.env`, outside the synced tree.
- **Manual runs default to a dry run.** `workflow_dispatch` takes a `dry_run` boolean, default
  `true`: it probes the SSH path (`BatchMode`, 10s connect timeout), prints the server's node/npm
  versions, and runs `rsync --dry-run --itemize-changes` so you can see what a real deploy would
  upload — with nothing written to the server. Untick it to deploy.
- Steps: Checkout → SSH setup (repo secrets) → `known_hosts` → rsync `backend/` to
  `/opt/pinball/backend` → `npm ci --no-audit --no-fund --ignore-scripts`, `npm run build`,
  `sudo -n systemctl restart pinball-backend` → **verify** `systemctl is-active` and
  `curl http://127.0.0.1:8081/health`. That last step exists because the restart is the part that
  had never once run: a crash-looping unit reads as `activating`, so without it a half-applied
  deploy would be a quiet one.
- **Ports are configuration here, not code.** `DEPLOY_PORT` (default `49152`) and
  `BACKEND_LOCAL_PORT` (default `8081`) are set once in the workflow's `env:` block, and every
  `ssh`, `ssh-keyscan` and `rsync` call reads them. Override either with a repository variable of
  the same name — no edit needed. `-p` on `ssh-keyscan` is load-bearing, not cosmetic: on a
  non-default port ssh looks up `[host]:port` in `known_hosts`, so a keyscan without it writes
  entries ssh will never match.
- **The deployed tree is a pinned tree.** `npm ci` (not `install`) resolves exactly from
  `backend/package-lock.json` and fails if that lockfile has drifted from `backend/package.json`,
  so a deploy can no longer silently install a tree that CI never ran. That is why the backend
  keeps one lockfile: `pnpm run ci` now runs `npm ci --prefix backend` rather than a pnpm install.
- **Diagnosing a host-key failure:** the step prints ssh-keyscan's own stderr and names the port it
  tried, so the message says which of three it is — `DEPLOY_HOST` naming a host that no longer
  answers, that port not matching sshd's `Port`, or UFW not allowing it from GitHub's runners.
  Note that GitHub publishes ~6,980 runner CIDRs, so "allowlist GitHub's IPs" is not a workable
  fix for a firewall; the reachability of this port from runners is a deliberate, documented
  choice.

## Required Secrets (Repository Settings → Secrets and variables → Actions)
- `DEPLOY_HOST` – VPS IP (`157.180.36.156` for production)
- `DEPLOY_USER` – SSH user; must be **`deploy`**. This box sets `AllowUsers deploy` and
  `PermitRootLogin no`, so `root` fails with `Permission denied (publickey)` — which looks like a
  bad key and is actually a bad user
- `DEPLOY_KEY` – OpenSSH private key for the above user. The matching public key must be in
  `/home/deploy/.ssh/authorized_keys` on the box, not merely set as a secret

## Optional Variables (Settings → Secrets and variables → Actions → Variables)
- `DEPLOY_PORT` – sshd port on the VPS; defaults to `49152`
- `BACKEND_LOCAL_PORT` – local port used by the post-deploy health check; defaults to `8081`

## Server prerequisites
- Systemd unit named `pinball-backend` (already configured; it runs as **root** — pre-existing)
- Env file at `/etc/pinball-backend/.env` with the signer keys. `SCORE_SIGNER_PK` and `CHAIN_ID`
  are the only required variables; everything else has a default, so a deploy cannot crash-loop on
  a newly-introduced variable
- Node.js installed (22.22.1 at the last check) and `curl` available for the health check
- `sshd` reachable from GitHub's runners on `DEPLOY_PORT`, and UFW allowing that port
- `/opt/pinball/backend` writable by `DEPLOY_USER` — it is owned `deploy:deploy` today
- `DEPLOY_USER` must be able to restart the unit. A bare `systemctl restart` depends on polkit, so
  the workflow uses `sudo -n` (fail fast rather than hang on a password prompt); this account has
  `NOPASSWD: ALL`
- `fail2ban` is enabled with an `[sshd]` jail bound to **49152**, 5 tries then a 1 hour ban
  (`/etc/fail2ban/jail.local`). Two things it fixed: the jail previously targeted `port = ssh`, so
  a ban inserted a rule for port 22 and protected nothing; and the service was disabled, so nothing
  was reading failures at all. A ban names one IP and one port — it cannot affect the other services
  on this box

## Optional: Frontend
- Netlify auto-deploys on push: it runs `pnpm run build` on the Node version pinned by
  `NODE_VERSION` in `netlify.toml` (24, which takes precedence over `.nvmrc` there), and its
  install resolves from the committed `pnpm-lock.yaml` because `frozen-lockfile=true` in `.npmrc`
  applies to it too — rather than because Netlify happens to export `CI`. It runs no tests.
- If desired, a Netlify deploy workflow can be added using `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets

## Gated in CI
- `checks.yml`: frontend typecheck + unit suite, backend build + suite, contract suite
- `sim-gate.yml`: the physics invariants (`pnpm run sim:kamikaze`)
- `deploy-backend.yml`: runs after a green `checks.yml`, and is a no-op unless `backend/` changed

## Not gated in CI
- **`pnpm run build` (the Next export).** Netlify builds the site on push, so a broken build does
  surface there — after it has already been pushed to `master`, rather than on the pull request.
  This is now the only suite that runs nowhere before `master`.
