# CI/CD

This repo ships three workflows: a checks gate and a physics gate for the frontend, and a backend
deploy for the Hetzner VPS. Each is one signal with a name that says what it is, because a check
run is identified by workflow + job — "Sim Gate / sim" is a stable thing to require.

## GitHub Actions

### Checks — `.github/workflows/checks.yml`
- **Triggers:** every pull request, pushes to `master`, and manual `workflow_dispatch`
- **Runs:** frozen `pnpm install`, then `pnpm run typecheck` and `pnpm test` (the Vitest + jsdom
  suite), on the Node version in `.nvmrc`
- **Why it is not a job inside Sim Gate:** "a type does not check" and "the physics invariants
  moved" are different signals, and these take seconds rather than the sim's ~50s. Two jobs in one
  workflow would each install dependencies on their own runner anyway, so separating them costs
  nothing.
- **`master` has no branch protection**, so these report as check runs; they do not by themselves
  block a merge until that is switched on in repository settings.
- **Deliberately not included:** `pnpm run build` and the backend/contract suites — see "Not gated
  in CI" below.

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
- **Triggers:** push to `master` affecting `backend/**`, or manual `workflow_dispatch`
- **It had never run until 2026-09-16.** It triggered on `main`, and the default branch is
  `master`. With the branch fixed, the first commit carrying a `backend/**` file fired it — that
  was `backend/pnpm-lock.yaml`, committed alongside the trigger fix itself. A deploy on a
  lockfile-only change is intended: a dependency bump changes what the server should be running.
- **That first run stopped before touching anything.** It failed in `Add host to known_hosts`
  (`ssh-keyscan` could not reach `DEPLOY_HOST` from the runner), so `Rsync backend to server` and
  `Build and restart service` are both recorded as **skipped**. No production change. The cause is
  outside this repo — the secret's host, or SSH reachability to it from GitHub's runners — and the
  step now prints that diagnosis instead of a bare `exit code 1`.
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
- Steps: Checkout → SSH setup (repo secrets) → rsync `backend/` to `/opt/pinball/backend` →
  `npm ci --no-audit --no-fund --ignore-scripts`, `npm run build`, restart systemd `pinball-backend`
- **The deployed tree is a pinned tree.** `npm ci` (not `install`) resolves exactly from
  `backend/package-lock.json` and fails if that lockfile has drifted from `backend/package.json`,
  so a deploy can no longer silently install a tree that CI never ran. That is why the backend
  keeps one lockfile: `pnpm run ci` now runs `npm ci --prefix backend` rather than a pnpm install.
- **Diagnosing a host-key failure:** the step prints ssh-keyscan's own stderr. Expect one of three
  causes — the `DEPLOY_HOST` secret naming a host that no longer answers, the VPS firewall not
  allowing GitHub's runner IPs, or SSH listening on a non-standard port. That last case needs the
  workflow extended rather than the secret fixed: none of these commands passes a port, and this
  deployment has never worked over one.

## Required Secrets (Repository Settings → Secrets and variables → Actions)
- `DEPLOY_HOST` – VPS IP (e.g., 157.180.36.156)
- `DEPLOY_USER` – SSH user (e.g., root)
- `DEPLOY_KEY` – OpenSSH private key for the above user

## Server prerequisites
- Systemd unit named `pinball-backend` (already configured)
- Env file at `/etc/pinball-backend/.env` with the signer keys
- Node.js installed

## Optional: Frontend
- Netlify auto-deploys on push: it runs `pnpm run build` on the Node version pinned by
  `NODE_VERSION` in `netlify.toml` (24, which takes precedence over `.nvmrc` there), and its
  install resolves from the committed `pnpm-lock.yaml` because `frozen-lockfile=true` in `.npmrc`
  applies to it too — rather than because Netlify happens to export `CI`. It runs no tests.
- If desired, a Netlify deploy workflow can be added using `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets

## Not gated in CI
- **`pnpm run build` (the Next export).** Netlify builds the site on push, so a broken build does
  surface there — after it has already been pushed to `master`, rather than on the pull request.
- **The backend and contract suites.** `pnpm run ci` and `pnpm run test:all` run them locally;
  nothing in Actions does. A `backend` job in `checks.yml` is the obvious home.
- Typecheck and the unit suite are gated as of `checks.yml`; the physics invariants stay in
  `sim-gate.yml`.
