"use client";

import { useEffect, useRef, useState } from "react";
import { EventType, type Rive, type RiveParameters } from "@rive-app/canvas-lite";

/**
 * One lazy-loaded Rive runtime for every Rive artboard in the app. The WASM
 * (~300KB) is only fetched when a Rive component actually mounts — arcade
 * players never pay for the story HUD's chrome.
 */
let runtimePromise: Promise<typeof import("@rive-app/canvas-lite")> | null = null;
function loadRuntime(): Promise<typeof import("@rive-app/canvas-lite")> {
    if (!runtimePromise) {
        runtimePromise = import("@rive-app/canvas-lite");
    }
    return runtimePromise;
}

export type RiveArtboardProps = {
    /** Path under /public, e.g. "rive/hud.riv". */
    src: string;
    /** Which artboard inside the file to show. */
    artboard: string;
    /** View model property writes, applied on every change. */
    data?: Record<string, number | boolean>;
    /** Fire a view-model boolean 1→0 pulse (one-shot animations). */
    pulse?: string | null;
    className?: string;
    style?: React.CSSProperties;
    ariaLabel?: string;
    /** Reports whether the artboard is actually rendering (false → show DOM fallback). */
    onReady?: (ok: boolean) => void;
};

const prefersReducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

/**
 * A single Rive artboard as a canvas, driven by view-model values. Falls back
 * to rendering nothing (the host supplies a DOM fallback beside it) when the
 * runtime or asset fails — a HUD must not depend on an animation CDN shipping.
 */
export function RiveArtboard(props: RiveArtboardProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const riveRef = useRef<Rive | null>(null);
    const [ready, setReady] = useState(false);
    const dataRef = useRef(props.data);
    dataRef.current = props.data;

    useEffect(() => {
        if (prefersReducedMotion()) {
            props.onReady?.(false);
            return;
        }
        let cancelled = false;
        let instance: Rive | null = null;

        (async () => {
            try {
                const mod = await loadRuntime();
                if (cancelled || !canvasRef.current) return;
                const params: RiveParameters = {
                    src: props.src,
                    canvas: canvasRef.current,
                    artboard: props.artboard,
                    // Every artboard in scene.rml names its machine "SM".
                    // Without this the runtime plays a linear animation and
                    // no view-model binding ever applies. (canvas-lite takes
                    // `stateMachine` singular; the plural is deprecated and
                    // silently ignored by the WASM runtime.)
                    stateMachine: "SM",
                    autoplay: true,
                    autoBind: true,
                };
                instance = new mod.Rive(params);
                instance.on(EventType.Load, () => {
                    if (cancelled) return;
                    riveRef.current = instance;
                    setReady(true);
                    props.onReady?.(true);
                });
                instance.on(EventType.LoadError, () => {
                    setReady(true);
                    props.onReady?.(false);
                });
            } catch {
                // WASM or asset failure: stay in fallback mode silently.
                if (!cancelled) {
                    setReady(true);
                    props.onReady?.(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            try { instance?.stop(); } catch {}
            try { instance?.cleanup(); } catch {}
            riveRef.current = null;
        };
        // Rebuild only when the asset or artboard changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.src, props.artboard]);

    // Apply view-model writes whenever the caller's values change.
    useEffect(() => {
        const rive = riveRef.current;
        if (!rive || !ready) return;
        try {
            const vmi = rive.viewModelInstance;
            if (!vmi) return;
            for (const [name, value] of Object.entries(props.data ?? {})) {
                if (typeof value === "boolean") {
                    const prop = vmi.boolean(name);
                    if (prop) prop.value = value;
                } else {
                    const prop = vmi.number(name);
                    if (prop) prop.value = value;
                }
            }
            if (props.pulse) {
                const prop = vmi.boolean(props.pulse);
                if (prop) {
                    prop.value = true;
                    window.setTimeout(() => { try { prop.value = false; } catch {} }, 80);
                }
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        } catch {
            // Property-name drift between riv and host: fail visible-but-plain.
        }
    }, [ready, props.data, props.pulse]);

    return (
        <canvas
            ref={canvasRef}
            className={props.className}
            style={{ display: "block", ...props.style }}
            width={props.style?.width as number | undefined}
            height={props.style?.height as number | undefined}
            aria-label={props.ariaLabel}
            role={props.ariaLabel ? "img" : undefined}
            data-rive-ready={ready || undefined}
        />
    );
}
