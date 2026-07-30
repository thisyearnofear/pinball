import throttle from "lodash.throttle";
import { Canvas } from "zcanvas";
import type { Size } from "zcanvas";

import type { GameDef, GameMessages } from "@/definitions/game";
import { ActorTypes, FRAME_RATE, GameSounds } from "@/definitions/game";

import { init, scaleCanvas, setFlipperState, bumpTable, update, panViewport, setPaused, getBallPosition, getBallCount, nudgeBallToward, isKamikazeMode, queueDive, deployStoredMunition, triggerTiltLock, hasStoredMunition, isShotCallMode, shotAim, shotRelease, getShotLanes } from "@/model/game";
import SpriteCache from "@/utils/sprite-cache";
import { createInputController, attachKamikazeGestures } from "@/utils/input-controller";
import * as haptics from "@/utils/haptics";
import { playVerbNudge, playVerbDive, playVerbDeploy, playVerbTiltLock } from "@/services/audio-service";

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
   * Attract/demo mode: no player input is wired at all (no keyboard,
   * touch zones or nudge). The kamikaze AI plays the machine by itself.
   */
  attract?: boolean;
  /**
   * Fired when the engine surfaces high-signal messages (e.g. MULTIBALL).
   */
  onMessage?: (message: GameMessages | null) => void;
  /**
   * Kamikaze Ball gesture callbacks (Phase 2 agency). Fired on charge
   * (hold), dive (swipe down), and deploy (double-tap / D key).
   */
  onCharge?: (power: number | null) => void;
  onDive?: () => void;
  onDeploy?: () => void;
  onNudge?: (power: number) => void;
  onTiltLock?: () => void;
  onTiltLockCooldown?: () => void;
  onAim?: (pointerX: number | null, pointerY: number | null) => void;
  /**
   * Fired exactly once, the first time the player performs any deliberate
   * in-run action (nudge / dive / deploy / tilt-lock). Used for the
   * "early win" micro-reward so the first dopamine hit lands before the
   * first run even ends.
   */
  onFirstAction?: () => void;
};

