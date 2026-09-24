import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArcadeLobby } from "@/game/ui/ArcadeLobby";
import {
  CHAPTER_PROGRESS_KEY,
  chapterReducer,
  createChapter,
  loadChapterProgress,
  saveChapterProgress,
  type ChapterEvent,
} from "@/model/shrine-chapter";
import { setInStorage } from "@/utils/local-storage";

/**
 * THE SEAM: story events → saveChapterProgress → the ps_data blob →
 * loadChapterProgress → the real ArcadeLobby card.
 *
 * Each side has unit specs; none of them fails when only the *binding*
 * drifts — the key string, the blob shape, or the progress object the
 * lobby renders. This spec drives the real reducer, the real storage
 * helpers, and the real (unmocked) lobby in one chain, so a save the
 * lobby cannot read, or reads differently, is caught here.
 *
 * Honest boundary: GameScreen's glue (loadChapterProgress → the
 * storyProgress prop at view==="lobby") renders through dynamic(ssr:false)
 * and cannot mount headlessly; the Playwright harness
 * (tests/visual/game.spec.ts) covers that hop. See docs/TRAPS.md #6/#9.
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
    { type: "arm-water" },
    { type: "seal", id: "west" },
  ];
  let s = createChapter(false);
  for (const e of events) {
    s = chapterReducer(s, e);
    saveChapterProgress(s);
  }
  return s;
}

describe("seam: continue-the-story (reducer → storage → lobby)", () => {
  it("the reducer's run lands in the ps_data blob under the shared key", () => {
    playUntilOneSeal();
    const blob = JSON.parse(window.localStorage.getItem("ps_data") ?? "{}");
    expect(blob[CHAPTER_PROGRESS_KEY]).toBe(
      JSON.stringify({ learned: true, seals: ["west"], won: false }),
    );
  });

  it("what loadChapterProgress reads renders as Continue on the real lobby card", () => {
    playUntilOneSeal();
    const progress = loadChapterProgress();
    expect(progress).toEqual({ learned: true, seals: ["west"], won: false });
    const markup = lobbyHtml({ storyProgress: progress });
    expect(markup).toContain("Continue the Story");
    expect(markup).toContain("1 of 2 seals quenched");
  });

  it("a save shape the loader must reject never reaches the lobby as a Continue", () => {
    // Write directly through the same storage helper the save path uses,
    // so the corruption is inside the real blob shape.
    setInStorage(CHAPTER_PROGRESS_KEY, JSON.stringify({ learned: false, seals: ["west"] }));
    expect(loadChapterProgress()).toBeNull();
    const markup = lobbyHtml({ storyProgress: loadChapterProgress() });
    expect(markup).toContain("Play Story");
    expect(markup).not.toContain("Continue the Story");
  });

  it("a win clears the blob entry, so the next lobby reads a fresh start", () => {
    let s = playUntilOneSeal();
    for (const e of [
      { type: "arm-water" },
      { type: "seal", id: "east" },
      { type: "continue" },
      { type: "gate" },
    ] as ChapterEvent[]) {
      s = chapterReducer(s, e);
      saveChapterProgress(s);
    }
    expect(s.phase).toBe("won");
    expect(loadChapterProgress()).toBeNull();
    expect(lobbyHtml({ storyProgress: loadChapterProgress() })).not.toContain("Continue the Story");
  });

  it("unparseable storage degrades to the fresh pitch, not a crash", () => {
    window.localStorage.setItem("ps_data", "{not json");
    expect(loadChapterProgress()).toBeNull();
    expect(lobbyHtml({ storyProgress: loadChapterProgress() })).toContain("Play Story");
  });
});
