import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArcadeLobby } from "@/game/ui/ArcadeLobby";
import {
  chapterReducer,
  createChapter,
  loadStoryView,
  recordRun,
  saveVault,
  type ChapterEvent,
} from "@/model/shrine-chapter";
import { setInStorage } from "@/utils/local-storage";

// Deliberately a literal, not the module's STORY_VAULT_KEY export: the
// seam's whole point is the storage contract, so a renamed key must fail
// this spec instead of quietly renaming on both sides.
const VAULT_KEY = "pinball_story_vault_v1";

/**
 * THE SEAM: story events → recordRun → the vault inside the ps_data blob →
 * loadStoryView → the real ArcadeLobby card.
 *
 * Each side has unit specs; none of them fails when only the *binding*
 * drifts — the key string, the blob shape, or the story view the lobby
 * renders. This spec drives the real reducer, the real storage helpers, and
 * the real (unmocked) lobby in one chain, so a save the lobby cannot read,
 * or reads differently, is caught here.
 *
 * Honest boundary: GameScreen's glue (loadStoryView → the storyProgress prop
 * at view==="lobby") renders through dynamic(ssr:false) and cannot mount
 * headlessly; the Playwright harness (tests/visual/game.spec.ts) covers that
 * hop. See docs/TRAPS.md #6/#9.
 *
 * jsdom ships no matchMedia; some lobby children query it on first render.
 */
beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

beforeEach(() => {
  window.localStorage.clear();
});

const noop = () => {};

function lobbyProps(over: Partial<React.ComponentProps<typeof ArcadeLobby>> = {}) {
  return {
    tournaments: [],
    activeTournamentId: null,
    entered: false,
    isConnected: false,
    gameMode: "kamikaze" as const,
    aiDifficulty: "medium" as const,
    controlScheme: "steer" as const,
    onSelectControlScheme: noop,
    onSelectGameMode: noop,
    onSelectDifficulty: noop,
    onSelectTournament: noop,
    onEnterTournament: noop,
    onStartTournament: noop,
    onPractice: noop,
    onStory: noop,
    onPlayDaily: noop,
    ...over,
  };
}

const lobbyHtml = (over: Partial<React.ComponentProps<typeof ArcadeLobby>> = {}) =>
  renderToStaticMarkup(React.createElement(ArcadeLobby, lobbyProps(over)));

/** A canonical mid-run: blessing learned, west seal quenched, saving after every accepted event. */
function playUntilOneSeal() {
  const events: ChapterEvent[] = [
    { type: "shrine" },
    { type: "answer", element: "water" },
    { type: "answer", element: "wind" },
    { type: "continue" },
    { type: "arm" },
    { type: "seal", id: "west" },
  ];
  let s = createChapter();
  for (const e of events) {
    s = chapterReducer(s, e);
    recordRun(s);
  }
  return s;
}

describe("seam: continue-the-story (reducer → vault → lobby)", () => {
  it("the reducer's run lands in the ps_data blob under the shared key", () => {
    playUntilOneSeal();
    const blob = JSON.parse(window.localStorage.getItem("ps_data") ?? "{}");
    const vault = JSON.parse(blob[VAULT_KEY]);
    expect(vault).toEqual({
      version: 1,
      blessings: ["water-shrine"],
      completed: [],
      current: { chapterId: "water-shrine", learned: true, seals: ["west"] },
    });
  });

  it("what loadStoryView reads renders as Continue on the real lobby card", () => {
    playUntilOneSeal();
    const view = loadStoryView();
    expect(view.run).toEqual({ learned: true, seals: ["west"] });
    const markup = lobbyHtml({ storyProgress: view });
    expect(markup).toContain("Continue the Story");
    expect(markup).toContain("1 of 2 seals quenched");
  });

  it("a save shape the loader must reject never reaches the lobby as a Continue", () => {
    // Write directly through the same storage helper the save path uses,
    // so the corruption is inside the real blob shape: a run whose player
    // never learned the blessing cannot have seals (TRAPS #7 — never loosen).
    setInStorage(VAULT_KEY, JSON.stringify({
      version: 1, blessings: [], completed: [],
      current: { chapterId: "water-shrine", learned: false, seals: ["west"] },
    }));
    expect(loadStoryView().run).toBeNull();
    const markup = lobbyHtml({ storyProgress: loadStoryView() });
    expect(markup).toContain("Play Story");
    expect(markup).not.toContain("Continue the Story");
  });

  it("a win advances the lobby card to the next chapter, not a Continue of the old one", () => {
    let s = playUntilOneSeal();
    for (const e of [
      { type: "arm" },
      { type: "seal", id: "east" },
      { type: "continue" },
      { type: "gate" },
    ] as ChapterEvent[]) {
      s = chapterReducer(s, e);
      recordRun(s);
    }
    expect(s.phase).toBe("won");
    const view = loadStoryView();
    expect(view.chapter.id).toBe("wind-ridge");
    const markup = lobbyHtml({ storyProgress: view });
    expect(markup).not.toContain("Continue the Story");
    expect(markup).toContain("The Wind Ridge");
    expect(markup).toContain("CHAPTER 2");
  });

  it("a mid-run chapter-2 save continues chapter 2 by name", () => {
    // Chapter 1 already won in the vault; drive chapter 2's reducer for real.
    saveVault({ version: 1, blessings: ["water-shrine"], completed: ["water-shrine"], current: null });
    let s = createChapter("wind-ridge");
    for (const e of [
      { type: "shrine" },
      { type: "answer", element: "wind" },
      { type: "answer", element: "water" },
      { type: "continue" },
      { type: "arm" },
      { type: "seal", id: "west" },
    ] as ChapterEvent[]) {
      s = chapterReducer(s, e);
      recordRun(s);
    }
    expect(s.seals).toEqual(["west"]);
    const markup = lobbyHtml({ storyProgress: loadStoryView() });
    expect(markup).toContain("Continue the Story");
    expect(markup).toContain("THE WIND RIDGE");
    expect(markup).toContain("1 of 2 chimes rung");
  });

  it("unparseable storage degrades to the fresh pitch, not a crash", () => {
    window.localStorage.setItem("ps_data", "{not json");
    expect(loadStoryView().run).toBeNull();
    expect(lobbyHtml({ storyProgress: loadStoryView() })).toContain("Play Story");
  });
});