export type MountedGame = {
  start: (game: GameDef) => Promise<void>;
  setPaused: (paused: boolean) => void;
  destroy: () => void;
  getBallPosition: () => { x: number; y: number } | null;
  getBallClientPosition: () => { x: number; y: number } | null;
  getBallCount: () => number;
  getTableHeight: () => number;
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
  // Renderers assume a viewport exists; frames can render during async init()
  // before resize()/scaleCanvas() runs, so set one up front.
  canvas.setViewport(600, 800);
  canvas.insertInPage(canvasContainer);

  // Preload bitmaps already cached by asset-preloader (if it ran).
  // zcanvas transfers ImageBitmaps to its render worker (detaching them), so hand
  // over a clone to keep the shared cache usable across mounts (attract + game).
  // Falls back to loading at runtime if missing.
  await Promise.all(
    [SpriteCache.BALL, SpriteCache.FLIPPER_LEFT, SpriteCache.FLIPPER_RIGHT].map(async (entry) => {
      if (!entry.bitmap) return;
      try {
        const clone = await createImageBitmap(entry.bitmap);
        canvas.loadResource(entry.resourceId, clone);
      } catch {
        // cached bitmap was already detached; renderer will load at runtime
      }
    })
  );

  let gameRef: GameDef = opts.game;
  let tableSize: Size | null = null;
  let inited = false;
  let destroyed = false;
  let changeTimeout: number | null = null;

  /**
   * Convert client (screen) coordinates to world (table) coordinates,
   * accounting for canvas zoom and viewport panning.
   */
  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = (canvas as any).getElement?.() as HTMLElement | undefined;
    const rect = (el ?? canvasContainer).getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const vp = (canvas as any).getViewport?.();
    const worldWidth = vp?.width ?? tableSize?.width ?? 600;
    const worldHeight = vp?.height ?? tableSize?.height ?? 800;
    return {
      x: (vp?.left ?? 0) + ((clientX - rect.left) / rect.width) * worldWidth,
      y: (vp?.top ?? 0) + ((clientY - rect.top) / rect.height) * worldHeight,
    };
  }
  /**
   * Convert world (table) coordinates back to client (screen) coordinates.
   * Inverse of clientToWorld; used for the aim-guide overlay.
   */
  function worldToClient(x: number, y: number): { x: number; y: number } | null {
    const el = (canvas as any).getElement?.() as HTMLElement | undefined;
    const rect = (el ?? canvasContainer).getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const vp = (canvas as any).getViewport?.();
    const worldWidth = vp?.width ?? tableSize?.width ?? 600;
    const worldHeight = vp?.height ?? tableSize?.height ?? 800;
    return {
      x: rect.left + (((x - (vp?.left ?? 0)) / worldWidth) * rect.width),
      y: rect.top + (((y - (vp?.top ?? 0)) / worldHeight) * rect.height),
    };
  }

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
    onNudge: (x: number, y: number) => {
      // Kamikaze nudging is owned by the pointer gesture controller
      // (charged nudge / dive / deploy); skip the legacy click path.
      if (isKamikazeMode()) return;
      const world = clientToWorld(x, y);
      if (!world) return;
      nudgeBallToward(world.x, world.y);
      haptics.bump();
      markFirstAction();
    },
    isKamikaze: () => isKamikazeMode(),
  }, root);

  // ── Kamikaze Ball agency gestures (Phase 2) ──────────────────────
  // Shared handlers so pointer gestures and keyboard agree.
  let firstActionFired = false;
  function markFirstAction() {
    if (firstActionFired || opts.attract) return;
    firstActionFired = true;
    opts.onFirstAction?.();
  }
  function nudgeAt(clientX: number, clientY: number, power = 1) {
    // Shot-calling: a tap calls your shot — bucket the tap into a target lane.
    if (isShotCallMode()) {
      shotAimAtClient(clientX);
      return;
    }
    const world = clientToWorld(clientX, clientY);
    if (!world) return;
    nudgeBallToward(world.x, world.y, power);
    haptics.bump();
    playVerbNudge(power);
    markFirstAction();
    if (power > 1.3) opts.onNudge?.(power);
  }
  /** Shot-calling: map a tap's screen x to a target lane and signal intent. */
  function shotAimAtClient(clientX: number) {
    const rect = root.getBoundingClientRect();
    if (!rect.width) return;
    const lanes = getShotLanes();
    const frac = (clientX - rect.left) / rect.width;
    const lane = Math.max(0, Math.min(lanes - 1, Math.floor(frac * lanes)));
    shotAim(lane);
    haptics.nudge();
    markFirstAction();
  }
  function dive() {
    if (!isKamikazeMode()) return;
    queueDive();
    haptics.bump();
    playVerbDive();
    markFirstAction();
    opts.onDive?.();
  }
  function deploy() {
    if (!isKamikazeMode()) return;
    const type = deployStoredMunition();
    if (type !== null) {
      haptics.flip();
      playVerbDeploy();
      markFirstAction();
      opts.onDeploy?.();
    }
  }
  function tiltLock() {
    if (!isKamikazeMode()) return;
    const fired = triggerTiltLock();
    if (fired) {
      haptics.nudge();
      playVerbTiltLock();
      markFirstAction();
      opts.onTiltLock?.();
    } else {
      opts.onTiltLockCooldown?.();
    }
  }

  let detachGestures: (() => void) | null = null;

  function handleKamikazeKey(e: KeyboardEvent) {
    if (!isKamikazeMode() || opts.attract) return;
    if (e.type !== "keydown" || e.repeat) return;
    // Shot-calling: Space / ArrowUp releases the shot (timing = accuracy).
    if (isShotCallMode() && (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter")) {
      shotRelease();
      haptics.flip();
      markFirstAction();
      e.preventDefault();
      return;
    }
    if (e.code === "ArrowDown") {
      dive();
      e.preventDefault();
    } else if (e.code === "KeyD") {
      deploy();
      e.preventDefault();
    } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      tiltLock();
      e.preventDefault();
    }
  }

  function resize() {
    if (!inited || !tableSize) return;
    const { clientWidth, clientHeight } = root;
    const canvasHeight = Math.min(tableSize.height, clientHeight);
    scaleCanvas(clientWidth, canvasHeight);
  }

  // Optional touch controls: two invisible halves for flippers (normal mode)
  // or single full-screen tap zone for Kamikaze Ball.
  const touchLeft = document.createElement("div");
  const touchRight = document.createElement("div");
  if (opts.touchscreen && !opts.attract) {
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
        if (isKamikazeMode()) {
          // Kamikaze Ball: input is owned by the pointer gesture controller
          // (charged nudge / dive / deploy). Let pointer events pass through.
          return;
        }
        inputController.handleTouchStart(isLeft, e);
        e.preventDefault();
        e.stopPropagation();
      });
      const end = (e: TouchEvent) => {
        if (!isKamikazeMode()) {
          inputController.handleTouchEnd(isLeft, e);
        }
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

    if (!opts.attract) {
      inputController.addListeners();
      window.addEventListener("keydown", handleKamikazeKey);
      // Kamikaze Ball agency gestures (charged nudge / dive / deploy).
      if (!detachGestures) {
        detachGestures = attachKamikazeGestures(root, {
          onNudge: nudgeAt,
          onDive: dive,
          onDeploy: deploy,
          onTiltLock: tiltLock,
          hasMunition: hasStoredMunition,
          onChargeTick: (power) => opts.onCharge?.(power),
          onChargeEnd: () => opts.onCharge?.(null),
          shouldHandle: () => isKamikazeMode() && !gameRef.paused,
        });
      }
    }
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
    window.removeEventListener("keydown", handleKamikazeKey);
    detachGestures?.();
    detachGestures = null;

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
    getBallPosition,
    getBallClientPosition: () => {
      const p = getBallPosition();
      return p ? worldToClient(p.x, p.y) : null;
    },
    getBallCount,
    getTableHeight: () => tableSize?.height ?? 0,
  };
}
