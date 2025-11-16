## Issue
- The game fails with `ReferenceError: leftFlipperBody is not defined` in the physics engine after replacing `matter-attractors` with direct forces.
- Additional console note about `window.ethereum` setter appears unrelated to our code; gameplay is blocked by the physics error.

## Plan
1. Restore previous physics implementation:
- Reintroduce `matter-attractors` import and `Matter.use(MatterAttractors)`.
- Reinstate the flipper `plugin` and ignorable bodies (`ignore1`, `ignore2`) used for attractor-based forces.
- Remove the new `applyFlipperForces`, `balls` tracking, and `leftFlipperBody/rightFlipperBody` references.
2. Build and verify:
- Run a production build to confirm no runtime errors and ensure startup works.
3. Keep other enhancements intact:
- Prize split card, on-chain `getPrizeBps`, global toasts, vendor chunking changes remain.

## Notes
- The `window.ethereum` setter error originates from `pageProvider.js` and is not introduced by our changes; we will leave wallet detection logic untouched.

## Deliverables
- A single commit that reverts the physics engine changes and restores working gameplay.