import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChapterEvent } from "@/model/shrine-chapter";
import type { ChapterTable, ChapterTableSnapshot } from "@/game/chapter/chapter-table";

const tableMock = vi.hoisted(() => {
  const calls = {
    setState: vi.fn(),
    setPaused: vi.fn(),
    aim: vi.fn(),
    release: vi.fn(),
    flip: vi.fn(),
    reset: vi.fn(),
    destroy: vi.fn(),
  };
  const captured: { onEvent?: (e: ChapterEvent) => void; onSnapshot?: (s: ChapterTableSnapshot) => void } = {};
  return { calls, captured };
});

vi.mock("@/game/chapter/chapter-table", () => ({
  createChapterTable: (_c: unknown, _s: unknown, onEvent: (e: ChapterEvent) => void, onSnapshot: (s: ChapterTableSnapshot) => void): ChapterTable => {
    tableMock.captured.onEvent = onEvent;
    tableMock.captured.onSnapshot = onSnapshot;
    return tableMock.calls as unknown as ChapterTable;
  },
}));

import ShrineChapter from "@/game/chapter/ShrineChapter";

const key = (k: string, opts: KeyboardEventInit = {}) =>
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ...opts })); });
const click = (el: Element | null | undefined) =>
  act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const text = (container: HTMLElement, match: string) => {
  const dlg = container.querySelector("[role='dialog']");
  const within = (scope: Element | HTMLElement) =>
    Array.from(scope.querySelectorAll("button, a")).find(el => el.textContent?.includes(match));
  return (dlg ? within(dlg) : undefined) ?? within(container);
};
// Lesson/overlay choices must be scoped to the open dialog: control labels
// elsewhere on the page (aim buttons, meter hint) share the same words.
const dialogBtn = (container: HTMLElement, match: string) =>
  Array.from(container.querySelectorAll("[role='dialog'] button")).find(el => el.textContent?.includes(match));
const pointer = (el: HTMLElement, type: string) =>
  act(() => { el.dispatchEvent(new Event(type, { bubbles: true })); });
const btn = (container: HTMLElement, match: string) =>
  Array.from(container.querySelectorAll("button")).find(el => el.textContent?.includes(match));

