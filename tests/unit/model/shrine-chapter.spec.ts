import { describe, it, expect, beforeEach } from "vitest";
import {
  CHAPTERS,
} from "@/model/chapters";
import {
  SEALS_TOTAL, STORY_VAULT_KEY,
  blessingKnown, chapterObjective, chapterReducer, clearRun, createChapter,
  loadRun, loadStoryView, loadVault, markBlessingLearned, recordRun,
  resumeChapterState,
  type ChapterState,
} from "@/model/shrine-chapter";
import { createStoryState, storyReducer } from "@/model/story-run";
import { setInStorage } from "@/utils/local-storage";

const reduce = (s: ChapterState, ...events: Parameters<typeof chapterReducer>[1][]) =>
  events.reduce(chapterReducer, s);

// Each chapter's lesson expects a different element order; the helper picks
// the answers from the config so the reducer is proven against both chapters.
const learnWater = (s: ChapterState) =>
  reduce(s, { type: "shrine" }, { type: "answer", element: "water" }, { type: "answer", element: "wind" });
const learnWind = (s: ChapterState) =>
  reduce(s, { type: "shrine" }, { type: "answer", element: "wind" }, { type: "answer", element: "water" });
const learn = (s: ChapterState) =>
  CHAPTERS[s.chapterId].lessonExpected[0] === "water" ? learnWater(s) : learnWind(s);

describe("shrine chapter reducer (water-shrine)", () => {
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
    expect(chapterReducer(s, { type: "arm" }).armed).toBe(false);
    let b = learn(s);
    b = chapterReducer(b, { type: "continue" });
    const armed = chapterReducer(b, { type: "arm" });
    expect(armed.mana).toBe(2);
    expect(armed.armed).toBe(true);
    expect(chapterReducer(armed, { type: "arm" }).mana).toBe(2);
    const west = chapterReducer(armed, { type: "seal", id: "west" });
    expect(west.seals).toEqual(["west"]);
    expect(west.armed).toBe(false);
    const dup = chapterReducer(west, { type: "seal", id: "west" });
    expect(dup).toBe(west);
    const armedAgain = chapterReducer(west, { type: "arm" });
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
    const armed = chapterReducer(hit, { type: "arm" });
    const drained = chapterReducer(armed, { type: "drain" });
    expect(drained.integrity).toBe(1);
    expect(drained.armed).toBe(false);
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
    const drained = chapterReducer(chapterReducer(burned, { type: "arm" }), { type: "drain" });
    expect(drained.lastDamage).toBe("drain");
    // …and survival without loss clears the cause, so a stale cue cannot fire.
    const cleared = chapterReducer(drained, { type: "retry" });
    expect(cleared.lastDamage).toBeNull();
    expect(createChapter("water-shrine", true).lastDamage).toBeNull();
    // Non-damage events never invent a cause.
    expect(chapterReducer(drained, { type: "ball-search" }).lastDamage).toBe("drain");
  });

  it("refuses to arm with no mana, refills at the shrine, and retry keeps only the learning", () => {
    let s = learn(createChapter());
    s = chapterReducer(s, { type: "continue" });
    s = reduce(s, { type: "arm" }, { type: "seal", id: "west" },
      { type: "arm" }, { type: "seal", id: "east" });
    s = chapterReducer(s, { type: "continue" });
    s = chapterReducer(s, { type: "arm" });
    expect(s.mana).toBe(0);
    // Disarmed with an empty mana pool, the shrine must refuse and point back.
    const refused = chapterReducer({ ...s, armed: false }, { type: "arm" });
    expect(refused.armed).toBe(false);
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
    const playing = chapterReducer(createChapter("water-shrine", true), { type: "arm" });
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
    b = reduce(b, { type: "arm" }, { type: "seal", id: "west" }, { type: "arm" }, { type: "seal", id: "east" });
    expect(chapterObjective(b)).toContain("3 / 3");
    expect(chapterObjective(reduce(b, { type: "continue" }, { type: "gate" }))).toContain("complete");
  });
});

