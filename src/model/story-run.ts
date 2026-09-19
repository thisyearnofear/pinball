import {
    chapterReducer,
    createChapter,
    loadChapterProgress,
    resumeChapterState,
    type ChapterProgress,
    type ChapterState,
    type ChapterEvent,
} from "@/model/shrine-chapter";

export type TrialOutcome = "mastered" | "failed" | "abandoned";
export type StoryState = ChapterState & { encounterId: number };

export type StoryEvent =
    Exclude<ChapterEvent, { type: "answer" } | { type: "shrine" } | { type: "leave-lesson" }>
    | { type: "shrine" }
    | { type: "trial-result"; encounterId: number; outcome: TrialOutcome }
    | { type: "refill"; encounterId: number };

export function createStoryState(learned = false, progress: ChapterProgress | null = null): StoryState {
    if (progress?.learned) {
        // Mid-run resume: seals and knowledge survive, mana is granted fresh.
        return { ...resumeChapterState(progress), encounterId: 0 };
    }
    return {
        ...createChapter(learned),
        encounterId: 0,
        notice: learned
            ? "Water remembered. Arm Water (W), then strike both marked fire seals."
            : "Reach the marked water shrine. MAMORU will teach you Water.",
    };
}

/**
 * Coaching line for a lost trial, appended to the integrity notice. The only
 * failing answer is WIND-first (WATER is correct at step 0), so the coaching
 * targets the actual misconception: wind FEEDS fire.
 */
function trialCoaching(): string {
    return "Wind feeds the flame — water is what quenches it. Water first, then wind.";
}

export function storyReducer(s: StoryState, e: StoryEvent): StoryState {
    // Retry honours durable progress: what the lobby's Continue would restore,
    // a retry restores too, so the two paths never disagree.
    if (e.type === "retry") {
        return { ...createStoryState(s.learned, loadChapterProgress()), encounterId: s.encounterId + 1 };
    }
    if (s.phase === "won" || s.phase === "lost") return s;
    if (e.type === "trial-result" || e.type === "refill") {
        if (s.phase !== "lesson" || e.encounterId !== s.encounterId) return s;
        if (e.type === "refill") {
            return s.learned
                ? { ...s, phase: "playing", mana: 3, notice: "Mana restored. The main table awaits." }
                : s;
        }
        if (e.outcome === "abandoned") {
            return { ...s, phase: "playing", notice: "The shrine will wait. No penalty for stepping away." };
        }
        if (e.outcome === "failed") {
            const integrity = Math.max(0, s.integrity - 1);
            return {
                ...s,
                integrity,
                phase: integrity === 0 ? "lost" : "playing",
                notice: integrity === 0
                    ? `The trial exhausted your last integrity. Retry with what you learned. ${trialCoaching()}`
                    : `The trial ended. Integrity -1; your main-table progress remains. ${trialCoaching()}`,
            };
        }
        return {
            ...s,
            phase: "blessing",
            learned: true,
            mana: 3,
            notice: "Water mastered. Carry the blessing back to the main table.",
        };
    }
    if (s.phase === "lesson") return s;
    if (e.type === "shrine") {
        return s.phase === "playing"
            ? {
                ...s,
                phase: "lesson",
                encounterId: s.encounterId + 1,
                notice: s.learned
                    ? "Welcome back. Refill mana or practice the Water Trial."
                    : "MAMORU offers a contained Water Trial. The main ball is safely captured.",
            }
            : s;
    }
    const next = chapterReducer(s, e);
    if (next === s) return s;
    const result = { ...next, encounterId: s.encounterId };
    if (e.type === "continue" && result.phase === "playing") {
        result.notice = s.phase === "blessing"
            ? "Water learned. Press W or Arm Water, then hit both main-table seals."
            : "The main torii is open. Reach its marked passage to finish.";
    }
    if (e.type === "drain" && result.phase !== "lost") {
        result.notice = "Ball drained. Integrity -1. Press Space or Launch to try again.";
    }
    if (e.type === "ball-search") {
        result.notice = "MAMORU recovered a trapped ball. No resources lost. Press Launch to continue.";
    }
    return result;
}
