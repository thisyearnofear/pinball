"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  chapterReducer, chapterObjective, createChapter,
  loadLearnedBlessing, saveLearnedBlessing,
  type ChapterEvent, type ChapterState, type ChapterTarget,
} from "@/model/shrine-chapter";
import type { TrialOutcome } from "@/model/story-run";
import { createChapterTable, type ChapterTable, type ChapterTableSnapshot } from "./chapter-table";
import styles from "./ShrineChapter.module.scss";

const AIM_LABELS: { target: ChapterTarget; key: string; label: string; hint: string }[] = [
  { target: "shrine", key: "1", label: "Water Shrine", hint: "learn · refill mana" },
  { target: "west", key: "2", label: "Fire Seal I", hint: "needs armed water" },
  { target: "east", key: "3", label: "Fire Seal II", hint: "needs armed water" },
  { target: "gate", key: "4", label: "Torii Gate", hint: "opens after both seals" },
];

const EMBEDDED_AIMS = AIM_LABELS.filter(a => a.target === "shrine" || a.target === "west");

const ELEMENTS: { element: "water" | "fire" | "wind"; label: string; glyph: string }[] = [
  { element: "water", label: "Water", glyph: "水" },
  { element: "fire", label: "Fire", glyph: "火" },
  { element: "wind", label: "Wind", glyph: "風" },
];

function isInteractive(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest("button, a, input, select, textarea, [role='dialog']");
}

function isTextInput(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable="true"]');
}

type Props = {
  embedded?: boolean;
  paused?: boolean;
  onResult?: (outcome: TrialOutcome) => void;
};

export default function ShrineChapter({ embedded = false, paused: externalPaused = false, onResult }: Props = {}) {
  const [state, setState] = useState<ChapterState>(() => createChapter(embedded ? false : loadLearnedBlessing()));
  const [paused, setPaused] = useState(false);
  const resultSentRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const emitResult = useCallback((outcome: TrialOutcome) => {
    if (resultSentRef.current) return;
    resultSentRef.current = true;
    onResultRef.current?.(outcome);
  }, []);
  const [held, setHeld] = useState(true);
  const [aim, setAim] = useState<ChapterTarget>("shrine");
  const [aimReady, setAimReady] = useState(false);
  const stateRef = useRef(state);
  const pausedRef = useRef(paused);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableRef = useRef<ChapterTable | null>(null);
  const meterFillRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const meterTextRef = useRef<HTMLSpanElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const dispatch = useCallback((event: ChapterEvent) => {
    const prev = stateRef.current;
    let next = chapterReducer(prev, event);
    if (next === prev) return;
    // Embedded trial: the lesson + one practice seal is the whole encounter —
    // no second fire seal or gate campaign lives inside the shrine visit.
    if (embedded && next.learned && next.seals.includes("west") && next.phase !== "won") {
      next = { ...next, phase: "won", waterArmed: false, notice: "Water trial mastered. Carry the blessing back to the main table." };
    }
    stateRef.current = next;
    tableRef.current?.setState(next);
    if (!embedded && next.learned && !prev.learned) saveLearnedBlessing(true);
    setState(next);
  }, [embedded]);

  const onSnapshot = useCallback((snap: ChapterTableSnapshot) => {
    const percent = Math.round(snap.meter * 100);
    if (meterFillRef.current) meterFillRef.current.style.width = `${percent}%`;
    meterRef.current?.setAttribute("aria-valuenow", String(percent));
    if (meterTextRef.current) {
      Object.assign(meterTextRef.current.dataset, {
        held: String(snap.held), aim: snap.aim, meter: snap.meter.toFixed(2), ready: String(snap.aimReady),
      });
      meterTextRef.current.textContent = !snap.held ? "Ball in play" : snap.aimReady ? "Ready to launch" : "Choose a target";
    }
    setHeld(snap.held);
    setAim(snap.aim);
    setAimReady(snap.aimReady);
    if (snap.paused && !pausedRef.current) {
      pausedRef.current = true;
      setPaused(true);
    }
  }, []);

  const chooseTarget = useCallback((target: ChapterTarget) => {
    tableRef.current?.aim(target);
    canvasRef.current?.focus({ preventScroll: true });
  }, []);

  const aims = embedded ? EMBEDDED_AIMS : AIM_LABELS;

  useEffect(() => {
    if (!embedded) return;
    if (state.phase === "won") emitResult("mastered");
    else if (state.phase === "lost") emitResult("failed");
  }, [embedded, state.phase, emitResult]);

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
  const pausedEff = paused || externalPaused;
  const dialogOpen = !playing || pausedEff;

  // The parent's menu pause also freezes the trial — mirror it into the ref
  // the keyboard/pointer gates read and into the physics table.
  useEffect(() => {
    pausedRef.current = pausedEff;
    tableRef.current?.setPaused(pausedEff);
  }, [pausedEff]);

  const setPausedBoth = useCallback((p: boolean) => {
    pausedRef.current = p || externalPaused;
    tableRef.current?.setPaused(p || externalPaused);
    setPaused(p);
  }, [externalPaused]);

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
      if (e.repeat || isTextInput(e.target)) return;
      const phase = stateRef.current.phase;
      const key = e.key.toLowerCase();
      if (e.key === "Escape" || key === "p") {
        if (e.key === "Escape" && phase === "lesson") {
          if (embedded) emitResult("abandoned");
          else dispatch({ type: "leave-lesson" });
        }
        else if (phase === "playing" && !externalPaused) setPausedBoth(!pausedRef.current);
        return;
      }
      if (phase !== "playing" || pausedRef.current) return;
      if (key === "w") { dispatch({ type: "arm-water" }); return; }
      if (key === "a" || e.key === "ArrowLeft") {
        e.preventDefault(); tableRef.current?.flip("left", true); return;
      }
      if (key === "d" || e.key === "ArrowRight") {
        e.preventDefault(); tableRef.current?.flip("right", true); return;
      }
      if (e.key === " ") {
        if (!isInteractive(e.target)) { e.preventDefault(); tableRef.current?.release(); }
        return;
      }
      const aimIdx = ["1", "2", "3", "4"].indexOf(e.key);
      if (aimIdx >= 0 && aims[aimIdx]) chooseTarget(aims[aimIdx].target);
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
  }, [dispatch, setPausedBoth, chooseTarget, embedded, externalPaused, emitResult, aims]);

  useEffect(() => {
    if (!dialogOpen) return;
    lastFocusRef.current = document.activeElement as HTMLElement;
    return () => {
      const previous = lastFocusRef.current;
      if (previous?.isConnected && !previous.matches(":disabled")) previous.focus();
      else canvasRef.current?.focus({ preventScroll: true });
    };
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return;
    const el = dialogRef.current;
    if (!el) return;
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
    return () => el.removeEventListener("keydown", trap);
  }, [dialogOpen, state.phase]);

  const flipHandlers = (side: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (stateRef.current.phase !== "playing" || pausedRef.current) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      tableRef.current?.flip(side, true);
    },
    onPointerUp: () => tableRef.current?.flip(side, false),
    onPointerCancel: () => tableRef.current?.flip(side, false),
    onLostPointerCapture: () => tableRef.current?.flip(side, false),
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (!e.repeat && stateRef.current.phase === "playing" && !pausedRef.current) tableRef.current?.flip(side, true);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      tableRef.current?.flip(side, false);
    },
    onBlur: () => tableRef.current?.flip(side, false),
  });

  const launchDisabled = !held || pausedEff || !playing || !aimReady;
  const armDisabled = !state.learned || state.mana === 0 || state.waterArmed || !playing || pausedEff;

  return (
    <main className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      {embedded ? (
        <header className={`${styles.header} ${styles.headerEmbedded}`} inert={dialogOpen || undefined}>
          <p className={styles.eyebrow}>Shrine encounter</p>
          <h1 className={styles.titleSmall}>MAMORU&rsquo;s Water Trial <span aria-hidden="true">水</span></h1>
        </header>
      ) : (
        <header className={styles.header} inert={dialogOpen || undefined}>
          <Link href="/" className={styles.back}>← Return to arcade</Link>
          <p className={styles.eyebrow}>Free play · Story prototype · Chapter 01</p>
          <h1 className={styles.title}>The Water Shrine <span aria-hidden="true">水</span></h1>
          <p className={styles.tagline}>Learn the water blessing. Earn passage through the torii.</p>
        </header>
      )}

      <div className={styles.layout} inert={dialogOpen || undefined}>
        <section className={styles.tableWrap} aria-label="Pinball table">
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            role="img"
            tabIndex={0}
            aria-label="Shrine garden pinball table. Aim at the water shrine, two fire seals, and the torii gate."
          />
          <div className={styles.meterRow}>
            <div ref={meterRef} className={styles.meter} role="meter" aria-label="Shot timing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
              <div className={styles.meterBand} />
              <div ref={meterFillRef} className={styles.meterFill} />
            </div>
            <span ref={meterTextRef} className={styles.meterText} data-testid="chapter-status" aria-live="off" />
          </div>
          <p className={styles.meterHint}>{!held ? "Hold both flippers as the ball returns to catch it." : !aimReady ? "Choose a target to start the timing meter." : "Launch on the lit band (40–60%) for a true shot."}</p>

          <div className={styles.controls} aria-label="Chapter controls">
            <div className={styles.aimRow} role="group" aria-label="Aim target">
              {aims.map(a => (
                <button
                  key={a.target}
                  type="button"
                  className={`${styles.aimBtn} ${aimReady && aim === a.target ? styles.aimActive : ""}`}
                  aria-pressed={aimReady && aim === a.target}
                  onClick={() => chooseTarget(a.target)}
                  disabled={!held || dialogOpen}
                  title={a.hint}
                >
                  <span className={styles.aimKey}>{a.key}</span>
                  {embedded && a.target === "west" ? "Practice seal" : a.label}
                </button>
              ))}
            </div>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.armBtn}
                disabled={armDisabled}
                onClick={() => { dispatch({ type: "arm-water" }); canvasRef.current?.focus({ preventScroll: true }); }}
              >
                {state.waterArmed ? "Water armed" : "Arm Water (W)"}
              </button>
              <button
                type="button"
                className={styles.launchBtn}
                disabled={launchDisabled}
                onClick={() => tableRef.current?.release()}
              >
                {held && !aimReady ? "Choose a target" : "Launch (Space)"}
              </button>
              <button
                type="button"
                className={styles.pauseBtn}
                disabled={(!playing && !paused) || externalPaused}
                onClick={() => setPausedBoth(!paused)}
              >
                {pausedEff ? "Resume" : "Pause (P)"}
              </button>
            </div>
            <div className={styles.flipperRow}>
              <button type="button" disabled={dialogOpen} className={styles.flipBtn} {...flipHandlers("left")} aria-label="Left flipper, hold A">
                ◀ HOLD · A
              </button>
              <button type="button" disabled={dialogOpen} className={styles.flipBtn} {...flipHandlers("right")} aria-label="Right flipper, hold D">
                HOLD · D ▶
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.journal} aria-label="Chapter journal" inert={dialogOpen || undefined}>
          <div className={styles.objective}>{chapterObjective(state)}</div>
          <dl className={styles.stats}>
            <div><dt>{embedded ? "Trial attempts" : "Integrity"}</dt><dd className={state.integrity === 1 ? styles.critical : ""}>{"●".repeat(state.integrity)}{"○".repeat(3 - state.integrity)} {state.integrity === 1 ? "— critical" : ""}</dd></div>
            <div><dt>Mana</dt><dd>{state.mana} / 3{embedded ? " (practice only)" : ""}</dd></div>
            <div><dt>Blessing</dt><dd>{state.learned ? (state.waterArmed ? "Water armed" : "Water learned") : "Not learned"}</dd></div>
            <div><dt>{embedded ? "Practice seal" : "Seals"}</dt><dd>{(embedded ? ["west"] : ["west", "east"]).map(id => <span key={id} className={state.seals.includes(id as "west" | "east") ? styles.sealDone : styles.sealOpen}>{id === "west" ? "I" : "II"} {state.seals.includes(id as "west" | "east") ? "quenched" : "burning"}</span>)}</dd></div>
          </dl>
          {embedded && <p className={styles.trialNote}>Failing all attempts costs 1 main integrity. Leaving costs nothing.</p>}
          <p className={styles.notice} aria-live="polite">{state.notice}</p>
          <details className={styles.help}>
            <summary>How to play</summary>
            <ol className={styles.howto}>
              <li>Choose a target (1–4) — fire seals burn an unarmed ball.</li>
              <li>Launch on the lit meter band (Space).</li>
              <li>Hold both flippers (A + D) to catch a falling ball.</li>
              <li>Press W to arm Water before each seal shot.</li>
            </ol>
          </details>
        </aside>
      </div>

      {state.phase === "lesson" && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="lesson-title">
            <p className={styles.dialogEyebrow}>Mamoru, shrine guardian</p>
            <h2 id="lesson-title" className={styles.dialogTitle}>The Trial of Elements</h2>
            <p className={styles.dialogText}>
              Water quenches flame; wind feeds it. {state.lessonMistakes === 0
                ? "Your first mistake is safe; later mistakes cost 1 integrity."
                : "Practice attempt used. Every further mistake costs 1 integrity."}
            </p>
            <p className={styles.dialogQuestion}>
              {state.lessonStep === 0
                ? "Which element quenches a fire seal?"
                : "And which element would feed a flame instead?"}
            </p>
            <p className={styles.lessonFeedback} role="status">{state.notice}</p>
            <p className={styles.dialogText}>Integrity: {state.integrity} / 3{state.integrity === 1 ? " — critical" : ""}</p>
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
            <button
              type="button"
              className={styles.leaveBtn}
              onClick={() => embedded ? emitResult("abandoned") : dispatch({ type: "leave-lesson" })}
            >
              {embedded ? "Leave trial (Esc) — the shrine will wait" : "Step away (Esc) — the shrine will wait"}
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
            <h2 id="won-title" className={styles.dialogTitle}>{embedded ? "Water Trial Mastered" : "Chapter Complete"}</h2>
            <p className={styles.dialogText}>
              {embedded
                ? "You learned water at the shrine and quenched the practice seal. Carry the blessing back to the main table — two fire seals await."
                : "You crossed the torii because you learned water at the shrine, carried it to both fire seals, and earned the gate's opening. Your learning opened the way."}
            </p>
            <div className={styles.choiceRow}>
              {embedded ? (
                <button type="button" className={styles.continueBtn} onClick={() => emitResult("mastered")}>
                  Carry Water back
                </button>
              ) : (
                <>
                  <button type="button" className={styles.continueBtn} onClick={retry}>
                    Play chapter again
                  </button>
                  <Link href="/" className={styles.leaveBtn}>Return to arcade</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {state.phase === "lost" && (
        <div className={styles.overlay}>
          <div ref={dialogRef} className={`${styles.dialog} ${styles.dialogLost}`} role="dialog" aria-modal="true" aria-labelledby="lost-title">
            <h2 id="lost-title" className={styles.dialogTitle}>{embedded ? "The Trial Failed" : "The Ball Shattered"}</h2>
            <p className={styles.dialogText}>{state.notice}</p>
            {embedded ? (
              <button type="button" className={styles.continueBtn} onClick={() => emitResult("failed")}>
                Return to main table
              </button>
            ) : (
              <button type="button" className={styles.continueBtn} onClick={retry}>
                {state.learned ? "Retry — keep your blessing" : "Retry chapter"}
              </button>
            )}
          </div>
        </div>
      )}

      {pausedEff && playing && (
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
