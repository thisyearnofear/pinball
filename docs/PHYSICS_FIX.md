# Physics Engine Stability Improvements

## Problem
Users reported an issue where the ball would pass straight through the flipper, particularly on mobile devices and within the Farcaster mini-app environment.

## Diagnosis
This "tunneling" effect is a common issue in physics engines when running on devices with variable or low frame rates.
- **Previous Implementation**: The physics engine updated using a variable time step based on the time elapsed since the last frame (`delta`).
- **The Issue**: On a slow device, `delta` can become large (e.g., 50ms+). If the ball is moving fast, it might travel a distance greater than the thickness of the flipper in a single update, effectively "teleporting" to the other side without a collision ever being detected.

## Solution: Fixed Time Step
We implemented a **fixed time step** update loop.

### How it works
1.  **Accumulator**: We track the real time passed in an `accumulator` variable.
2.  **Fixed Increments**: Instead of updating the physics engine once with the full `delta`, we update it in fixed chunks of `16.66ms` (60 FPS).
3.  **Loop**: If 50ms have passed, we run the physics update 3 times (3 * 16.66 = 49.98ms) and keep the remainder for the next frame.
4.  **Spiral of Death Protection**: We cap the accumulator at 250ms. If the device is extremely slow, we discard time rather than trying to catch up forever, which would freeze the game.

### Code Changes
Modified `src/model/game.ts`:
- Added `accumulator` variable.
- Updated `init()` to reset `accumulator`.
- Updated `update()` to use the `while (accumulator >= ENGINE_INCREMENT)` loop.

## Benefits
- **Consistency**: Physics behavior is now deterministic and independent of frame rate.
- **Stability**: Prevents tunneling/teleporting through thin objects like flippers.
- **Performance**: Handles lag spikes gracefully without breaking game logic.
