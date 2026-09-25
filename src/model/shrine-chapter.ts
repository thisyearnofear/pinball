import { getFromStorage, setInStorage } from "@/utils/local-storage";
import {
  CHAPTERS,
  activeChapterId,
  type ChapterConfig,
  type ChapterId,
  type ChapterPhase,
  type ElementId,
  type SealId,
  type StoryView,
} from "@/model/chapters";

export type { ChapterId, ChapterPhase, ElementId, SealId } from "@/model/chapters";
export type { ChapterConfig, StoryView } from "@/model/chapters";

export type ChapterTarget = "shrine" | SealId | "gate";
export type DamageCause = "burn" | "drain";
export type ChapterState = {
  chapterId: ChapterId;
  phase: ChapterPhase;
  integrity: number;
  mana: number;
  learned: boolean;
  armed: boolean;
  seals: SealId[];
  lessonStep: number;
  lessonMistakes: number;
  notice: string;
  /** Why integrity was last lost — lets the coach explain the right mistake. */
  lastDamage: DamageCause | null;
};
export type ChapterEvent =
  | { type: "shrine" }
  | { type: "answer"; element: ElementId }
  | { type: "leave-lesson" }
  | { type: "continue" }
  | { type: "arm" }
  | { type: "seal"; id: SealId }
  | { type: "gate" }
  | { type: "drain" }
  | { type: "ball-search" }
  | { type: "retry" };

export const SEALS_TOTAL = 2;

export function createChapter(chapterId: ChapterId = "water-shrine", learned = false): ChapterState {
  const copy = CHAPTERS[chapterId].copy;
  return { chapterId, phase: "playing", integrity: 3, mana: learned ? 3 : 0, learned,
    armed: false, seals: [], lessonStep: 0, lessonMistakes: 0,
    lastDamage: null,
    notice: learned ? copy.startLearned : copy.startFresh };
}

function damage(s: ChapterState, cause: string, kind: DamageCause): ChapterState {
  const integrity = Math.max(0,s.integrity-1);
  return {...s, integrity, lastDamage:kind, phase: integrity === 0 ? "lost" : s.phase,
    notice: integrity === 0 ? `${cause} Your ball shattered. Retry with what you learned.` : `${cause} Integrity -1.${integrity===1 ? " Critical: one hit remaining." : ""}`};
}
export function chapterReducer(s: ChapterState, e: ChapterEvent): ChapterState {
  const { copy, lessonExpected } = CHAPTERS[s.chapterId];
  if(e.type === "retry") return createChapter(s.chapterId, s.learned);
  if(s.phase === "lost" || s.phase === "won") return s;
  if(e.type === "continue") {
    if(s.phase !== "blessing" && s.phase !== "gate-opening") return s;
    return {...s, phase:"playing", notice:s.phase === "blessing" ? copy.continueBlessing : copy.continueGate};
  }
  if(s.phase === "lesson") {
    if(e.type === "leave-lesson") return {...s,phase:"playing",lessonStep:0,notice:copy.leaveLesson};
    if(e.type !== "answer") return s;
    const expected = lessonExpected[s.lessonStep];
    if(e.element !== expected) {
      const next = {...s,lessonStep:0,lessonMistakes:s.lessonMistakes+1};
      if(s.lessonMistakes===0) return {...next,notice:copy.lessonMistakeSafe};
      return damage(next,copy.lessonMistakeHit,"burn");
    }
    if(s.lessonStep===0) return {...s,lessonStep:1,notice:copy.lessonCorrectFirst};
    return {...s,phase:"blessing",learned:true,mana:3,armed:false,notice:copy.lessonDone};
  }
  if(s.phase !== "playing") return s;
  switch(e.type) {
    case "shrine": return s.learned ? {...s,mana:3,notice:copy.shrineRefill} : {...s,phase:"lesson",lessonStep:0,notice:copy.lessonPrompt(s.lessonMistakes === 0)};
    case "arm":
      if(!s.learned) return {...s,notice:copy.armNeedLearn};
      if(s.armed) return s;
      if(s.mana===0) return {...s,notice:copy.armNoMana};
      return {...s,mana:s.mana-1,armed:true,notice:copy.armOk};
    case "seal": {
      if(s.seals.includes(e.id)) return s;
      if(!s.armed) return damage(s,copy.sealBurn,"burn");
      const seals = [...s.seals,e.id];
      return {...s,seals,armed:false,phase:seals.length===SEALS_TOTAL ? "gate-opening" : "playing",notice:seals.length===SEALS_TOTAL ? copy.sealBoth : copy.sealOne};
    }
    case "gate": return s.seals.length===SEALS_TOTAL ? {...s,phase:"won",notice:copy.gateWin} : {...s,notice:copy.gateLocked};
    case "drain": return damage({...s,armed:false},copy.drain,"drain");
    case "ball-search": return {...s,notice:copy.ballSearch};
    default: return s;
  }
}
export function chapterObjective(s: ChapterState): string {
  return CHAPTERS[s.chapterId].copy.objective({
    phase: s.phase, learned: s.learned, seals: s.seals.length, total: SEALS_TOTAL,
  });
}