describe("ShrineChapter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(ShrineChapter)); });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  const emit = (e: ChapterEvent) => act(() => { tableMock.captured.onEvent?.(e); });
  const snap = (s: Partial<ChapterTableSnapshot>) =>
    act(() => { tableMock.captured.onSnapshot?.({ held: true, aim: "shrine", meter: 0.5, paused: false, aimReady: true, ...s }); });

  it("renders the chapter header, objective, and deliberate controls", () => {
    expect(container.textContent).toContain("The Water Shrine");
    expect(container.textContent).toContain("1 / 3");
    expect(container.textContent).toContain("Fire Seal I");
    expect(container.textContent).toContain("Arm Water");
    expect(tableMock.captured.onEvent).toBeTypeOf("function");
  });

  it("drives the lesson through real events and keeps keyboard input out of the dialog", () => {
    emit({ type: "shrine" });
    expect(container.textContent).toContain("Trial of Elements");
    key("w");
    expect(container.textContent).not.toContain("Water armed");
    click(dialogBtn(container, "Water"));
    click(dialogBtn(container, "Wind"));
    expect(container.textContent).toContain("Blessing of Water");
    click(dialogBtn(container, "Continue"));
    expect(container.textContent).toContain("2 / 3");
    key("w");
    expect(tableMock.calls.setState).toHaveBeenCalled();
    const last = tableMock.calls.setState.mock.calls.at(-1)?.[0];
    expect(last.armed).toBe(true);
  });

  it("aim buttons select targets and launch calls release", () => {
    click(btn(container, "Fire Seal II"));
    expect(tableMock.calls.aim).toHaveBeenCalledWith("east");
    snap({ held: true });
    click(btn(container, "Launch"));
    expect(tableMock.calls.release).toHaveBeenCalled();
  });

  it("Escape leaves the lesson without completing it", () => {
    emit({ type: "shrine" });
    key("Escape");
    expect(container.textContent).not.toContain("Trial of Elements");
    expect(container.textContent).toContain("1 / 3");
  });

  it("loses the ball on repeated drains, then retry keeps the blessing", () => {
    emit({ type: "shrine" });
    click(dialogBtn(container, "Water"));
    click(dialogBtn(container, "Wind"));
    click(dialogBtn(container, "Continue"));
    emit({ type: "drain" });
    emit({ type: "drain" });
    emit({ type: "drain" });
    expect(container.textContent).toContain("The Ball Shattered");
    click(dialogBtn(container, "Retry"));
    expect(container.textContent).toContain("2 / 3");
    expect(container.textContent).toContain("Water learned");
  });

  it("pointer cancel releases a held flipper", () => {
    const flip = btn(container, "HOLD · A") as HTMLElement;
    // jsdom has no PointerEvent constructor; React listens for the native
    // "pointerdown"/"pointercancel" types, which a plain Event carries fine.
    act(() => { flip.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(tableMock.calls.flip).toHaveBeenCalledWith("left", true);
    act(() => { flip.dispatchEvent(new Event("pointercancel", { bubbles: true })); });
    expect(tableMock.calls.flip).toHaveBeenCalledWith("left", false);
  });

  it("ignores gameplay keys while paused", () => {
    key("p");
    expect(tableMock.calls.setPaused).toHaveBeenCalledWith(true);
    key("w");
    key("2");
    expect(tableMock.calls.aim).not.toHaveBeenCalled();
    const lastArmStates = tableMock.calls.setState.mock.calls.map(c => c[0]).filter(s => s.armed);
    expect(lastArmStates).toHaveLength(0);
  });

  it("disables launch until a deliberate aim and again after a reset snapshot", () => {
    const launch = btn(container, "Choose a target") as HTMLButtonElement;
    expect(launch.disabled).toBe(true);
    click(launch);
    expect(tableMock.calls.release).not.toHaveBeenCalled();
    click(btn(container, "Water Shrine"));
    snap({ aimReady: true });
    expect((btn(container, "Launch") as HTMLButtonElement).disabled).toBe(false);
    snap({ aimReady: false });
    expect((btn(container, "Choose a target") as HTMLButtonElement).disabled).toBe(true);
  });

  it("updates physics synchronously without replaying effects in StrictMode", () => {
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(ShrineChapter))));
    tableMock.calls.setState.mockClear();
    act(() => {
      tableMock.captured.onEvent?.({ type: "shrine" });
      expect(tableMock.calls.setState).toHaveBeenCalledTimes(1);
      expect(tableMock.calls.setState.mock.calls[0][0].phase).toBe("lesson");
      tableMock.captured.onEvent?.({ type: "arm" });
      expect(tableMock.calls.setState).toHaveBeenCalledTimes(1);
    });
    click(dialogBtn(container, "Water"));
    click(dialogBtn(container, "Wind"));
    expect(tableMock.calls.setState.mock.calls.filter(([s]) => s.phase === "blessing")).toHaveLength(1);
  });

  it("supports keyboard arming from a focused button and P to resume", () => {
    emit({ type: "shrine" });
    click(dialogBtn(container, "Water"));
    click(dialogBtn(container, "Wind"));
    click(dialogBtn(container, "Continue"));
    const aim = btn(container, "Fire Seal I") as HTMLButtonElement;
    aim.focus();
    act(() => aim.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true })));
    expect(tableMock.calls.setState.mock.calls.at(-1)?.[0].armed).toBe(true);
    key("p");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Paused");
    key("p");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(tableMock.calls.setPaused).toHaveBeenLastCalledWith(false);
    click(aim);
    expect(document.activeElement).toBe(container.querySelector("canvas"));
    act(() => container.querySelector("canvas")?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(tableMock.calls.release).toHaveBeenCalled();
  });

  it("shows safe practice feedback, then the used allowance and health cost inside the lesson", () => {
    emit({ type: "shrine" });
    click(dialogBtn(container, "Fire"));
    expect(container.querySelector('[role="dialog"] [role="status"]')?.textContent).toContain("safe practice mistake");
    key("Escape");
    emit({ type: "shrine" });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Practice attempt used");
    click(dialogBtn(container, "Fire"));
    expect(container.querySelector('[role="dialog"] [role="status"]')?.textContent).toContain("Integrity -1");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Integrity: 2 / 3");
    expect(container.querySelector('[aria-label="Pinball table"]')?.parentElement?.hasAttribute("inert")).toBe(true);
  });

  it("survives corrupted storage on mount", () => {
    window.localStorage.setItem("ps_data", "{broken");
    act(() => root.unmount());
    root = createRoot(container);
    expect(() => act(() => { root.render(React.createElement(ShrineChapter)); })).not.toThrow();
    expect(container.textContent).toContain("1 / 3");
  });
});

