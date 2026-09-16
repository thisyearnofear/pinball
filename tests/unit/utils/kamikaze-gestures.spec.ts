import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachKamikazeGestures, type KamikazeGestures } from "@/utils/input-controller";

/**
 * jsdom has no PointerEvent, but every field the controller reads (clientX,
 * clientY, pointerId) can be carried by a MouseEvent.
 */
function pointerEvent(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  }) as unknown as PointerEvent & { pointerId: number };
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

function spaceEvent(type: "keydown" | "keyup"): KeyboardEvent {
  return new KeyboardEvent(type, { code: "Space", bubbles: true, cancelable: true });
}

let clock = 0;
let frameQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  clock = 1000;
  frameQueue = [];
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frameQueue.push(cb);
    return frameQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frameQueue = [];
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Advance the clock and run whatever frames the charge loop queued. */
function pump(ms: number) {
  clock += ms;
  const due = frameQueue;
  frameQueue = [];
  due.forEach((cb) => cb(clock));
}

function setup(overrides: Partial<KamikazeGestures> = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const capture = vi.fn();
  const release = vi.fn();
  (el as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
  (el as unknown as { releasePointerCapture: unknown }).releasePointerCapture = release;

  const nudges: [number | null, number | null, number][] = [];
  const notches: number[] = [];
  const chargeEnd = vi.fn();
  const dive = vi.fn();
  const deploy = vi.fn();
  const tiltLock = vi.fn();

  const gestures: KamikazeGestures = {
    onNudge: (x, y, power) => nudges.push([x, y, power]),
    onDive: dive,
    onDeploy: deploy,
    onTiltLock: tiltLock,
    onChargeEnd: chargeEnd,
    onChargeNotch: (notch) => notches.push(notch),
    shouldHandle: () => true,
    ...overrides,
  };

  const detach = attachKamikazeGestures(el, gestures);
  return { el, nudges, notches, chargeEnd, dive, deploy, tiltLock, capture, release, detach };
}

describe("kamikaze gestures: nudge", () => {
  it("treats a quick tap as a plain nudge at 1x", () => {
    const { el, nudges } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", 100, 200));
    pump(50);
    el.dispatchEvent(pointerEvent("pointerup", 100, 200));
    expect(nudges).toEqual([[100, 200, 1]]);
  });

  it("reports each charge notch and releases at full power", () => {
    const { el, nudges, notches } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", 120, 240));
    pump(300); // power ~1.31
    pump(400); // power ~2.22
    pump(500); // power 3, capped
    el.dispatchEvent(pointerEvent("pointerup", 120, 240));
    expect(notches).toEqual([1, 2, 3]);
    expect(nudges).toEqual([[120, 240, 3]]);
  });

  it("keeps the charge when the finger drifts off the surface", () => {
    const { el, nudges, chargeEnd, capture } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", 100, 200));
    pump(700);
    expect(capture).toHaveBeenCalledWith(1);

    // Without pointer capture this used to cancel the charge outright, which on
    // a phone meant a thumb sliding past the edge killed the nudge.
    el.dispatchEvent(pointerEvent("pointerleave", 100, 700));
    expect(chargeEnd).not.toHaveBeenCalled();

    el.dispatchEvent(pointerEvent("pointerup", 100, 700));
    expect(nudges).toHaveLength(1);
    expect(nudges[0][2]).toBeGreaterThan(2);
  });

  it("does not let a second finger restart the charge", () => {
    const { el, nudges } = setup();
    el.dispatchEvent(pointerEvent("pointerdown", 100, 200, 1));
    pump(700); // power ~2.2

    el.dispatchEvent(pointerEvent("pointerdown", 300, 400, 2)); // ignored
    pump(400);
    el.dispatchEvent(pointerEvent("pointerup", 300, 400, 2)); // ignored
    expect(nudges).toHaveLength(0);

    el.dispatchEvent(pointerEvent("pointerup", 100, 200, 1));
    expect(nudges).toHaveLength(1);
    // Carried the full 1100ms of charge rather than being reset by the thumb.
    expect(nudges[0][2]).toBe(3);
  });

  it("swipes down to dive and up to tilt-lock, without also nudging", () => {
    const diveRun = setup();
    diveRun.el.dispatchEvent(pointerEvent("pointerdown", 100, 200));
    diveRun.el.dispatchEvent(pointerEvent("pointermove", 100, 300));
    diveRun.el.dispatchEvent(pointerEvent("pointerup", 100, 300));
    expect(diveRun.dive).toHaveBeenCalledTimes(1);
    expect(diveRun.nudges).toHaveLength(0);

    const tiltRun = setup();
    tiltRun.el.dispatchEvent(pointerEvent("pointerdown", 100, 300));
    tiltRun.el.dispatchEvent(pointerEvent("pointermove", 100, 200));
    tiltRun.el.dispatchEvent(pointerEvent("pointerup", 100, 200));
    expect(tiltRun.tiltLock).toHaveBeenCalledTimes(1);
    expect(tiltRun.nudges).toHaveLength(0);
  });

  it("deploys on a double-tap only when something is banked", () => {
    const armed = setup({ hasMunition: () => true });
    armed.el.dispatchEvent(pointerEvent("pointerdown", 50, 50));
    armed.el.dispatchEvent(pointerEvent("pointerup", 50, 50));
    pump(100);
    armed.el.dispatchEvent(pointerEvent("pointerdown", 50, 50));
    armed.el.dispatchEvent(pointerEvent("pointerup", 50, 50));
    expect(armed.deploy).toHaveBeenCalledTimes(1);

    // With nothing banked the second tap is a second nudge, never a dead tap.
    const empty = setup({ hasMunition: () => false });
    empty.el.dispatchEvent(pointerEvent("pointerdown", 50, 50));
    empty.el.dispatchEvent(pointerEvent("pointerup", 50, 50));
    pump(100);
    empty.el.dispatchEvent(pointerEvent("pointerdown", 50, 50));
    empty.el.dispatchEvent(pointerEvent("pointerup", 50, 50));
    expect(empty.deploy).not.toHaveBeenCalled();
    expect(empty.nudges).toHaveLength(2);
  });
});

describe("kamikaze gestures: keyboard charge", () => {
  it("charges and releases a nudge with no pointer to aim by", () => {
    const { nudges } = setup();
    window.dispatchEvent(spaceEvent("keydown"));
    pump(1200);
    window.dispatchEvent(spaceEvent("keyup"));
    // null coordinates: the mount resolves a fallback direction, because a
    // keyboard player previously had no nudge verb at all in this mode.
    expect(nudges).toEqual([[null, null, 3]]);
  });

  it("treats a Space tap as a plain nudge", () => {
    const { nudges } = setup();
    window.dispatchEvent(spaceEvent("keydown"));
    pump(40);
    window.dispatchEvent(spaceEvent("keyup"));
    expect(nudges).toEqual([[null, null, 1]]);
  });

  it("leaves Space alone when the mode owns it", () => {
    const { nudges } = setup({ canKeyboardCharge: () => false });
    window.dispatchEvent(spaceEvent("keydown"));
    pump(1200);
    window.dispatchEvent(spaceEvent("keyup"));
    expect(nudges).toHaveLength(0);
  });

  it("ignores the charge while input is gated off", () => {
    const { nudges } = setup({ shouldHandle: () => false });
    window.dispatchEvent(spaceEvent("keydown"));
    pump(1200);
    window.dispatchEvent(spaceEvent("keyup"));
    expect(nudges).toHaveLength(0);
  });
});

describe("kamikaze gestures: teardown", () => {
  it("stops listening once detached", () => {
    const { el, nudges, detach } = setup();
    detach();
    el.dispatchEvent(pointerEvent("pointerdown", 100, 200));
    el.dispatchEvent(pointerEvent("pointerup", 100, 200));
    window.dispatchEvent(spaceEvent("keydown"));
    window.dispatchEvent(spaceEvent("keyup"));
    expect(nudges).toHaveLength(0);
  });
});