// ── Story vault (durable progress across chapters) ─────────────

/** What survives between sessions: knowledge, quenched/rung seals, wins — never mana. */
export type ChapterRun = { learned: boolean; seals: SealId[] };
export type StoryVault = {
  version: 1;
  blessings: ChapterId[];
  completed: ChapterId[];
  current: (ChapterRun & { chapterId: ChapterId }) | null;
};

export const STORY_VAULT_KEY = "pinball_story_vault_v1";
// Legacy single-chapter keys, read once and folded into the vault.
const LEGACY_PROGRESS_KEY = "pinball_water_shrine_progress_v1";
const LEGACY_BLESSING_KEY = "pinball_water_shrine_blessing_v1";

const EMPTY_VAULT: StoryVault = { version: 1, blessings: [], completed: [], current: null };

function isChapterId(v: unknown): v is ChapterId {
  return v === "water-shrine" || v === "wind-ridge";
}
function sanitizeSeals(v: unknown): SealId[] {
  return Array.isArray(v) ? v.filter((id): id is SealId => id === "west" || id === "east") : [];
}

function migrateLegacyVault(): StoryVault | null {
  const rawProgress = getFromStorage(LEGACY_PROGRESS_KEY);
  const rawBlessing = getFromStorage(LEGACY_BLESSING_KEY);
  if (!rawProgress && !rawBlessing) return null;
  const vault: StoryVault = { ...EMPTY_VAULT, blessings: [], completed: [], current: null };
  if (rawBlessing === "true") vault.blessings.push("water-shrine");
  if (rawProgress && rawProgress !== "null") {
    try {
      const parsed = JSON.parse(rawProgress) as { learned?: unknown; seals?: unknown; won?: unknown };
      // Same rejection rule as before: a win was cleared on write, and seals
      // without the blessing are corrupt — never loosen to "fix" a load issue.
      if (parsed && !parsed.won && parsed.learned === true) {
        const seals = sanitizeSeals(parsed.seals);
        vault.current = { chapterId: "water-shrine", learned: true, seals };
        if (!vault.blessings.includes("water-shrine")) vault.blessings.push("water-shrine");
      }
    } catch {
      // corrupt legacy blob: migration simply finds nothing to carry
    }
  }
  return vault;
}

/**
 * Corrupt or impossible vault data reads as an empty vault — the same rule
 * the legacy single-chapter loader used: seals cannot exist without the
 * blessing, unknown chapter ids are junk, and completed ⊆ blessings.
 */