describe("ShrineChapter embedded (trial inside Story mode)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let results: string[];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    vi.clearAllMocks();
    results = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ShrineChapter, {
        embedded: true,
        onResult: (o) => { results.push(o); },
      }));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  const emit = (e: ChapterEvent) => act(() => { tableMock.captured.onEvent?.(e); });
  const snap = (s: Partial<ChapterTableSnapshot>) =>
    act(() => { tableMock.captured.onSnapshot?.({ held: true, aim: "shrine", meter: 0.5, paused: false, aimReady: true, ...s }); });

  it("never reads or writes the saved blessing", () => {
    // Even with a stored blessing, the trial always starts unlearned.
    window.localStorage.setItem("ps_data", JSON.stringify({ chapter: { learned: true } }));
    const spy = vi.spyOn(Storage.prototype, "setItem");
    try {
      act(() => root.unmount());
      root = createRoot(container);
      act(() => {
        root.render(React.createElement(ShrineChapter, {
          embedded: true,
          onResult: (o) => { results.push(o); },
        }));
      });
      expect(container.textContent).not.toContain("Water remembered");
      // Complete the whole trial: no persistence writes may occur.
      emit({ type: "shrine" });
      click(dialogBtn(container, "Water"));
      click(dialogBtn(container, "Wind"));
      click(dialogBtn(container, "Continue"));
      click(btn(container, "Arm Water"));
      emit({ type: "seal", id: "west" });
      const writes = spy.mock.calls.filter(([k]) => String(k).includes("ps_data"));
      expect(writes).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("offers only the shrine and the practice seal as aims, with no campaign gate", () => {
    const aimTexts = Array.from(container.querySelectorAll("button")).map(b => b.textContent ?? "");
    expect(aimTexts.some(t => t.includes("Practice seal"))).toBe(true);
    expect(aimTexts.some(t => t.includes("Fire Seal II"))).toBe(false);
    expect(aimTexts.some(t => t.includes("Torii"))).toBe(false);
    expect(container.textContent).toContain("Trial attempts");
    expect(container.textContent).toContain("costs 1 main integrity");
  });

  it("emits mastered exactly once, only after the lesson AND the practice seal", () => {
    emit({ type: "shrine" });
    click(dialogBtn(container, "Water"));
    click(dialogBtn(container, "Wind"));
    // Learned but no seal yet: still blessing, nothing emitted.
    expect(results).toEqual([]);
    click(dialogBtn(container, "Continue"));
    // An unarmed seal would only burn the ball — arm first, then strike.
    click(btn(container, "Arm Water"));
    emit({ type: "seal", id: "west" });
    // The embedded reducer promotes to won once learned + west quenched and
    // emits exactly once — the confirm button cannot send a second result.
    expect(results).toEqual(["mastered"]);
    const carry = btn(container, "Carry Water back");
    expect(carry).toBeTruthy();
    click(carry);
    expect(results).toEqual(["mastered"]);
  });

  it("a local loss emits failed once and offers no free retry", () => {
    snap({ held: false });
    emit({ type: "drain" });
    emit({ type: "drain" });
    emit({ type: "drain" });
    // Losing the trial emits failed once; the confirm button is inert after.
    expect(results).toEqual(["failed"]);
    const back = btn(container, "Return to main table");
    expect(back).toBeTruthy();
    click(back);
    expect(results).toEqual(["failed"]);
    expect(btn(container, "Retry")).toBeFalsy();
  });

  it("leaving the trial emits abandoned and never grants Water", () => {
    emit({ type: "shrine" });
    const leave = dialogBtn(container, "Leave trial");
    expect(leave).toBeTruthy();
    click(leave);
    expect(results).toEqual(["abandoned"]);
    // Cancelling twice still sends one result and grants no Water.
    expect(container.textContent).not.toContain("Water learned");
  });

  it("external pause blocks gameplay keys and disables launch", () => {
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ShrineChapter, {
        embedded: true,
        paused: true,
        onResult: (o) => { results.push(o); },
      }));
    });
    key("w");
    expect(tableMock.calls.aim).not.toHaveBeenCalled();
    snap({ aimReady: true });
    const launch = btn(container, "Launch") as HTMLButtonElement | undefined;
    expect(launch?.disabled).toBe(true);
  });
});
