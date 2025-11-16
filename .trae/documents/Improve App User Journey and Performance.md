## Goals
- Make onboarding and tournament flow cohesive, predictable, and fast.
- Reduce friction on wallet/chain, clarify fees and states, and standardize error handling.
- Cut bundle weight and improve runtime responsiveness without changing core gameplay.

## User Journey Improvements
### Onboarding & Wallet
1. Consolidate connect flow in `new-game-window.vue` and header to a single CTA with explicit anonymous play option.
2. Detect wrong chain early and offer one-click `switchChain(42161)` with clear copy in `tournament-join-modal.vue`.
3. Persist connection state across refresh via `web3Service.autoConnect()` and show short address with chain badge (already present).

### Tournament Discovery
1. Show an "Active Tournament" card in the entry window with skeleton while loading (`getTournamentInfo`) and a countdown.
2. Provide entry fee and total pot up front; disable join when `NOT_ACTIVE`.

### Join & Play
1. In `tournament-join-modal.vue`, simplify state to `loading → confirm → joining → success/error` and keep actions visible.
2. Display fee, pot, start/end, and network in confirm; warn if not entered and offer anonymous play.
3. After join, return the user to game with a transient success toast.

### Scores & Rewards
1. Gate score submission on `entered` and `NOT_FINAL` with clear reasons when disabled.
2. Post-finalization, show a claim CTA with rank and estimated reward; disable when `CLAIMED`.

### Error Handling & Messaging
1. Create a global toast/error helper; standardize messages from `BAD_DATA`, `NO_TOURNAMENT`, `NOT_ACTIVE`, `BAD_FEE`, and network errors.
2. Map low-level errors to friendly text with actions (retry, switch chain, view details).

## Performance Improvements
### Code Splitting & Vendor Isolation
1. Add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split `ethers`, `matter-js`, and Farcaster SDK into separate chunks; keep modal screens lazy via `import()`.
2. Ensure physics (`PinballTable`) loads only after Start or Join.

### Dependencies & Bundle Hygiene
1. Update or remove `matter-attractors` since it warns on `matter-js@0.19.0`.
2. Limit `optimizeDeps.include` to what is actually needed and exclude heavy Web3 providers not in use.
3. Prefer minimal imports from `ethers` to help tree-shaking.

### Assets & Fonts
1. Compress large images (e.g., `title_upper.png`) and adopt WebP/AVIF where possible.
2. Ensure `font-display: swap` and preconnect to font host; consider hosting fonts locally to avoid slow network fallback.

### Runtime UX
1. Add skeletons for tournament data and leaderboard; avoid layout shifts.
2. Prefetch next modal/component on hover/open intent.
3. Debounce expensive UI updates and avoid unnecessary reactivity watchers.

## Accessibility & Cohesion
1. Ensure modals manage focus and Esc dismissal consistently; Teleport where needed.
2. Provide keyboard navigation for core actions and readable status labels.

## Observability
1. Add basic analytics/events around connect, switch chain, join, submit score, claim, and errors to identify friction.

## Phased Implementation
### Phase 1: UX polish & error handling
- Global toast helper; friendly error mapping.
- Simplify modal state and copy; skeleton loading.
- Early chain detection and one-click switch.

### Phase 2: Performance
- Vendor manualChunks; verify bundle size.
- Remove/replace `matter-attractors`; lazy-load physics.
- Asset optimization and font loading tweaks.

### Phase 3: Rewards & discovery enhancements
- Clear reward claim surfaces; rank and amount.
- Active tournament card and countdown; anonymous play clarity.

## Acceptance Criteria
- Connect→Join→Play→Submit→Claim flows complete in <3 clicks each, with clear states.
- No unhandled errors; standardized toasts render actionable messages.
- Initial interactive load time reduced; vendor chunks split and physics lazy-loaded.
- Accessibility checks: focus trapping and keyboard shortcuts work in modals.