export function loadVault(): StoryVault {
  try {
    const raw = getFromStorage(STORY_VAULT_KEY);
    if (raw && raw !== "null") {
      const parsed = JSON.parse(raw) as Partial<StoryVault> | null;
      if (parsed && parsed.version === 1) {
        const blessings = Array.isArray(parsed.blessings) ? parsed.blessings.filter(isChapterId) : [];
        const completed = (Array.isArray(parsed.completed) ? parsed.completed.filter(isChapterId) : [])
          .filter((id) => blessings.includes(id));
        const cur = parsed.current;
        let current: StoryVault["current"] = null;
        if (cur && isChapterId(cur.chapterId) && !completed.includes(cur.chapterId)) {
          const seals = sanitizeSeals(cur.seals);
          if (cur.learned === true) {
            current = { chapterId: cur.chapterId, learned: true, seals };
            if (!blessings.includes(cur.chapterId)) blessings.push(cur.chapterId);
          } else if (seals.length === 0) {
            current = { chapterId: cur.chapterId, learned: false, seals: [] };
          }
        }
        return { version: 1, blessings, completed, current };
      }
    }
    const migrated = migrateLegacyVault();
    if (migrated) {
      saveVault(migrated);
      return migrated;
    }
    return { ...EMPTY_VAULT, blessings: [], completed: [], current: null };
  } catch {
    return { ...EMPTY_VAULT, blessings: [], completed: [], current: null };
  }
}

export function saveVault(v: StoryVault): void {
  try {
    setInStorage(STORY_VAULT_KEY, JSON.stringify(v));
  } catch {
    // storage may be denied; the run still lives for this session
  }
}

export function blessingKnown(chapterId: ChapterId): boolean {
  return loadVault().blessings.includes(chapterId);
}

/** Record that a chapter's blessing was learned, without touching the run. */
export function markBlessingLearned(chapterId: ChapterId): void {
  const v = loadVault();
  if (!v.blessings.includes(chapterId)) {
    saveVault({ ...v, blessings: [...v.blessings, chapterId] });
  }
}

/** The chapter a fresh story run should open on. */
export function activeChapter(): ChapterId {
  return activeChapterId(loadVault().completed);
}

/** The lobby's view of the story: active chapter, its durable run, the wins. */
export function loadStoryView(): StoryView {
  const v = loadVault();
  const chapterId = activeChapterId(v.completed);
  const cur = v.current?.chapterId === chapterId ? v.current : null;
  return {
    chapter: CHAPTERS[chapterId],
    run: cur ? { learned: cur.learned, seals: cur.seals } : null,
    completed: v.completed,
  };
}

/**
 * Persist the run after every accepted transition so the lobby can offer to
 * continue it. A win completes the chapter and unlocks the next; a shattered
 * ball keeps only knowledge — exactly what a retry keeps — so the lobby never
 * offers progress a retry would not honour.
 */
export function recordRun(s: ChapterState): void {
  const v = loadVault();
  const blessings = v.blessings.includes(s.chapterId) || s.learned
    ? [...new Set([...v.blessings, s.chapterId] as ChapterId[])]
    : v.blessings;
  if (s.phase === "won") {
    saveVault({
      version: 1,
      blessings,
      completed: [...new Set([...v.completed, s.chapterId] as ChapterId[])],
      current: null,
    });
    return;
  }
  const seals = s.phase === "lost" ? [] : s.seals;
  saveVault({
    version: 1,
    blessings,
    completed: v.completed,
    current: { chapterId: s.chapterId, learned: s.learned, seals },
  });
}

export function clearRun(chapterId: ChapterId): void {
  const v = loadVault();
  if (v.current?.chapterId === chapterId) {
    saveVault({ ...v, current: null });
  }
}

/** The durable mid-run progress for one chapter, or null. */
export function loadRun(chapterId: ChapterId): ChapterRun | null {
  const v = loadVault();
  if (!v.current || v.current.chapterId !== chapterId || !v.current.learned) return null;
  return { learned: true, seals: v.current.seals };
}

/**
 * The state a story run starts from: mid-run progress when there is any,
 * otherwise the plain blessing-aware start. Mana is never persisted — the
 * shrine refills it — so a resume grants enough to arm for the remaining
 * seals rather than soft-locking the player behind a detour.
 */
export function resumeChapterState(chapterId: ChapterId, p: ChapterRun | null): ChapterState {
  if (!p || !p.learned) return createChapter(chapterId, blessingKnown(chapterId));
  const copy = CHAPTERS[chapterId].copy;
  return {
    ...createChapter(chapterId, true),
    seals: p.seals,
    mana: Math.max(1, 3 - p.seals.length),
    notice: p.seals.length === 1 ? copy.resumeOne : copy.resumeFresh,
  };
}
