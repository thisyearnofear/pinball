# CI/CD

This repo ships two workflows: a physics gate for the frontend, and a backend deploy for the
Hetzner VPS.

## GitHub Actions

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
- **Installs are frozen:** `pnpm-lock.yaml` is committed (root, `backend/` and `contracts/`), and
  every install in CI and in the `ci` script runs `--frozen-lockfile`. That pins the tree the
  numbers came from **and** turns a lockfile/`package.json` disagreement into a loud failure
  instead of a silent resolve to something newer. The step cache is keyed on the lockfile too.
- **This replaced a real hazard:** the lockfile used to be gitignored, so CI and Netlify installed
  whatever resolved that day, and the repo's tracked `package-lock.json` had drifted to a
  *different* resolution of the same tree (react 19.2.8 vs the 19.2.6 pnpm actually installed).
  Two lockfiles for one `package.json` is the bug that was fixed, not a missing file.
- **If a dependency changes:** run `pnpm install` and commit the updated `pnpm-lock.yaml` in the
  same commit, or the frozen install fails. `pnpm install --lockfile-only` re-checks the lockfile
  against `package.json` without touching `node_modules`.
- **Runtime:** ~1 min locally, most of it the shot-calling grid. The suite is deterministic (seeded
  RNG + fake timers) and yields to the worker's event loop between runs, so a slower runner changes
  how long it takes, never whether it passes.

### Deploy Backend — `.github/workflows/deploy-backend.yml`
- **Triggers:** push to `master` affecting `backend/**`, or manual `workflow_dispatch`
- **It had never run.** It triggered on `main`, and the default branch is `master`. The branch is
  fixed, so the next `backend/**` push deploys — or dispatch it manually to make the first run
  deliberate.
- **Editing this file cannot deploy production code:** the `paths` filter covers `backend/**`
  only. Use `workflow_dispatch` to exercise the workflow itself.
- **The rsync excludes what the server builds.** `node_modules` and `dist` are excluded so
  `--delete` cannot remove them and a local (macOS) `node_modules` is never uploaded over the
  server's; `.env*` is excluded so `--delete` can never remove server-side config. The signer keys
  live at `/etc/pinball-backend/.env`, outside the synced tree.
- Steps: Checkout → SSH setup (repo secrets) → rsync `backend/` to `/opt/pinball/backend` →
  `npm install`, `npm run build`, restart systemd `pinball-backend`
- **Open inconsistency:** the server installs with **npm** from the tracked
  `backend/package-lock.json`, while CI and local dev install with **pnpm** from
  `backend/pnpm-lock.yaml`. Both files are committed and current, so neither is wrong — but they
  are two resolutions of one tree, and moving the server to pnpm is the way to collapse them.

## Required Secrets (Repository Settings → Secrets and variables → Actions)
- `DEPLOY_HOST` – VPS IP (e.g., 157.180.36.156)
- `DEPLOY_USER` – SSH user (e.g., root)
- `DEPLOY_KEY` – OpenSSH private key for the above user

## Server prerequisites
- Systemd unit named `pinball-backend` (already configured)
- Env file at `/etc/pinball-backend/.env` with the signer keys
- Node.js installed

## Optional: Frontend
- Netlify can auto-deploy on push (its build runs `pnpm run build`; it does not run tests)
- If desired, a Netlify deploy workflow can be added using `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets

## Not gated in CI
- Frontend typecheck, unit tests and `next build` — these run locally via
  `pnpm run test:frontend` (`pnpm run ci` for the full sweep including backend and contracts).
  Netlify builds the site, but nothing runs the typecheck or the unit suite in Actions. If you want
  those to gate merges too, they are cheap (~15s each) and belong in `sim-gate.yml`.
