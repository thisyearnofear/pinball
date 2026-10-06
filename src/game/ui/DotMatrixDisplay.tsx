/**
 * MAMORU's dot-matrix display: taunts, moods and verdicts as lit dots, like the
 * DMD on a real cabinet. Text (kanji included) is drawn at dot resolution on an
 * offscreen canvas, thresholded, then painted as round dots. Long lines
 * marquee; new lines wipe in. Reduced motion: static, no wipe or scroll.
 *
 * Cosmetic only — reads display state, never touches the run.
 */
import React, { useEffect, useRef } from "react";

export const DMD_COLS = 128;
export const DMD_ROWS = 20;
const PITCH = 3; // CSS px per dot
const WIPE_MS = 260;
const SCROLL_DOTS_PER_S = 28;
const GAP_DOTS = 24;

/** Lit-dot mask from canvas alpha. Pure (exported for tests). */
export function rasterizeDots(alpha: ArrayLike<number>, cols: number, rows: number, threshold = 110): Uint8Array {
    const out = new Uint8Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) out[i] = alpha[i * 4 + 3] >= threshold ? 1 : 0;
    return out;
}

/** Horizontal offset (dots) for a marquee at time t; 0 when the text fits. Pure. */
export function marqueeOffset(textDots: number, cols: number, tMs: number, dotsPerS = SCROLL_DOTS_PER_S): number {
    if (textDots <= cols) return 0;
    const span = textDots + GAP_DOTS;
    return Math.floor(((tMs / 1000) * dotsPerS) % span);
}

/** Largest font size in [min, max] whose measured width fits `cols`; `min` if none do. Pure. */
export function fitFontPx(max: number, min: number, cols: number, measure: (px: number) => number): number {
    for (let px = max; px > min; px--) if (measure(px) <= cols) return px;
    return min;
}

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Props = {
    text: string;
    color: string;
    /** Bump to replay the wipe-in for the same text (e.g. a repeated taunt). */
    flashKey?: number;
    style?: React.CSSProperties;
};

export function DotMatrixDisplay({ text, color, flashKey = 0, style }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext?.("2d");
        if (!canvas || !ctx) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = DMD_COLS * PITCH * dpr;
        canvas.height = DMD_ROWS * PITCH * dpr;

        // Rasterise the whole line once at dot resolution. Shrink to fit first;
        // only lines still too wide marquee (reduced motion shrinks further
        // instead, so nothing is cut off).
        const reduced = prefersReducedMotion();
        const probe = document.createElement("canvas").getContext("2d");
        if (!probe) return;
        const fontFor = (px: number) => `bold ${px}px "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", Meiryo, system-ui, sans-serif`;
        const fontPx = fitFontPx(DMD_ROWS - 6, reduced ? 7 : 11, DMD_COLS - 4, (px) => { probe.font = fontFor(px); return probe.measureText(text).width; });
        const font = fontFor(fontPx);
        probe.font = font;
        const textDots = Math.ceil(probe.measureText(text).width) + 2;
        const fits = textDots <= DMD_COLS;
        const srcCols = fits ? DMD_COLS : textDots + GAP_DOTS;
        const src = document.createElement("canvas");
        src.width = srcCols;
        src.height = DMD_ROWS;
        const sctx = src.getContext("2d");
        if (!sctx) return;
        sctx.font = font;
        sctx.textBaseline = "middle";
        sctx.fillStyle = "#fff";
        sctx.fillText(text, fits ? Math.floor((DMD_COLS - textDots) / 2) + 1 : 1, DMD_ROWS / 2 + 1);
        const mask = rasterizeDots(sctx.getImageData(0, 0, srcCols, DMD_ROWS).data, srcCols, DMD_ROWS);

        const r = PITCH * dpr * 0.36;
        let raf = 0;
        let start = -1;

        const draw = (offset: number, wipe: number) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let y = 0; y < DMD_ROWS; y++) {
                for (let x = 0; x < DMD_COLS; x++) {
                    const sx = (x + offset) % srcCols;
                    const lit = x < wipe && mask[y * srcCols + sx] === 1;
                    ctx.globalAlpha = lit ? 1 : 0.12;
                    ctx.fillStyle = lit ? color : "#3a2a18";
                    ctx.beginPath();
                    ctx.arc((x + 0.5) * PITCH * dpr, (y + 0.5) * PITCH * dpr, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        };

        // Full frame now, so the panel is never blank even if frames are
        // starved; the wipe/marquee then animate from the first rAF tick.
        draw(0, DMD_COLS);
        if (reduced) return;
        const tick = (now: number) => {
            if (start < 0) start = now;
            const t = now - start;
            const wipe = Math.min(DMD_COLS, Math.floor((t / WIPE_MS) * DMD_COLS));
            draw(marqueeOffset(textDots, DMD_COLS, Math.max(0, t - 900)), wipe);
            if (!fits || wipe < DMD_COLS) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [text, color, flashKey]);

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                padding: 4,
                borderRadius: 6,
                background: "linear-gradient(#0b0703, #140c05)",
                border: "1px solid rgba(255,140,40,0.35)",
                boxShadow: `0 0 18px ${color}33, inset 0 0 10px rgba(0,0,0,0.9)`,
                lineHeight: 0,
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                aria-hidden
                style={{ width: DMD_COLS * PITCH, height: DMD_ROWS * PITCH, maxWidth: "100%", filter: `drop-shadow(0 0 2px ${color})` }}
            />
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{text}</span>
        </div>
    );
}
