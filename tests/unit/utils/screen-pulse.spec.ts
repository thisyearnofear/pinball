import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScreenPulse } from "@/utils/screen-pulse";

type AnimationRecord = {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
};

let animations: AnimationRecord[] = [];

function installAnimate() {
  (Element.prototype as unknown as { animate: unknown }).animate = function (
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ) {
    const record: AnimationRecord = { keyframes, options, cancel: vi.fn() };
    animations.push(record);
    return record as unknown as Animation;
  };
}

function removeAnimate() {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
}

beforeEach(() => {
  animations = [];
});

afterEach(() => {
  removeAnimate();
  vi.unstubAllGlobals();
});

/** The peak opacity a pulse animates to, and its duration. */
function pulseOf(record: AnimationRecord) {
  const peak = record.keyframes.find((frame) => typeof frame.opacity === "number" && frame.opacity > 0);
  return { peak: peak?.opacity, duration: record.options.duration };
}

describe("screen pulse", () => {
  it("mounts a non-interactive overlay over the whole host", () => {
    installAnimate();
    const host = document.createElement("div");
    const pulse = createScreenPulse(host);
    expect(pulse).not.toBeNull();
    const overlay = host.firstElementChild as HTMLElement;
    expect(overlay).not.toBeNull();
    // Must never intercept a nudge, and must start invisible: the flash is the
    // animation, so a visible-at-rest overlay would sit over the table forever.
    expect(overlay.style.pointerEvents).toBe("none");
    expect(overlay.style.opacity).toBe("0");
    expect(overlay.style.position).toBe("absolute");
    expect(overlay.style.inset).toBe("0");
    // jsdom keeps neither a gradient nor its style attribute, so the rim itself
    // (clear centre, bright edge) is verified by eye, not by this suite.
  });

  it("draws a subtle, short flash for a verb", () => {
    installAnimate();
    const host = document.createElement("div");
    const pulse = createScreenPulse(host)!;
    pulse(1);
    expect(animations).toHaveLength(1);
    expect(pulseOf(animations[0])).toEqual({ peak: 0.2, duration: 130 });
  });

  it("draws a stronger, longer flash for a ceremony beat", () => {
    installAnimate();
    const host = document.createElement("div");
    const pulse = createScreenPulse(host)!;
    pulse(2);
    expect(pulseOf(animations[0])).toEqual({ peak: 0.5, duration: 260 });
  });

  it("cancels the flash in flight instead of stacking them", () => {
    installAnimate();
    const host = document.createElement("div");
    const pulse = createScreenPulse(host)!;
    pulse(1);
    pulse(2);
    expect(animations).toHaveLength(2);
    expect(animations[0].cancel).toHaveBeenCalledTimes(1);
    expect(animations[1].cancel).not.toHaveBeenCalled();
  });

  it("draws nothing when the player asked for reduced motion", () => {
    installAnimate();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query }));
    const host = document.createElement("div");
    const pulse = createScreenPulse(host)!;
    pulse(2);
    expect(animations).toHaveLength(0);
  });

  it("still pulses when reduced motion is not preferred", () => {
    installAnimate();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    const host = document.createElement("div");
    const pulse = createScreenPulse(host)!;
    pulse(1);
    expect(animations).toHaveLength(1);
  });

  it("returns null and leaves nothing behind without the Web Animations API", () => {
    removeAnimate();
    const host = document.createElement("div");
    expect(createScreenPulse(host)).toBeNull();
    // A permanent invisible overlay would be worse than no echo at all.
    expect(host.children).toHaveLength(0);
  });
});
