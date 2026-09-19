import throttle from "lodash.throttle";
import { Canvas } from "zcanvas";
import type { Size } from "zcanvas";

import type { GameDef, GameMessages } from "@/definitions/game";
import { ActorTypes, FRAME_RATE, GameSounds } from "@/definitions/game";

import { init, scaleCanvas, setFlipperState, bumpTable, getBumpLevel, update, panViewport, setPaused, getBallPosition, getBallCount, nudgeBallToward, isKamikazeMode, isStoryMode, storyAction, queueDive, deployStoredMunition, triggerTiltLock, hasStoredMunition, isShotCallMode, shotAim, shotRelease, getShotLanes } from "@/model/game";
import SpriteCache from "@/utils/sprite-cache";
import { createInputController, attachKamikazeGestures } from "@/utils/input-controller";
import * as haptics from "@/utils/haptics";
import { createScreenPulse } from "@/utils/screen-pulse";
import { playVerbNudge, playVerbDive, playVerbDeploy, playVerbTiltLock, playVerbChargeTick } from "@/services/audio-service";

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
   * Pause toggle owned by the parent (shared pause menu). When omitted the
   * legacy inline pause flag is flipped directly.
   */
  onTogglePause?: () => void;
  /**
   * Gates global key/click handling so embedded encounters and menus are not
   * pre-empted by the table's controls. Defaults to always enabled.
   */
  inputEnabled?: () => boolean;
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
  /** World (table) coordinates → client (screen) coordinates. */
  getPointClientPosition: (x: number, y: number) => { x: number; y: number } | null;
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
    // A held nudge is a long press, which iOS answers with a text-selection
    // callout and Android with a context menu — both of which steal the input
    // mid-charge. Suppress them at the surface rather than per element.
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
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
    // Escalating: the buzz deepens as the tilt gets closer, so the penalty is
    // something the player feels coming rather than something done to them.
    haptics.tiltWarning(getBumpLevel());
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
    // Kamikaze owns nudging through the gesture controller, and bumpTable is a
    // no-op there — so Space used to buzz the phone for an action that did
    // nothing, while a keyboard player had no nudge verb at all. Space is the
    // charge-nudge key in this mode instead.
    onBump: () => {
      if (isKamikazeMode()) return;
      bumpHandler();
    },
    onPan: (delta: number) => panViewport(delta),
    onTogglePause: () => {
      if (opts.onTogglePause) {
        opts.onTogglePause();
        return;
      }
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
    isKamikaze: () => isKamikazeMode() || isStoryMode(),
    shouldHandle: () => opts.inputEnabled?.() ?? true,
  }, root);

  // ── Kamikaze Ball agency gestures (Phase 2) ──────────────────────
  // Shared handlers so pointer gestures and keyboard agree.
  let firstActionFired = false;
  function markFirstAction() {
    if (firstActionFired || opts.attract) return;
    firstActionFired = true;
    opts.onFirstAction?.();
  }
  /**
   * Aim for a nudge that has no pointer behind it (a keyboard release). A save
   * nudge: up-table and away from the nearer wall. Straight up would leave the
   * ball where it came from, and a keyboard player has no way to point.
   */
  function keyboardAim(): { x: number; y: number } | null {
    const ball = getBallPosition();
    if (!ball) return null;
    const width = tableSize?.width ?? 600;
    const away = ball.x < width / 2 ? 1 : -1;
    return { x: ball.x + away * width * 0.18, y: ball.y - width * 0.3 };
  }

  function nudgeAt(clientX: number | null, clientY: number | null, power = 1) {
    // Shot-calling: a tap calls your shot — bucket the tap into a target lane.
    if (isShotCallMode()) {
      if (clientX !== null) shotAimAtClient(clientX);
      return;
    }
    const world =
      clientX === null || clientY === null ? keyboardAim() : clientToWorld(clientX, clientY);
    if (!world) return;
    nudgeBallToward(world.x, world.y, power);
    // A held nudge lands heavier the longer it was held; a tap stays a tap. The
    // difference is felt rather than read off the power readout.
    if (power > 1) haptics.chargeRelease(power);
    else haptics.nudge();
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
    if (!isKamikazeMode() || isShotCallMode()) return;
    queueDive();
    haptics.bump();
    playVerbDive();
    markFirstAction();
    opts.onDive?.();
  }
  function deploy() {
    if (!isKamikazeMode() || isShotCallMode()) return;
    const type = deployStoredMunition();
    if (type !== null) {
      haptics.flip();
      playVerbDeploy();
      markFirstAction();
      opts.onDeploy?.();
    }
  }
  function tiltLock() {
    if (!isKamikazeMode() || isShotCallMode()) return;
    const fired = triggerTiltLock();
    if (fired) {
      haptics.nudge();
      playVerbTiltLock();
      markFirstAction();
      opts.onTiltLock?.();
    } else {
      // A distinct "no" is what teaches the cooldown. Silence reads as a bug.
      haptics.tiltDenied();
      opts.onTiltLockCooldown?.();
    }
  }

  let detachGestures: (() => void) | null = null;
  /**
   * The visual echo of the haptic vocabulary. Registered from here — the layer
   * that owns the DOM — rather than imported by the haptics engine, because the
   * model drives those events too and must not pull DOM code into its graph.
   */
  let visualEcho: ((weight: number) => void) | null = null;

  function handleStoryKey(e: KeyboardEvent) {
    if (!isStoryMode() || opts.attract) return;
    if (e.type !== "keydown" || e.repeat) return;
    if (!(opts.inputEnabled?.() ?? true)) return;
    if (e.code === "KeyW") {
      storyAction({ type: "arm-water" });
      markFirstAction();
      e.preventDefault();
    }
  }

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
        if (isKamikazeMode() || isStoryMode()) {
          // Kamikaze Ball / Story: input is owned by the pointer gesture controller
          // (charged nudge / dive / deploy). Let pointer events pass through.
          return;
        }
        inputController.handleTouchStart(isLeft, e);
        e.preventDefault();
        e.stopPropagation();
      });
      const end = (e: TouchEvent) => {
        if (!isKamikazeMode() && !isStoryMode()) {
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
      window.addEventListener("keydown", handleStoryKey);
      // Kamikaze Ball agency gestures (charged nudge / dive / deploy).
      if (!detachGestures) {
        detachGestures = attachKamikazeGestures(root, {
          onNudge: nudgeAt,
          onDive: dive,
          onDeploy: deploy,
          onTiltLock: tiltLock,
          hasMunition: hasStoredMunition,
          // The charge has a sound (playVerbChargeTick) that nothing ever
          // called, and no tactile read at all: you could hold to 3x and only
          // see the power bar. Both now land on the notch crossings.
          onChargeNotch: (notch, power) => {
            playVerbChargeTick(power);
            haptics.chargeTick(notch);
          },
          onChargeTick: (power) => opts.onCharge?.(power),
          onChargeEnd: () => opts.onCharge?.(null),
          // In shot-calling, Space releases the shot (handleKamikazeKey); a
          // charge starting on the same key would swallow the release.
          canKeyboardCharge: () => !isShotCallMode() && !isStoryMode(),
          shouldHandle: () => (isKamikazeMode() || isStoryMode()) && !gameRef.paused && (opts.inputEnabled?.() ?? true),
        });
      }
      // Deliberately not in attract mode: the lobby's machine plays itself, and
      // flashing the demo for every save the bot makes is noise nobody asked for.
      if (!visualEcho) {
        const pulse = createScreenPulse(root);
        if (pulse) {
          visualEcho = pulse;
          haptics.setVisualEcho(pulse);
        }
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
    window.removeEventListener("keydown", handleStoryKey);
    detachGestures?.();
    detachGestures = null;
    haptics.clearVisualEcho(visualEcho);
    visualEcho = null;

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
    getPointClientPosition: worldToClient,
  };
}
