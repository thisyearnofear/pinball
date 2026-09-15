# CI/CD

This repo ships two workflows: a physics gate for the frontend, and a backend deploy for the
Hetzner VPS.

## GitHub Actions

### Sim Gate — `.github/workflows/sim-gate.yml`
- **Triggers:** every pull request, pushes to `master`, and manual `workflow_dispatch`
- **Runs:** `pnpm install`, then `pnpm run sim:kamikaze`
- **Guards two things only the real engine can catch:** skill discrimination collapsing (passive
  play grading as well as active play, or the precision meter ceasing to gate), and an unseeded
  draw reaching the physics path — which would make a run unreproducible from the seed it
  recorded (`tests/sim/unseeded-draws.ts`)
- **Deliberately the full grid:** `SIM_DEBUG` narrows the sim to one seed, variant and difficulty,
  and the unseeded-draw watch can only vouch for paths a run actually walks
- **Install note:** `pnpm-lock.yaml` is gitignored here, so CI has no committed lockfile to
  install from — and `--frozen-lockfile` refuses to install when none exists — hence
  `--no-frozen-lockfile`, the same flag the `ci` script uses for backend and contracts. A
  no-lockfile resolve was checked against the local lockfile and picks **identical versions**, so
  the sim's numbers match local runs. `pnpm install --lockfile-only` re-checks that after a
  dependency change.
- **Worth fixing separately:** because no lockfile is committed, CI installs whatever resolves
  that day. Committing `pnpm-lock.yaml` (and dropping it from `.gitignore`) would make CI and
  Netlify reproducible, and would let this step run frozen.
- **Runtime:** ~1 min locally, most of it the shot-calling grid. The suite is deterministic (seeded
  RNG + fake timers) and yields to the worker's event loop between runs, so a slower runner changes
  how long it takes, never whether it passes.

### Deploy Backend — `.github/workflows/deploy-backend.yml`
- Triggers: push to `main` affecting `backend/**`
- Steps:
  - Checkout
  - SSH setup using repository secrets
  - Rsync backend/ to `/opt/pinball/backend` on the server
  - Install deps, build, restart systemd `pinball-backend`

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
