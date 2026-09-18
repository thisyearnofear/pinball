"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  chapterReducer, chapterObjective, createChapter,
  loadLearnedBlessing, saveLearnedBlessing,
  type ChapterEvent, type ChapterState, type ChapterTarget,
} from "@/model/shrine-chapter";
import { createChapterTable, type ChapterTable, type ChapterTableSnapshot } from "./chapter-table";
import styles from "./ShrineChapter.module.scss";

const AIM_LABELS: { target: ChapterTarget; key: string; label: string; hint: string }[] = [
  { target: "shrine", key: "1", label: "Water Shrine", hint: "learn · refill mana" },
  { target: "west", key: "2", label: "Fire Seal I", hint: "needs armed water" },
  { target: "east", key: "3", label: "Fire Seal II", hint: "needs armed water" },
  { target: "gate", key: "4", label: "Torii Gate", hint: "opens after both seals" },
];

const ELEMENTS: { element: "water" | "fire" | "wind"; label: string; glyph: string }[] = [
  { element: "water", label: "Water", glyph: "水" },
  { element: "fire", label: "Fire", glyph: "火" },
  { element: "wind", label: "Wind", glyph: "風" },
];

function isInteractive(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest("button, a, input, select, textarea, [role='dialog']");
}

export default function ShrineChapter() {
  const [state, setState] = useState<ChapterState>(() => createChapter(loadLearnedBlessing()));
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(true);
  const [aim, setAim] = useState<ChapterTarget>("shrine");
  const stateRef = useRef(state);
  stateRef.current = state;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableRef = useRef<ChapterTable | null>(null);
  const meterFillRef = useRef<HTMLDivElement>(null);
  const meterTextRef = useRef<HTMLOutputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const dispatch = useCallback((event: ChapterEvent) => {
    setState(prev => {
      const next = chapterReducer(prev, event);
      if (next !== prev) {
        if (next.learned && !prev.learned) saveLearnedBlessing(true);
        tableRef.current?.setState(next);
      }
      return next;
    });
  }, []);

  const onSnapshot = useCallback((snap: ChapterTableSnapshot) => {
    if (meterFillRef.current) meterFillRef.current.style.width = `${Math.round(snap.meter * 100)}%`;
    if (meterTextRef.current) {
      meterTextRef.current.textContent =
        `held=${snap.held} aim=${snap.aim} meter=${snap.meter.toFixed(2)}`;
    }
    setHeld(h => (h === snap.held ? h : snap.held));
    setAim(a => (a === snap.aim ? a : snap.aim));
    if (snap.paused && !pausedRef.current) setPaused(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const table = createChapterTable(canvas, stateRef.current, dispatch, onSnapshot);
    tableRef.current = table;
    return () => {
      tableRef.current = null;
      table.destroy();
    };
  }, [dispatch, onSnapshot]);

  const playing = state.phase === "playing";
  const dialogOpen = !playing || paused;

  const setPausedBoth = useCallback((p: boolean) => {
    setPaused(p);
    tableRef.current?.setPaused(p);
  }, []);

  // Retry must re-cradle the physics table, not just reset the chapter state:
  // the reducer's setState only cradles outside "playing", so without reset()
  // a retry would leave a live ball mid-table (and a stale fired-event set)
  // that drains before the player touches anything.
  const retry = useCallback(() => {
    tableRef.current?.reset();
    dispatch({ type: "retry" });
  }, [dispatch]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && stateRef.current.phase === "playing") setPausedBoth(true);
    };
    const onBlur = () => {
      if (stateRef.current.phase === "playing") setPausedBoth(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [setPausedBoth]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const phase = stateRef.current.phase;
      if (e.key === "Escape") {
        if (phase === "lesson") { dispatch({ type: "leave-lesson" }); return; }
        if ((phase === "playing" || pausedRef.current) && stateRef.current.phase !== "blessing" && stateRef.current.phase !== "gate-opening") {
          setPausedBoth(!pausedRef.current);
        }
        return;
      }
      if (phase !== "playing" || pausedRef.current) return;
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === "w") {
        if (!isInteractive(e.target)) dispatch({ type: "arm-water" });
        return;
      }
      if (key === "p") { setPausedBoth(true); return; }
      if (key === "a" || e.key === "ArrowLeft") { tableRef.current?.flip("left", true); return; }
      if (key === "d" || e.key === "ArrowRight") { tableRef.current?.flip("right", true); return; }
      if (e.key === " ") {
        if (!isInteractive(e.target)) { e.preventDefault(); tableRef.current?.release(); }
        return;
      }
      const aimIdx = ["1", "2", "3", "4"].indexOf(e.key);
      if (aimIdx >= 0 && !isInteractive(e.target)) {
        tableRef.current?.aim(AIM_LABELS[aimIdx].target);
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "a" || e.key === "ArrowLeft") tableRef.current?.flip("left", false);
      if (key === "d" || e.key === "ArrowRight") tableRef.current?.flip("right", false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [dispatch, setPausedBoth]);

  useEffect(() => {
    if (!dialogOpen) return;
    const el = dialogRef.current;
    if (!el) return;
    lastFocusRef.current = document.activeElement as HTMLElement;
    const first = el.querySelector<HTMLElement>("button:not([disabled])");
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", trap);
    return () => {
      el.removeEventListener("keydown", trap);
      lastFocusRef.current?.focus?.();
    };
  }, [dialogOpen, state.phase]);

  const flipHandlers = (side: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      tableRef.current?.flip(side, true);
    },
    onPointerUp: () => tableRef.current?.flip(side, false),
    onPointerCancel: () => tableRef.current?.flip(side, false),
    onLostPointerCapture: () => tableRef.current?.flip(side, false),
  });

  const launchDisabled = !held || paused || !playing;
  const armDisabled = !state.learned || state.mana === 0 || state.waterArmed || !playing || paused;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>← Return to arcade</Link>
        <p className={styles.eyebrow}>Free play · Story prototype · Chapter 01</p>
        <h1 className={styles.title}>The Water Shrine <span aria-hidden="true">水</span></h1>
        <p className={styles.tagline}>Learn the water blessing. Earn passage through the torii.</p>
      </header>

      <div className={styles.layout}>
        <section className={styles.tableWrap} aria-label="Pinball table">
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            role="img"
            aria-label="Shrine garden pinball table. Aim at the water shrine, two fire seals, and the torii gate."
          />
          <div className={styles.meterRow}>
            <div className={styles.meter} aria-hidden="true">
              <div className={styles.meterBand} />
              <div ref={meterFillRef} className={styles.meterFill} />
            </div>
            <output ref={meterTextRef} className={styles.meterText} data-testid="chapter-status" />
          </div>
          <p className={styles.meterHint}>Launch while the marker crosses the lit band (40–60%) for a true shot.</p>

          <div className={styles.controls} aria-label="Chapter controls">
            <div className={styles.aimRow} role="group" aria-label="Aim target">
              {AIM_LABELS.map(a => (
                <button
                  key={a.target}
                  type="button"
                  className={`${styles.aimBtn} ${aim === a.target ? styles.aimActive : ""}`}
                  onClick={() => tableRef.current?.aim(a.target)}
                  disabled={paused}
                  title={a.hint}
                >
                  <span className={styles.aimKey}>{a.key}</span>
                  {a.label}
                </button>
              ))}
            </div>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.armBtn}
                disabled={armDisabled}
                onClick={() => dispatch({ type: "arm-water" })}
              >
                {state.waterArmed ? "Water armed" : "Arm Water (W)"}
              </button>
              <button
                type="button"
                className={styles.launchBtn}
                disabled={launchDisabled}
                onClick={() => tableRef.current?.release()}
              >
                Launch (Space)
              </button>
              <button
                type="button"
                className={styles.pauseBtn}
                disabled={!playing && !paused}
                onClick={() => setPausedBoth(!paused)}
              >
                {paused ? "Resume" : "Pause (P)"}
              </button>
            </div>
            <div className={styles.flipperRow}>
              <button type="button" className={styles.flipBtn} {...flipHandlers("left")} aria-label="Left flipper, hold A">
                ◀ HOLD · A
              </button>
              <button type="button" className={styles.flipBtn} {...flipHandlers("right")} aria-label="Right flipper, hold D">
                HOLD · D ▶
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.journal} aria-label="Chapter journal" inert={dialogOpen || undefined}>
          <div className={styles.objective}>{chapterObjective(state)}</div>
          <dl className={styles.stats}>
            <div><dt>Integrity</dt><dd className={state.integrity === 1 ? styles.critical : ""}>{"●".repeat(state.integrity)}{"○".repeat(3 - state.integrity)} {state.integrity === 1 ? "— critical" : ""}</dd></div>
            <div><dt>Mana</dt><dd>{state.mana} / 3</dd></div>
            <div><dt>Blessing</dt><dd>{state.learned ? (state.waterArmed ? "Water armed" : "Water learned") : "Not learned"}</dd></div>
            <div><dt>Seals</dt><dd>{["west", "east"].map(id => <span key={id} className={state.seals.includes(id as "west" | "east") ? styles.sealDone : styles.sealOpen}>{id === "west" ? "I" : "II"} {state.seals.includes(id as "west" | "east") ? "quenched" : "burning"}</span>)}</dd></div>
          </dl>
          <p className={styles.notice} aria-live="polite">{state.notice}</p>
          <ol className={styles.howto}>
            <li>Choose a target (1–4) — fire seals burn an unarmed ball.</li>
            <li>Launch on the lit meter band (Space).</li>
            <li>Hold both flippers (A + D) to catch a falling ball.</li>
            <li>Press W to arm Water before each seal shot.</li>
          </ol>
        </aside>
      </div>

      {state.phase === "lesson" && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="lesson-title">
            <p className={styles.dialogEyebrow}>Mamoru, shrine guardian</p>
            <h2 id="lesson-title" className={styles.dialogTitle}>The Trial of Elements</h2>
            <p className={styles.dialogText}>
              Water quenches flame; wind feeds it. Your first mistake is safe — later mistakes cost 1 integrity.
            </p>
            <p className={styles.dialogQuestion}>
              {state.lessonStep === 0
                ? "Which element quenches a fire seal?"
                : "And which element would feed a flame instead?"}
            </p>
            <div className={styles.choiceRow}>
              {ELEMENTS.map(el => (
                <button
                  key={el.element}
                  type="button"
                  className={styles.choiceBtn}
                  onClick={() => dispatch({ type: "answer", element: el.element })}
                >
                  <span className={styles.glyph} aria-hidden="true">{el.glyph}</span>
                  {el.label}
                </button>
              ))}
            </div>
            <button type="button" className={styles.leaveBtn} onClick={() => dispatch({ type: "leave-lesson" })}>
              Step away (Esc) — the shrine will wait
            </button>
          </div>
        </div>
      )}

      {state.phase === "blessing" && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="blessing-title">
            <p className={styles.dialogEyebrow}>Mamoru, shrine guardian</p>
            <h2 id="blessing-title" className={styles.dialogTitle}>The Blessing of Water 水</h2>
            <p className={styles.dialogText}>
              You answered truly. The water blessing is yours — carry it to the two fire seals.
              Arm Water (W) before each strike; each warding costs 1 mana, and the shrine refills it.
              This knowledge survives even a shattered ball.
            </p>
            <button type="button" className={styles.continueBtn} onClick={() => dispatch({ type: "continue" })}>
              Continue — return to the table
            </button>
          </div>
        </div>
      )}

      {state.phase === "gate-opening" && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="gate-title">
            <p className={styles.dialogEyebrow}>Mamoru, shrine guardian</p>
            <h2 id="gate-title" className={styles.dialogTitle}>The Torii Opens</h2>
            <p className={styles.dialogText}>
              Both seals lie quenched and quiet. The vermilion cross-line fades — the way through
              the torii is open. One true shot remains.
            </p>
            <button type="button" className={styles.continueBtn} onClick={() => dispatch({ type: "continue" })}>
              Continue — aim through the gate
            </button>
          </div>
        </div>
      )}

      {state.phase === "won" && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="won-title">
            <h2 id="won-title" className={styles.dialogTitle}>Chapter Complete</h2>
            <p className={styles.dialogText}>
              You crossed the torii because you learned water at the shrine, carried it to both
              fire seals, and earned the gate&apos;s opening. Nothing here was luck — every step was yours.
            </p>
            <div className={styles.choiceRow}>
              <button type="button" className={styles.continueBtn} onClick={retry}>
                Play chapter again
              </button>
              <Link href="/" className={styles.leaveBtn}>Return to arcade</Link>
            </div>
          </div>
        </div>
      )}

      {state.phase === "lost" && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={`${styles.dialog} ${styles.dialogLost}`} role="dialog" aria-modal="true" aria-labelledby="lost-title">
            <h2 id="lost-title" className={styles.dialogTitle}>The Ball Shattered</h2>
            <p className={styles.dialogText}>{state.notice}</p>
            <button type="button" className={styles.continueBtn} onClick={retry}>
              Retry — keep your blessing
            </button>
          </div>
        </div>
      )}

      {paused && playing && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="pause-title">
            <h2 id="pause-title" className={styles.dialogTitle}>Paused</h2>
            <p className={styles.dialogText}>The table waits. Your aim, meter, and ball are frozen.</p>
            <div className={styles.choiceRow}>
              <button type="button" className={styles.continueBtn} onClick={() => setPausedBoth(false)}>Resume (P / Esc)</button>
              <button type="button" className={styles.leaveBtn} onClick={() => { setPausedBoth(false); retry(); }}>Retry chapter</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
