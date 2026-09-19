import { describe, it, expect, beforeEach } from "vitest";
import {
  CHAPTER_MEMORY_KEY, chapterObjective, chapterReducer, createChapter,
  loadLearnedBlessing, saveLearnedBlessing,
  type ChapterState,
} from "@/model/shrine-chapter";

const reduce = (s: ChapterState, ...events: Parameters<typeof chapterReducer>[1][]) =>
  events.reduce(chapterReducer, s);

const learn = (s: ChapterState) =>
  reduce(s, { type: "shrine" }, { type: "answer", element: "water" }, { type: "answer", element: "wind" });

describe("shrine chapter reducer", () => {
  it("does not win on a premature gate event and opens the lesson at the shrine", () => {
    const s = createChapter();
    expect(chapterReducer(s, { type: "gate" }).phase).toBe("playing");
    expect(chapterReducer(s, { type: "gate" }).seals).toEqual([]);
    const atShrine = chapterReducer(s, { type: "shrine" });
    expect(atShrine.phase).toBe("lesson");
    expect(atShrine.learned).toBe(false);
  });

  it("ignores answers outside the lesson and grants the blessing on water then wind", () => {
    const s = createChapter();
    expect(chapterReducer(s, { type: "answer", element: "water" })).toBe(s);
    const blessed = learn(s);
    expect(blessed.phase).toBe("blessing");
    expect(blessed.learned).toBe(true);
    expect(blessed.mana).toBe(3);
    const resumed = chapterReducer(blessed, { type: "continue" });
    expect(resumed.phase).toBe("playing");
  });

  it("makes the first wrong answer safe, the second costly, and keeps the warning across re-entry", () => {
    const s = createChapter();
    const lesson = chapterReducer(s, { type: "shrine" });
    const firstWrong = chapterReducer(lesson, { type: "answer", element: "fire" });
    expect(firstWrong.integrity).toBe(3);
    expect(firstWrong.lessonStep).toBe(0);
    const secondWrong = chapterReducer(firstWrong, { type: "answer", element: "fire" });
    expect(secondWrong.integrity).toBe(2);
    const left = chapterReducer(secondWrong, { type: "leave-lesson" });
    expect(left.phase).toBe("playing");
    const reentered = chapterReducer(left, { type: "shrine" });
    const thirdWrong = chapterReducer(reentered, { type: "answer", element: "wind" });
    expect(thirdWrong.integrity).toBe(1);
  });

  it("gates arming on the blessing, dedupes a seal, and opens the torii only after both", () => {
    const s = createChapter();
    expect(chapterReducer(s, { type: "arm-water" }).waterArmed).toBe(false);
    let b = learn(s);
    b = chapterReducer(b, { type: "continue" });
    const armed = chapterReducer(b, { type: "arm-water" });
    expect(armed.mana).toBe(2);
    expect(armed.waterArmed).toBe(true);
    expect(chapterReducer(armed, { type: "arm-water" }).mana).toBe(2);
    const west = chapterReducer(armed, { type: "seal", id: "west" });
    expect(west.seals).toEqual(["west"]);
    expect(west.waterArmed).toBe(false);
    const dup = chapterReducer(west, { type: "seal", id: "west" });
    expect(dup).toBe(west);
    const armedAgain = chapterReducer(west, { type: "arm-water" });
    const both = chapterReducer(armedAgain, { type: "seal", id: "east" });
    expect(both.phase).toBe("gate-opening");
    expect(chapterReducer(both, { type: "gate" }).phase).toBe("gate-opening");
    const through = reduce(both, { type: "continue" }, { type: "gate" });
    expect(through.phase).toBe("won");
  });

  it("damages on unarmed seals and drains, and goes terminal at zero integrity", () => {
    let s = learn(createChapter());
    s = chapterReducer(s, { type: "continue" });
    const hit = chapterReducer(s, { type: "seal", id: "west" });
    expect(hit.integrity).toBe(2);
    expect(hit.notice).toContain("Arm Water");
    expect(hit.seals).toEqual([]);
    const armed = chapterReducer(hit, { type: "arm-water" });
    const drained = chapterReducer(armed, { type: "drain" });
    expect(drained.integrity).toBe(1);
    expect(drained.waterArmed).toBe(false);
    const dead = chapterReducer(drained, { type: "drain" });
    expect(dead.phase).toBe("lost");
    expect(dead.integrity).toBe(0);
    expect(chapterReducer(dead, { type: "seal", id: "east" })).toBe(dead);
    expect(chapterReducer(dead, { type: "gate" })).toBe(dead);
  });

  it("records why integrity was last lost, so coaching can name the mistake", () => {
    // Unarmed seal contact is a burn…
    let s = learn(createChapter());
    s = chapterReducer(s, { type: "continue" });
    const burned = chapterReducer(s, { type: "seal", id: "west" });
    expect(burned.lastDamage).toBe("burn");
    // …a drain supersedes it…
    const drained = chapterReducer(chapterReducer(burned, { type: "arm-water" }), { type: "drain" });
    expect(drained.lastDamage).toBe("drain");
    // …and survival without loss clears the cause, so a stale cue cannot fire.
    const cleared = chapterReducer(drained, { type: "retry" });
    expect(cleared.lastDamage).toBeNull();
    expect(createChapter(true).lastDamage).toBeNull();
    // Non-damage events never invent a cause.
    expect(chapterReducer(drained, { type: "ball-search" }).lastDamage).toBe("drain");
  });

  it("refuses to arm with no mana, refills at the shrine, and retry keeps only the learning", () => {
    let s = learn(createChapter());
    s = chapterReducer(s, { type: "continue" });
    s = reduce(s, { type: "arm-water" }, { type: "seal", id: "west" },
      { type: "arm-water" }, { type: "seal", id: "east" });
    s = chapterReducer(s, { type: "continue" });
    s = chapterReducer(s, { type: "arm-water" });
    expect(s.mana).toBe(0);
    // Disarmed with an empty mana pool, the shrine must refuse and point back.
    const refused = chapterReducer({ ...s, waterArmed: false }, { type: "arm-water" });
    expect(refused.waterArmed).toBe(false);
    expect(refused.notice).toContain("shrine");
    const refilled = chapterReducer(s, { type: "shrine" });
    expect(refilled.mana).toBe(3);
    expect(refilled.phase).toBe("playing");
    const retried = chapterReducer(refilled, { type: "retry" });
    expect(retried.learned).toBe(true);
    expect(retried.integrity).toBe(3);
    expect(retried.mana).toBe(3);
    expect(retried.seals).toEqual([]);
    const unlearnedRetry = chapterReducer(createChapter(), { type: "retry" });
    expect(unlearnedRetry.learned).toBe(false);
    expect(unlearnedRetry.mana).toBe(0);
  });

  it("reports a ball search without changing resources and ignores searches outside play", () => {
    const playing = chapterReducer(createChapter(true), { type: "arm-water" });
    const recovered = chapterReducer(playing, { type: "ball-search" });
    expect(recovered).toEqual({ ...playing, notice: expect.stringContaining("No integrity or mana lost") });
    for (const phase of ["lesson", "blessing", "gate-opening", "won", "lost"] as const) {
      const blocked = { ...playing, phase };
      expect(chapterReducer(blocked, { type: "ball-search" })).toBe(blocked);
    }
  });

  it("reports a readable objective at every stage", () => {
    const s = createChapter();
    expect(chapterObjective(s)).toContain("1 / 3");
    let b = chapterReducer(learn(s), { type: "continue" });
    expect(chapterObjective(b)).toContain("2 / 3");
    b = reduce(b, { type: "arm-water" }, { type: "seal", id: "west" }, { type: "arm-water" }, { type: "seal", id: "east" });
    expect(chapterObjective(b)).toContain("3 / 3");
    expect(chapterObjective(reduce(b, { type: "continue" }, { type: "gate" }))).toContain("complete");
  });
});

describe("blessing persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips only the learned flag", () => {
    expect(loadLearnedBlessing()).toBe(false);
    saveLearnedBlessing(true);
    expect(loadLearnedBlessing()).toBe(true);
    const raw = window.localStorage.getItem("ps_data") || "{}";
    const parsed = JSON.parse(raw);
    expect(parsed[CHAPTER_MEMORY_KEY]).toBe("true");
    expect(Object.keys(parsed).filter(k => k.includes("seal") || k.includes("mana"))).toEqual([]);
  });

  it("treats invalid or denied storage as unlearned without throwing", () => {
    window.localStorage.setItem("ps_data", "{not json");
    expect(loadLearnedBlessing()).toBe(false);
    window.localStorage.setItem("ps_data", JSON.stringify({ [CHAPTER_MEMORY_KEY]: "yes" }));
    expect(loadLearnedBlessing()).toBe(false);
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("denied"); },
        clear: () => {},
      },
    });
    expect(loadLearnedBlessing()).toBe(false);
    expect(() => saveLearnedBlessing(true)).not.toThrow();
    if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
  });
});