describe("wind ridge reducer (same machine, chapter 2 config)", () => {
  it("starts on its own chapter identity, copy, and blessing", () => {
    const s = createChapter("wind-ridge");
    expect(s.chapterId).toBe("wind-ridge");
    expect(s.notice).toContain("wind shrine");
    expect(chapterObjective(s)).toBe("1 / 3 · Enter the wind shrine and learn its blessing");
    expect(chapterReducer(s, { type: "arm" }).notice).toContain("wind blessing");
  });

  it("expects wind then water in the lesson, and the reverse order fails safe-then-costly", () => {
    const lesson = chapterReducer(createChapter("wind-ridge"), { type: "shrine" });
    expect(chapterReducer(lesson, { type: "answer", element: "water" }).integrity).toBe(3);
    const second = chapterReducer(lesson, { type: "answer", element: "wind" });
    expect(second.lessonStep).toBe(1);
    expect(second.notice).toContain("wind answers the chime");
    const done = chapterReducer(second, { type: "answer", element: "water" });
    expect(done.phase).toBe("blessing");
    expect(done.learned).toBe(true);
  });

  it("runs the full campaign with chime vocabulary", () => {
    let s = learnWind(createChapter("wind-ridge"));
    s = chapterReducer(s, { type: "continue" });
    s = reduce(s, { type: "arm" }, { type: "seal", id: "west" });
    expect(s.notice).toContain("One chime rung");
    s = reduce(s, { type: "arm" }, { type: "seal", id: "east" });
    expect(s.phase).toBe("gate-opening");
    expect(chapterObjective(s)).toBe("3 / 3 · Cross the open pass");
    s = reduce(s, { type: "continue" }, { type: "gate" });
    expect(s.phase).toBe("won");
    expect(s.notice).toContain("pass");
  });

  it("an unarmed chime hit uses the chapter's own burn copy", () => {
    let s = learnWind(createChapter("wind-ridge"));
    s = chapterReducer(s, { type: "continue" });
    const hit = chapterReducer(s, { type: "seal", id: "west" });
    expect(hit.integrity).toBe(2);
    expect(hit.notice).toContain("Arm Wind");
  });
});

