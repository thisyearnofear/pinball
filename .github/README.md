# CI/CD

This repo ships a backend deploy workflow for Hetzner VPS.

## GitHub Actions
- Workflow: `.github/workflows/deploy-backend.yml`
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
- Netlify can auto-deploy on push
- If desired, a Netlify deploy workflow can be added using `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets
