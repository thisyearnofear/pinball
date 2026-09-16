import { describe, expect, it } from "vitest";

import { createHaptics, MAX_CHARGE_POWER } from "@/utils/haptics";
import { MAX_POWER } from "@/utils/input-controller";

/**
 * A haptics engine with no navigator and no real clock, so the ranking rules can
 * be tested as rules rather than by timing a real device.
 */
function setup(options: { enabled?: boolean; supported?: boolean } = {}) {
  const calls: (number | number[])[] = [];
  let clock = 0;
  const engine = createHaptics({
    vibrate: options.supported === false ? null : (pattern) => calls.push(pattern),
    now: () => clock,
    enabled: options.enabled ?? true,
  });
  return {
    engine,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("haptics engine", () => {
  it("forwards a pattern to the device", () => {
    const { engine, calls } = setup();
    engine.flip();
    expect(calls).toEqual([15]);
  });

  it("swallows a repeated texture event inside its gap", () => {
    const { engine, calls, advance } = setup();
    engine.flip();
    advance(20);
    engine.flip(); // inside FLIP's 45ms gap
    expect(calls).toEqual([15]);
    advance(30); // 50ms since the first
    engine.flip();
    expect(calls).toEqual([15, 15]);
  });

  it("does not blur a bumper run into one continuous buzz", () => {
    const { engine, calls, advance } = setup();
    // 100ms of bumper hits at frame rate: 35ms pattern, 90ms gap.
    for (let i = 0; i < 10; i += 1) {
      engine.bump();
      advance(10);
    }
    expect(calls).toEqual([35, 35]);
  });

  it("protects the run's ceremony from the player's own flipper", () => {
    const { engine, calls, advance } = setup();
    engine.drainVictory();
    // The exact failure this module exists to prevent: MDN says a new pattern
    // halts the one in progress, so this flipper would truncate the fanfare.
    engine.flip();
    expect(calls).toEqual([[40, 60, 90]]);

    advance(220); // past the 200ms hold
    engine.flip();
    expect(calls).toEqual([[40, 60, 90], 15]);
  });

  it("never queues a dropped event", () => {
    const { engine, calls, advance } = setup();
    engine.drainVictory();
    engine.flip();
    advance(1000);
    // The flipper was dropped, not deferred: nothing fires on its behalf later.
    expect(calls).toEqual([[40, 60, 90]]);
  });

  it("lets a bigger beat interrupt a smaller one", () => {
    const { engine, calls } = setup();
    engine.nudge(); // rank 1, no hold
    engine.aiSave(); // rank 2: plays over the top
    expect(calls).toEqual([22, 25]);
  });

  it("scales a charge release with the charge", () => {
    const { engine, calls, advance } = setup();
    engine.chargeRelease(1);
    advance(150);
    engine.chargeRelease(2);
    advance(150);
    engine.chargeRelease(3);
    expect(calls).toEqual([22, 37, 52]);
  });

  it("clamps a charge release beyond full power", () => {
    const { engine, calls, advance } = setup();
    engine.chargeRelease(99);
    advance(150);
    engine.chargeRelease(3);
    expect(calls[0]).toEqual(calls[1]);
  });

  it("deepens the charge tick per notch", () => {
    const { engine, calls, advance } = setup();
    engine.chargeTick(1);
    advance(60);
    engine.chargeTick(2);
    advance(60);
    engine.chargeTick(3);
    expect(calls).toEqual([8, 12, 16]);
  });

  it("escalates the tilt warning with the level", () => {
    const { engine, calls, advance } = setup();
    engine.tiltWarning(1);
    advance(200);
    engine.tiltWarning(3);
    expect(calls[0]).toEqual([16, 28, 30]);
    // Three pulses plus the harder final one: the table is about to give up.
    expect(calls[1]).toEqual([16, 28, 16, 28, 16, 28, 30]);
  });

  it("distinguishes the shot verdicts", () => {
    const { engine, calls, advance } = setup();
    engine.shotReleased("perfect");
    advance(300);
    engine.shotReleased("good");
    advance(200);
    engine.shotReleased("poor");
    advance(200);
    engine.shotReleased("neutral");
    expect(calls).toEqual([[18, 26, 42], 24, [12, 34, 12], 16]);
  });

  it("makes the shot verdict the one thing a flipper cannot cut short", () => {
    const { engine, calls } = setup();
    engine.shotReleased("perfect");
    engine.flip();
    engine.bump();
    expect(calls).toEqual([[18, 26, 42]]);
  });

  it("mutes on demand and stops whatever is running", () => {
    const { engine, calls, advance } = setup();
    engine.drainVictory();
    engine.setEnabled(false);
    // 0 is the documented way to cancel a pattern in progress.
    expect(calls).toEqual([[40, 60, 90], 0]);

    advance(1000);
    engine.flip();
    expect(calls).toHaveLength(2);
  });

  it("reports the preference so it can be persisted", () => {
    const seen: boolean[] = [];
    const engine = createHaptics({
      vibrate: () => {},
      onEnabledChange: (value) => seen.push(value),
    });
    engine.setEnabled(false);
    expect(seen).toEqual([false]);
    expect(engine.isEnabled()).toBe(false);
  });

  it("never fires on a device without the API, and says so", () => {
    const { engine, calls } = setup({ supported: false });
    expect(engine.isSupported()).toBe(false);
    expect(engine.flip()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("keeps the charge ceiling in step with the input controller", () => {
    // Two modules, one number: the release feedback is scaled against it and the
    // charge curve is built from it, so a drift here would misreport the shove.
    expect(MAX_CHARGE_POWER).toBe(MAX_POWER);
  });
});
