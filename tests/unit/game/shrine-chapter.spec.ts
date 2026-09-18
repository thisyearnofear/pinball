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
    act(() => { tableMock.captured.onSnapshot?.({ held: true, aim: "shrine", meter: 0.5, paused: false, ...s }); });

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
    expect(last.waterArmed).toBe(true);
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
    const lastArmStates = tableMock.calls.setState.mock.calls.map(c => c[0]).filter(s => s.waterArmed);
    expect(lastArmStates).toHaveLength(0);
  });

  it("survives corrupted storage on mount", () => {
    window.localStorage.setItem("ps_data", "{broken");
    act(() => root.unmount());
    root = createRoot(container);
    expect(() => act(() => { root.render(React.createElement(ShrineChapter)); })).not.toThrow();
    expect(container.textContent).toContain("1 / 3");
  });
});