describe("story vault persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips blessings through the vault inside the ps_data blob", () => {
    expect(blessingKnown("water-shrine")).toBe(false);
    markBlessingLearned("water-shrine");
    expect(blessingKnown("water-shrine")).toBe(true);
    expect(blessingKnown("wind-ridge")).toBe(false);
    const parsed = JSON.parse(window.localStorage.getItem("ps_data") || "{}");
    const vault = JSON.parse(parsed[STORY_VAULT_KEY]);
    expect(vault).toEqual({ version: 1, blessings: ["water-shrine"], completed: [], current: null });
  });

  it("treats invalid or denied storage as an empty vault without throwing", () => {
    window.localStorage.setItem("ps_data", "{not json");
    expect(loadVault().blessings).toEqual([]);
    window.localStorage.setItem("ps_data", JSON.stringify({ [STORY_VAULT_KEY]: "yes" }));
    expect(loadVault().blessings).toEqual([]);
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("denied"); },
        clear: () => {},
      },
    });
    expect(blessingKnown("water-shrine")).toBe(false);
    expect(() => markBlessingLearned("water-shrine")).not.toThrow();
    if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
  });

  it("recordRun keeps mid-run progress: learned flag and quenched seals", () => {
    expect(loadRun("water-shrine")).toBeNull();
    let s = learn(createChapter());
    s = chapterReducer(s, { type: "continue" });
    recordRun(s);
    expect(loadRun("water-shrine")).toEqual({ learned: true, seals: [] });
    const armed = chapterReducer(s, { type: "arm" });
    const quenched = chapterReducer(armed, { type: "seal", id: "west" });
    recordRun(quenched);
    expect(loadRun("water-shrine")).toEqual({ learned: true, seals: ["west"] });
    expect(loadRun("wind-ridge")).toBeNull();
  });

  it("a win completes the chapter, keeps the blessing, and clears the run", () => {
    let s = learn(createChapter());
    s = chapterReducer(s, { type: "continue" });
    s = reduce(s, { type: "arm" }, { type: "seal", id: "west" }, { type: "arm" }, { type: "seal", id: "east" });
    recordRun(s);
    expect(loadRun("water-shrine")!.seals).toEqual(["west", "east"]);
    const won = reduce(s, { type: "continue" }, { type: "gate" });
    expect(won.phase).toBe("won");
    recordRun(won);
    expect(loadRun("water-shrine")).toBeNull();
    expect(loadVault().completed).toEqual(["water-shrine"]);
    expect(loadVault().blessings).toContain("water-shrine");
  });

  it("a shattered ball keeps only knowledge — what a retry would honour", () => {
    const shattered = reduce(learn(createChapter()), { type: "continue" },
      { type: "drain" }, { type: "drain" }, { type: "drain" });
    expect(shattered.phase).toBe("lost");
    recordRun(shattered);
    expect(loadRun("water-shrine")).toEqual({ learned: true, seals: [] });
  });

  it("sequencing: after a win the story view offers the next chapter", () => {
    recordRun(reduce(
      (() => { const s = chapterReducer(learn(createChapter()), { type: "continue" }); return reduce(s,
        { type: "arm" }, { type: "seal", id: "west" }, { type: "arm" }, { type: "seal", id: "east" }); })(),
      { type: "continue" }, { type: "gate" },
    ));
    const view = loadStoryView();
    expect(view.chapter.id).toBe("wind-ridge");
    expect(view.completed).toEqual(["water-shrine"]);
    expect(view.run).toBeNull();
    // A fresh story run opens on chapter 2.
    expect(createStoryState().chapterId).toBe("wind-ridge");
  });

  it("clearRun drops the durable run but keeps blessings and wins", () => {
    let s = chapterReducer(learn(createChapter()), { type: "continue" });
    s = chapterReducer(chapterReducer(s, { type: "arm" }), { type: "seal", id: "west" });
    recordRun(s);
    clearRun("water-shrine");
    expect(loadRun("water-shrine")).toBeNull();
    expect(blessingKnown("water-shrine")).toBe(true);
  });

  it("reads corrupt, impossible, or foreign vault data as nothing usable", () => {
    const seed = (v: unknown) =>
      window.localStorage.setItem("ps_data", JSON.stringify({ [STORY_VAULT_KEY]: JSON.stringify(v) }));
    // Unknown chapter ids are junk; seals without a blessing are corrupt.
    seed({ version: 1, blessings: ["nowhere"], completed: ["nowhere"], current: { chapterId: "nowhere", learned: true, seals: ["west"] } });
    expect(loadVault()).toEqual({ version: 1, blessings: [], completed: [], current: null });
    seed({ version: 1, blessings: [], completed: [], current: { chapterId: "water-shrine", learned: false, seals: ["west"] } });
    expect(loadVault().current).toBeNull();
    // completed ⊄ blessings is cleaned by dropping the impossible completion.
    seed({ version: 1, blessings: [], completed: ["water-shrine"], current: null });
    expect(loadVault().completed).toEqual([]);
    // A current run implies its blessing even if the list forgot.
    seed({ version: 1, blessings: [], completed: [], current: { chapterId: "water-shrine", learned: true, seals: ["west"] } });
    expect(loadVault().blessings).toEqual(["water-shrine"]);
    // A current run for an already-completed chapter is junk.
    seed({ version: 1, blessings: ["water-shrine"], completed: ["water-shrine"], current: { chapterId: "water-shrine", learned: true, seals: ["west"] } });
    expect(loadVault().current).toBeNull();
    expect(loadStoryView().chapter.id).toBe("wind-ridge");
  });

  it("migrates the legacy single-chapter keys once, preserving the rejection rules", () => {
    // A mid-run water-shrine save from the pre-vault build.
    setInStorage("pinball_water_shrine_progress_v1", JSON.stringify({ learned: true, seals: ["west"], won: false }));
    const v = loadVault();
    expect(v.current).toEqual({ chapterId: "water-shrine", learned: true, seals: ["west"] });
    expect(v.blessings).toEqual(["water-shrine"]);
    // The migration persisted the vault, and later reads use it.
    expect(JSON.parse(JSON.parse(window.localStorage.getItem("ps_data")!)[STORY_VAULT_KEY]).version).toBe(1);
    expect(loadRun("water-shrine")).toEqual({ learned: true, seals: ["west"] });
  });

  it("legacy wins and corrupt legacy blobs migrate to nothing", () => {
    setInStorage("pinball_water_shrine_progress_v1", JSON.stringify({ learned: true, seals: [], won: true }));
    expect(loadVault().current).toBeNull();
    window.localStorage.clear();
    setInStorage("pinball_water_shrine_progress_v1", "{not json");
    setInStorage("pinball_water_shrine_blessing_v1", "true");
    const v = loadVault();
    expect(v.current).toBeNull();
    expect(v.blessings).toEqual(["water-shrine"]);
  });

  it("resume grants mana for the remaining seals and never soft-locks", () => {
    expect(resumeChapterState("water-shrine", null).mana).toBe(0);
    expect(resumeChapterState("water-shrine", null).learned).toBe(false);
    const resumedNoSeals = resumeChapterState("water-shrine", { learned: true, seals: [] });
    expect(resumedNoSeals.mana).toBe(3);
    expect(resumedNoSeals.seals).toEqual([]);
    const resumedOne = resumeChapterState("water-shrine", { learned: true, seals: ["west"] });
    expect(resumedOne.mana).toBe(2);
    expect(resumedOne.seals).toEqual(["west"]);
    expect(resumedOne.notice).toContain("resumes");
    // One seal left → at least one arm's worth of mana, even at the clamp.
    const clamped = resumeChapterState("water-shrine", { learned: true, seals: ["west", "west"] });
    expect(clamped.mana).toBeGreaterThanOrEqual(1);
    expect(SEALS_TOTAL).toBe(2);
  });

  it("retry restores the same durable progress the lobby's Continue would", () => {
    recordRun({ ...createChapter("water-shrine", true), seals: ["east"] });
    const retried = storyReducer(
      { ...createStoryState({ learned: true }), phase: "lost" as const, integrity: 0 },
      { type: "retry" },
    );
    expect(retried.seals).toEqual(["east"]);
    expect(retried.integrity).toBe(3);
    expect(retried.mana).toBe(2);
    expect(retried.phase).toBe("playing");
  });
});
