import { describe, expect, it } from "vitest";
import { createStoryState, storyReducer, type StoryState } from "@/model/story-run";

describe("storyReducer", () => {
  it("unlearned shrine contact opens a lesson with a fresh encounter id", () => {
    const s = createStoryState({ learned: false });
    const next = storyReducer(s, { type: "shrine" });
    expect(next.phase).toBe("lesson");
    expect(next.encounterId).toBe(1);
    expect(next.learned).toBe(false);
  });

  it("learned shrine contact reopens the lesson as a refill/practice visit", () => {
    const s = storyReducer(createStoryState({ learned: true }), { type: "shrine" });
    expect(s.phase).toBe("lesson");
    expect(s.encounterId).toBe(1);
  });

  it("ignores main-table events while a lesson is active", () => {
    const lesson = storyReducer(createStoryState({ learned: false }), { type: "shrine" });
    for (const e of [
      { type: "seal", id: "west" },
      { type: "seal", id: "east" },
      { type: "gate" },
      { type: "continue" },
      { type: "arm" },
      { type: "drain" },
    ] as const) {
      expect(storyReducer(lesson, e)).toBe(lesson);
    }
  });

  it("mastered trial result learns Water, grants mana, and waits in blessing", () => {
    const lesson = storyReducer(createStoryState({ learned: false }), { type: "shrine" });
    const next = storyReducer(lesson, {
      type: "trial-result",
      encounterId: lesson.encounterId,
      outcome: "mastered",
    });
    expect(next.phase).toBe("blessing");
    expect(next.learned).toBe(true);
    expect(next.mana).toBe(3);
  });

  it("rejects stale, wrong-id, and duplicate trial results", () => {
    const lesson = storyReducer(createStoryState({ learned: false }), { type: "shrine" });
    expect(storyReducer(lesson, { type: "trial-result", encounterId: 0, outcome: "mastered" })).toBe(lesson);
    const blessed = storyReducer(lesson, { type: "trial-result", encounterId: lesson.encounterId, outcome: "mastered" });
    expect(storyReducer(blessed, { type: "trial-result", encounterId: lesson.encounterId, outcome: "failed" })).toBe(blessed);
    // Results against a non-lesson phase never apply.
    const playing = createStoryState({ learned: false });
    expect(storyReducer(playing, { type: "trial-result", encounterId: 1, outcome: "mastered" })).toBe(playing);
  });

  it("a failed trial costs one integrity without touching mana or seals", () => {
    const lesson = storyReducer(
      { ...createStoryState({ learned: true }), seals: ["west"], mana: 1 } as StoryState,
      { type: "shrine" },
    );
    const failed = storyReducer(lesson, { type: "trial-result", encounterId: lesson.encounterId, outcome: "failed" });
    expect(failed.phase).toBe("playing");
    expect(failed.integrity).toBe(2);
    expect(failed.mana).toBe(1);
    expect(failed.seals).toEqual(["west"]);
  });

  it("a failed trial's notice coaches the water/wind order", () => {
    const lesson = storyReducer(createStoryState({ learned: false }), { type: "shrine" });
    const failed = storyReducer(lesson, { type: "trial-result", encounterId: lesson.encounterId, outcome: "failed" });
    expect(failed.notice).toMatch(/Integrity -1/);
    expect(failed.notice).toMatch(/Water first, then wind/);
  });

  it("a failed trial at one integrity loses the run", () => {
    const lesson = storyReducer({ ...createStoryState({ learned: false }), integrity: 1 }, { type: "shrine" });
    const failed = storyReducer(lesson, { type: "trial-result", encounterId: lesson.encounterId, outcome: "failed" });
    expect(failed.phase).toBe("lost");
    expect(failed.integrity).toBe(0);
    expect(failed.learned).toBe(false);
  });

  it("an abandoned trial costs nothing and never grants Water", () => {
    const lesson = storyReducer(createStoryState({ learned: false }), { type: "shrine" });
    const back = storyReducer(lesson, { type: "trial-result", encounterId: lesson.encounterId, outcome: "abandoned" });
    expect(back.phase).toBe("playing");
    expect(back.integrity).toBe(3);
    expect(back.learned).toBe(false);
  });

  it("refill restores mana only from an active lesson and only when learned", () => {
    const unlearnedLesson = storyReducer(createStoryState({ learned: false }), { type: "shrine" });
    expect(storyReducer(unlearnedLesson, { type: "refill", encounterId: 1 })).toBe(unlearnedLesson);
    const learnedLesson = storyReducer({ ...createStoryState({ learned: true }), mana: 0 }, { type: "shrine" });
    const refilled = storyReducer(learnedLesson, { type: "refill", encounterId: learnedLesson.encounterId });
    expect(refilled.phase).toBe("playing");
    expect(refilled.mana).toBe(3);
  });

  it("retry keeps learned Water but resets seals, integrity, and invalidates the old encounter", () => {
    const s: StoryState = { ...createStoryState({ learned: true }), seals: ["west", "east"], integrity: 1, encounterId: 5, phase: "lost" };
    const retried = storyReducer(s, { type: "retry" });
    expect(retried.learned).toBe(true);
    expect(retried.seals).toEqual([]);
    expect(retried.integrity).toBe(3);
    expect(retried.phase).toBe("playing");
    expect(retried.encounterId).toBe(6);
    // The pre-retry encounter id no longer validates anything.
    const lesson = storyReducer(retried, { type: "shrine" });
    expect(storyReducer(lesson, { type: "trial-result", encounterId: 5, outcome: "mastered" })).toBe(lesson);
  });

  it("an early gate crossing cannot win", () => {
    const s = storyReducer(createStoryState({ learned: false }), { type: "gate" });
    expect(s.phase).toBe("playing");
    expect(s.notice).toContain("sealed");
  });

  it("two distinct armed seals open the gate, continue releases, gate wins", () => {
    let s = storyReducer(createStoryState({ learned: true }), { type: "arm" });
    expect(s.armed).toBe(true);
    s = storyReducer(s, { type: "seal", id: "west" });
    expect(s.armed).toBe(false);
    s = storyReducer(s, { type: "arm" });
    s = storyReducer(s, { type: "seal", id: "east" });
    expect(s.phase).toBe("gate-opening");
    s = storyReducer(s, { type: "continue" });
    expect(s.phase).toBe("playing");
    s = storyReducer(s, { type: "gate" });
    expect(s.phase).toBe("won");
  });

  it("unarmed seal contact costs integrity, not mana", () => {
    const s = storyReducer({ ...createStoryState({ learned: true }), mana: 3 }, { type: "seal", id: "west" });
    expect(s.integrity).toBe(2);
    expect(s.mana).toBe(3);
    expect(s.seals).toEqual([]);
  });

  it("drain costs integrity; ball-search is free", () => {
    const drained = storyReducer(createStoryState({ learned: false }), { type: "drain" });
    expect(drained.integrity).toBe(2);
    const searched = storyReducer(createStoryState({ learned: false }), { type: "ball-search" });
    expect(searched.integrity).toBe(3);
    expect(searched.mana).toBe(0);
    expect(searched.notice).toContain("trapped");
  });

  it("terminal states ignore further events", () => {
    const won = storyReducer({ ...createStoryState({ learned: true }), phase: "won", seals: ["west", "east"], gateOpen: true }, { type: "drain" });
    expect(won.phase).toBe("won");
    const lost = storyReducer({ ...createStoryState({ learned: false }), phase: "lost", integrity: 0 }, { type: "shrine" });
    expect(lost.phase).toBe("lost");
  });
});
