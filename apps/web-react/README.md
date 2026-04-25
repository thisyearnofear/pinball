# React Shell (Mezo Passport)

This folder is the start of the **full React migration** required for clean Mezo Passport integration.

Current state:
- React + RainbowKit + `@mezo-org/passport` connect button works (once deps are installed).
- The legacy Vue game is temporarily embedded via an iframe (`VITE_LEGACY_GAME_URL`) to avoid blocking on a full UI rewrite.

Next steps:
1. Move the pinball engine into a reusable TS module (no Vue dependencies).
2. Mount the game directly in React (remove iframe).
3. Delete the Vue shell once feature parity is reached.

