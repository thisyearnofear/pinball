# React Parity Audit (Vue → React consolidation)

This document inventories what the current **Vue shell** provides and what the current **React shell** provides, then lists the remaining parity gaps and a recommended consolidation plan (delete Vue once parity is reached).

## Scope

- Vue shell entry: `src/App.vue`
- Vue components: `src/components/**`
- React shell entry: `apps/web-react/src/App.tsx`
- React components today: `apps/web-react/src/{GameScreen,GameMount}.tsx`

## Current state summary

### React shell (implemented)
- Mezo Passport connection (RainbowKit + wagmi)
- Pinball engine mounted directly (no iframe) via `src/domains/game/mount-game.ts`
- Tournament panel:
  - load active tournament
  - show entry fee / pot / top leaderboard slice
  - enter tournament
  - tournament run + auto score submission
- Clean wallet boundary: `WalletPort` (React uses `Eip1193WalletPort`)
- Player name input persisted to localStorage (`pinball_player_name`)

### Vue shell (implemented)
Vue is still the “full UX shell” and contains a number of overlays/settings flows not yet present in React:

#### Shell / navigation
- Header menu + modal navigation (About / Settings / How to play / High scores)
  - `src/components/header-menu/header-menu.vue`
  - `src/components/modal/modal.vue`

#### Start flow / menus
- New game menu window:
  - tournament card (active tournament, countdown, fee, pot, prize split)
  - table selection UI
  - practice vs tournament selection
  - wallet selection modal + tournament join modal
  - `src/components/new-game-window/new-game-window.vue`
  - `src/components/tournament-join/tournament-join-modal.vue`

#### In-game HUD & overlays
- In-game HUD (balls, multiplier, score) + “message” banner
- Round results overlay
- Touch UX overlays: thumb pads, bump button, touch zones
- VHS overlay (visual effect)
- Quick hints overlay
  - `src/components/pinball-table/pinball-table.vue`
  - `src/components/pinball-table/round-results.vue`

#### End-of-run UX
- Score submission overlay with 3-step progress + retry + “skipped” state
  - `src/components/score-submission/score-submission-overlay.vue`
- Game complete celebration overlay with CTAs (play again, tournament, leaderboard)
  - `src/components/celebration/game-complete-celebration.vue`

#### Onboarding & meta screens
- Tutorial overlay (touch + keyboard variants, skip, timed slides)
  - `src/components/tutorial/tutorial.vue`
- About screen + credits
  - `src/components/about/about.vue`
- How to play screen
  - `src/components/how-to-play/how-to-play.vue`

#### Settings
- Toggles persisted in storage and wired into services:
  - sound/music (audio-service)
  - quick hints (storage)
  - haptics (utils/haptics)
  - VHS (storage)
  - fullscreen (fullscreen util)
  - `src/components/settings/settings.vue`

## Parity gap matrix (what blocks deleting Vue)

Legend:
- ✅ present in React
- ❌ missing in React
- 🟡 partial

| Area | Vue | React | Notes |
|---|---:|---:|---|
| Passport wallet connect | ❌ (legacy web3Service) | ✅ | React is correct direction |
| Start menu (practice/tournament/table select) | ✅ | ❌ | React currently has buttons only |
| Tournament join modal UX | ✅ | ❌ | React enters directly; no join/confirm UX |
| In-game HUD (score/balls/multiplier) | ✅ | ❌ | Engine runs, but HUD is missing |
| Round results overlay | ✅ | ❌ | Missing in React |
| Quick hints overlay | ✅ | ❌ | Missing in React |
| Tutorial overlay | ✅ | ❌ | Missing in React |
| VHS effect overlay | ✅ | ❌ | Missing in React |
| Celebration overlay | ✅ | ❌ | Missing in React |
| Score submission overlay | ✅ | ❌ | React submits in background; no progress UI |
| About / How-to-play screens | ✅ | ❌ | Should be simple ports |
| Settings UI + persistence | ✅ | ❌ | Must port or decide to drop features |
| Toast notifications | ✅ | ❌ | React currently relies on minimal text status |

## Recommended migration order (fastest path to deleting Vue)

### Phase A — “Functional parity” (minimum acceptable UX)
1. **React HUD**: Score / Balls / Multiplier display (equivalent to `PinballTable` status display).
2. **React start menu**:
   - player name
   - practice vs tournament
   - table selection (reusing `src/definitions/tables`)
   - tournament summary card (fee/pot/ends in)
3. **React settings** (minimum):
   - sound/music toggles (wire to `audio-service`)
   - haptics (wire to `utils/haptics`)
   - fullscreen toggle (if supported)
4. **React how-to-play + about** (simple static screens).

### Phase B — “Polish parity” (match the Vue experience)
5. Tutorial overlay (touch + keyboard)
6. Score submission overlay (validating/signing/ready/error/skipped)
7. Celebration overlay (play again / tournament / leaderboard)
8. VHS overlay + quick hints overlay
9. Toast system (or a small equivalent)

### Phase C — Consolidation
10. Remove Vue shell + Vue-only components once:
    - React owns start flow + settings + help pages
    - React has at least functional parity for end-of-run UX
    - All routes/entrypoints point to React shell for production deploy

## Deletion checklist (what “ready to delete Vue” means)

You can delete `src/App.vue` and `src/components/**` only when:
- React includes replacements for:
  - start menu
  - settings
  - how-to-play + about
  - high scores / tournament status (already partial)
  - in-game HUD (score/balls/multiplier)
  - end-of-run UX (at least “score submitted / failed” surfaced)
- React build is the deploy target (no iframe, no shared-vue routing assumptions)

## Immediate next PR suggestion (recommended)

Build Phase A first (functional parity) because it removes the biggest blockers with minimal scope:
- Add `GameHUD` React component + state polling from the mutable `game` object inside `mountGame()`
- Add a minimal `StartMenu` modal in React with:
  - practice/tournament start
  - table selection
  - tournament summary
- Add a minimal `Settings` modal in React wired to existing services/storage

