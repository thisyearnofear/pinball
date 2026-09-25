import {
    activeChapterId,
    CHAPTERS,
    type ChapterId,
} from "@/model/chapters";
import {
    blessingKnown,
    chapterReducer,
    createChapter,
    loadRun,
    loadVault,
    resumeChapterState,
    type ChapterEvent,
    type ChapterRun,
    type ChapterState,
} from "@/model/shrine-chapter";

export type TrialOutcome = "mastered" | "failed" | "abandoned";
export type StoryState = ChapterState & { encounterId: number };

export type StoryEvent =
    Exclude<ChapterEvent, { type: "answer" } | { type: "shrine" } | { type: "leave-lesson" }>
    | { type: "shrine" }
    | { type: "trial-result"; encounterId: number; outcome: TrialOutcome }
    | { type: "refill"; encounterId: number };

export type StoryStart = {
    chapterId?: ChapterId;
    learned?: boolean;
    run?: ChapterRun | null;
};

/**
 * The state a fresh story run opens on: the active (first uncompleted)
 * chapter, resuming its durable run when one exists.
 */
export function createStoryState(start: StoryStart = {}): StoryState {
    const vault = loadVault();
    const chapterId: ChapterId = start.chapterId ?? activeChapterId(vault.completed);
    const run = start.run !== undefined ? start.run : (vault.current?.chapterId === chapterId ? { learned: vault.current.learned, seals: vault.current.seals } : null);
    const learned = start.learned ?? run?.learned ?? blessingKnown(chapterId);
    const trial = CHAPTERS[chapterId].copy.trial;
    if (run?.learned) {
        // Mid-run resume: seals and knowledge survive, mana is granted fresh.
        return { ...resumeChapterState(chapterId, run), encounterId: 0 };
    }
    return {
        ...createChapter(chapterId, learned),
        encounterId: 0,
        notice: learned ? trial.startLearned : trial.startFresh,
    };
}

export function storyReducer(s: StoryState, e: StoryEvent): StoryState {
    const copy = CHAPTERS[s.chapterId].copy;
    // Retry honours durable progress: what the lobby's Continue would restore,
    // a retry restores too, so the two paths never disagree.
    if (e.type === "retry") {
        return {
            ...createStoryState({ chapterId: s.chapterId, learned: s.learned, run: loadRun(s.chapterId) }),
            encounterId: s.encounterId + 1,
        };
    }
    if (s.phase === "won" || s.phase === "lost") return s;
    if (e.type === "trial-result" || e.type === "refill") {
        if (s.phase !== "lesson" || e.encounterId !== s.encounterId) return s;
        if (e.type === "refill") {
            return s.learned
                ? { ...s, phase: "playing", mana: 3, notice: copy.trial.refill }
                : s;
        }
        if (e.outcome === "abandoned") {
            return { ...s, phase: "playing", notice: copy.trial.abandoned };
        }
        if (e.outcome === "failed") {
            const integrity = Math.max(0, s.integrity - 1);
            return {
                ...s,
                integrity,
                phase: integrity === 0 ? "lost" : "playing",
                notice: integrity === 0
                    ? `${copy.trial.exhausted} ${copy.trial.coaching}`
                    : `${copy.trial.failed} ${copy.trial.coaching}`,
            };
        }
        return {
            ...s,
            phase: "blessing",
            learned: true,
            mana: 3,
            notice: copy.trial.mastered,
        };
    }
    if (s.phase === "lesson") return s;
    if (e.type === "shrine") {
        return s.phase === "playing"
            ? {
                ...s,
                phase: "lesson",
                encounterId: s.encounterId + 1,
                notice: s.learned ? copy.trial.enterLearned : copy.trial.enterFresh,
            }
            : s;
    }
    const next = chapterReducer(s, e);
    if (next === s) return s;
    const result = { ...next, encounterId: s.encounterId };
    if (e.type === "continue" && result.phase === "playing") {
        result.notice = s.phase === "blessing"
            ? copy.trial.continueBlessing
            : copy.trial.continueGate;
    }
    if (e.type === "drain" && result.phase !== "lost") {
        result.notice = copy.trial.drain;
    }
    if (e.type === "ball-search") {
        result.notice = copy.trial.ballSearch;
    }
    return result;
}
