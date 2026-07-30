/**
 * Immersion tuning — the single surface for every "feel" knob in the MAMORU
 * systems (docs/IMMERSION_SPEC.md). Playtest by editing this file under
 * `pnpm dev` — it hot-reloads, no rebuild. Grouped by system; each value has
 * a rationale so tuning is deliberate, not guesswork.
 *
 * Hard rules still apply: anything that touches physics (mood accuracy, world
 * gravity) stays bounded and tickCount/seed-derived. These are magnitudes only.
 */

export const IMMERSION = {
    /** A1 — the machine's emotional pacing. */
    mood: {
        /** Rally length before the machine gets edgy. Most drains land in 2–4s,
         *  so wary should feel earned, not default. */
        waryTimeAliveMs: 7000,
        /** Long rally = over-committed. Aligned with the rubber-band bias 0.7
         *  threshold (updateRubberBand) so mood and difficulty agree. */
        desperateTimeAliveMs: 15000,
        /** Consecutive fast drains before the guardian loses its composure. */
        enragedDrainStreak: 2,
        /** Smug spike window after a save: long enough to gloat, short enough
         *  not to linger after the ball is back in play. */
        smugAfterSaveMinMs: 400,
        smugAfterSaveMaxMs: 2000,
        /** Ball-this-close-to-the-gate reads as grief-adjacent (fallback; the
         *  kill cam sets grieving explicitly on the drain). */
        grievingNearDrain: 0.9,
        /** Bounded AI accuracy variance (±). Desperate over-commits, enraged
         *  gets sloppy. Must stay within the rubber-band precedent. */
        accuracyVariance: 0.05,
    },

    /** A2 — the signature kill cam. Score is frozen before this runs. */
    killCam: {
        /** Wall-clock length of the directed moment. */
        durationMs: 900,
        /** Time dilation. 0.18 is a deep, savor-it slow-mo (the ball is
         *  captured/static, so this shapes the camera push + world feel). */
        timeScale: 0.18,
        /** Music duck under the cam (lower = more dramatic vacuum). */
        duckLevel: 0.10,
        /** When the ball is released + the round ends. Matches durationMs so
         *  the sequence lands cleanly. */
        releaseDelayMs: 900,
    },

    /** The pre-existing near-drain anticipation slow-mo ("here it comes"),
     *  which sets up the kill cam on the decisive drain. */
    autoSlowMo: {
        /** Ball proximity (top/tableBottom) that triggers it. */
        proximity: 0.82,
        durationMs: 600,
        timeScale: 0.3,
    },

    /** B3 — the "audio dodge": bus silence on a near-drain save. */
    audioDodge: { durationMs: 200 },

    /** B3 — MAMORU's heartbeat. Tempos rise with panic; grieving stops it. */
    pulse: {
        lookaheadTickMs: 100,
        scheduleAheadS: 0.2,
        /** ~-18dB under the music loop. */
        gain: 0.125,
        /** Hotter moods hit a little louder. */
        intenseGain: 0.18,
        bpm: {
            calm: 60, smug: 60, wary: 90, desperate: 120, enraged: 120,
            /** 0 = the heartbeat stops dead. */
            grieving: 0,
        } as Record<string, number>,
    },

    /** B1 — when the machine starts reading your habits. */
    habits: {
        /** Nudges before you're readable at all. */
        minNudges: 10,
        /** A direction's share of nudges that makes you "predictable". */
        dominance: 0.6,
        /** Min gap between habit call-outs (and one-shot per direction). */
        calloutThrottleMs: 8000,
    },

    /** B1 — a best drain under this earns the machine's dread. */
    nemesisDrainMs: 6000,

    /** A4 — per-world gravity bending. Amplitude is lateral gravity as a
     *  fraction of GRAVITY (0.05 ≈ a ±3.4° roll). Period is in engine ticks
     *  (60/s). Tuned for "felt but fair"; adjust in playtest. */
    worlds: {
        pirateShip: { swayAmplitude: 0.05, swayPeriodTicks: 240 },
        spaceship: { gravityScale: 0.92, swayAmplitude: 0.02, swayPeriodTicks: 600 },
    },

    /** Shot-calling control scheme — the serve-based duel (replaces continuous
     *  nudging). Two isolated variants so each skill can be tested alone:
     *  - feint: outsmart MAMORU's reaction (full accuracy, no meter).
     *  - precision: call a lane + nail the timing meter (pre-committed guard).
     *  Core tension (feint): aim duration trades safety against the reaction race. */
    shotCalling: {
        /** Aim lanes (left/right), each embodied by a flipper. */
        lanes: 2,
        /** Human-scale reaction windows per difficulty (the time a player gets
         *  to perceive the guard, switch lane, and release). NOT the old AI
         *  polling intervals — those were sub-human for a player-facing duel. */
        reactionMs: { easy: 1200, medium: 800, hard: 500 },
        /** Precision variant: timing meter (marker oscillation, cycles/second). */
        meterSpeed: 0.9,
        /** Precision variant: sweet-spot half-width (0-1 of the half-range). */
        meterSweetSpot: 0.28,
        /** Lateral launch bias at full intent (fraction of base speed). */
        lateralStrength: 0.55,
        /** Max directional launch error at the meter's extreme (signed, deterministic). */
        maxAngleError: 0.6,
        /** Power lost at zero accuracy (off-center releases hit weaker). */
        maxPowerLoss: 0.3,
        /** Ticks to hold the 'SAVED' beat before re-serving (tick-based, so it is
         *  pause-safe and replay-safe). 72 ticks = 1.2s at 60fps. */
        savedHoldTicks: 72,
    },
} as const;

export type ImmersionTuning = typeof IMMERSION;
