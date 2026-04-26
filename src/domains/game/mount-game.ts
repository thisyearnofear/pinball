import throttle from "lodash.throttle";
import { Canvas } from "zcanvas";
import type { Size } from "zcanvas";

import type { GameDef, GameMessages } from "@/definitions/game";
import { ActorTypes, FRAME_RATE, GameSounds } from "@/definitions/game";

import { init, scaleCanvas, setFlipperState, bumpTable, update, panViewport, setPaused } from "@/model/game";
import SpriteCache from "@/utils/sprite-cache";
import { createInputController } from "@/utils/input-controller";
import * as haptics from "@/utils/haptics";

export type MountGameOptions = {
  /**
   * Parent element where the canvas + optional touch controls are mounted.
   * Caller owns layout; this module only fills the container.
   */
  container: HTMLElement;
  /**
   * The mutable game state object used by the engine.
   * (The engine mutates score/multiplier/balls/etc.)
   */
  game: GameDef;
  /**
   * Enable touch zones for left/right flippers and swipe-to-bump.
   * Recommended for mobile.
   */
  touchscreen?: boolean;
  /**
   * Fired when the engine surfaces high-signal messages (e.g. MULTIBALL).
   */
  onMessage?: (message: GameMessages | null) => void;
};

export type MountedGame = {
  /** (Re)initializes the engine with a new GameDef reference. */
  start: (game: GameDef) => Promise<void>;
  /** Pause/unpause rendering + physics stepping. */
  setPaused: (paused: boolean) => void;
  /** Remove listeners and DOM nodes created by mountGame. */
  destroy: () => void;
};

/**
 * Framework-agnostic mount for the pinball game.
 *
 * Core Principles:
 * - ENHANCEMENT FIRST: reuses the existing engine (`src/model/game.ts`) unchanged.
 * - CLEAN: no Vue/React imports; DOM is the only integration surface.
 * - MODULAR: returns a small imperative API.
 */
export async function mountGame(opts: MountGameOptions): Promise<MountedGame> {
  const { container } = opts;

  // Root wrapper so we can cleanly destroy everything we create.
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: "#000",
    touchAction: "none",
  });

  const canvasContainer = document.createElement("div");
  Object.assign(canvasContainer.style, {
    width: "100%",
    height: "100%",
  });

  root.appendChild(canvasContainer);
  container.appendChild(root);

  const canvas = new Canvas({
    width: 600,
    height: 800,
    animate: true,
    fps: FRAME_RATE,
    autoSize: false,
    onUpdate: update,
    backgroundColor: "#000",
  });
  canvas.insertInPage(canvasContainer);

  // Preload bitmaps already cached by asset-preloader (if it ran).
  // Falls back to loading at runtime if missing.
  [SpriteCache.BALL, SpriteCache.FLIPPER_LEFT, SpriteCache.FLIPPER_RIGHT].forEach((entry) => {
    if (entry.bitmap) {
      canvas.loadResource(entry.resourceId, entry.bitmap);
    }
  });

  let gameRef: GameDef = opts.game;
  let tableSize: Size | null = null;
  let inited = false;
  let destroyed = false;
  let changeTimeout: number | null = null;

  const bumpHandler = throttle(() => {
    bumpTable(gameRef);
    haptics.bump();
  }, 150);

  const inputController = createInputController({
    onLeftFlip: (isDown: boolean) => {
      setFlipperState(ActorTypes.LEFT_FLIPPER, isDown);
      if (isDown) haptics.flip();
    },
    onRightFlip: (isDown: boolean) => {
      setFlipperState(ActorTypes.RIGHT_FLIPPER, isDown);
      if (isDown) haptics.flip();
    },
    onBump: () => bumpHandler(),
    onPan: (delta: number) => panViewport(delta),
    onTogglePause: () => {
      gameRef.paused = !gameRef.paused;
      setPaused(gameRef.paused);
    },
  });

  function resize() {
    if (!inited || !tableSize) return;
    const { clientWidth, clientHeight } = root;
    const canvasHeight = Math.min(tableSize.height, clientHeight);
    scaleCanvas(clientWidth, canvasHeight);
  }

  // Optional touch controls: two invisible halves for flippers.
  const touchLeft = document.createElement("div");
  const touchRight = document.createElement("div");
  if (opts.touchscreen) {
    const base: Partial<CSSStyleDeclaration> = {
      position: "absolute",
      top: "0",
      height: "100%",
      width: "50%",
      background: "transparent",
    };
    Object.assign(touchLeft.style, base, { left: "0" });
    Object.assign(touchRight.style, base, { left: "50%" });

    const bindTouch = (el: HTMLElement, isLeft: boolean) => {
      el.addEventListener("touchstart", (e) => {
        inputController.handleTouchStart(isLeft, e);
        e.preventDefault();
        e.stopPropagation();
      });
      const end = (e: TouchEvent) => {
        inputController.handleTouchEnd(isLeft, e);
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener("touchend", end);
      el.addEventListener("touchcancel", end);
    };

    bindTouch(touchLeft, true);
    bindTouch(touchRight, false);

    root.appendChild(touchLeft);
    root.appendChild(touchRight);
  }

  async function start(nextGame: GameDef) {
    if (destroyed) return;

    gameRef = nextGame;

    // Round end handler: the engine expects us to call readyCallback after timeout.
    const roundEndHandler = (readyCallback: () => void, timeout: number) => {
      if (changeTimeout !== null) return;
      changeTimeout = window.setTimeout(() => {
        readyCallback();
        changeTimeout = null;
      }, timeout);
    };

    const messageHandler = (message: GameMessages | null) => {
      opts.onMessage?.(message);
    };

    tableSize = await init(canvas, gameRef, roundEndHandler, messageHandler);
    inited = true;

    inputController.addListeners();
    window.addEventListener("resize", resize);
    resize();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    if (changeTimeout !== null) {
      window.clearTimeout(changeTimeout);
      changeTimeout = null;
    }

    window.removeEventListener("resize", resize);
    inputController.removeListeners();

    try {
      canvas.pause(true);
      // zCanvas doesn't provide a dedicated destroy API; removing the DOM element is sufficient.
    } catch {
      // ignore
    }

    root.remove();
  }

  // Start immediately with the provided game
  await start(gameRef);

  return {
    start,
    setPaused: (paused: boolean) => setPaused(paused),
    destroy,
  };
}
