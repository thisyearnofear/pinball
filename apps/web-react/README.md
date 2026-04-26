# React Shell (Mezo Passport)

This folder is the start of the **full React migration** required for clean Mezo Passport integration.

Current state:
- React + RainbowKit + `@mezo-org/passport` connect button works (once deps are installed).
- The pinball game is now mounted directly in React (no iframe).

Next steps:
1. Wire up the remaining tournament UX in React (enter + play + submit + leaderboard parity).
2. Delete the Vue shell once feature parity is reached.

## Quickstart

```sh
pnpm install
pnpm run dev
```

### Why pnpm?

In this repo, `npm install` has intermittently failed due to an npm/arborist internal error.
`pnpm` installs and builds reliably and is the recommended workflow for `apps/web-react`.
