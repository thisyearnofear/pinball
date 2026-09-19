import { getFromStorage, setInStorage } from "@/utils/local-storage";

export type SealId = "west" | "east";
export type ChapterTarget = "shrine" | SealId | "gate";
export type ChapterPhase = "playing" | "lesson" | "blessing" | "gate-opening" | "won" | "lost";
export type DamageCause = "burn" | "drain";
export type ChapterState = {
  phase: ChapterPhase;
  integrity: number;
  mana: number;
  learned: boolean;
  waterArmed: boolean;
  seals: SealId[];
  lessonStep: number;
  lessonMistakes: number;
  notice: string;
  /** Why integrity was last lost — lets the coach explain the right mistake. */
  lastDamage: DamageCause | null;
};
export type ChapterEvent =
  | { type: "shrine" }
  | { type: "answer"; element: "water" | "fire" | "wind" }
  | { type: "leave-lesson" }
  | { type: "continue" }
  | { type: "arm-water" }
  | { type: "seal"; id: SealId }
  | { type: "gate" }
  | { type: "drain" }
  | { type: "ball-search" }
  | { type: "retry" };
export const CHAPTER_MEMORY_KEY = "pinball_water_shrine_blessing_v1";
export function createChapter(learned = false): ChapterState {
  return { phase:"playing", integrity:3, mana:learned ? 3 : 0, learned,
    waterArmed:false, seals:[], lessonStep:0, lessonMistakes:0,
    lastDamage:null,
    notice:learned ? "The water blessing is yours. Arm it before striking each fire seal." : "Aim for the water shrine. Learn its blessing before challenging the fire seals." };
}
function damage(s: ChapterState, cause: string, kind: DamageCause): ChapterState {
  const integrity = Math.max(0,s.integrity-1);
  return {...s, integrity, lastDamage:kind, phase: integrity === 0 ? "lost" : s.phase,
    notice: integrity === 0 ? `${cause} Your ball shattered. Retry with what you learned.` : `${cause} Integrity -1.${integrity===1 ? " Critical: one hit remaining." : ""}`};
}
export function chapterReducer(s: ChapterState, e: ChapterEvent): ChapterState {
  if(e.type === "retry") return createChapter(s.learned);
  if(s.phase === "lost" || s.phase === "won") return s;
  if(e.type === "continue") {
    if(s.phase !== "blessing" && s.phase !== "gate-opening") return s;
    return {...s, phase:"playing", notice:s.phase === "blessing" ? "Water quenches fire. Arm Water (W), then strike a seal. Each blessing costs 1 mana." : "Both seals are quenched. Aim through the open torii to complete the chapter."};
  }
  if(s.phase === "lesson") {
    if(e.type === "leave-lesson") return {...s,phase:"playing",lessonStep:0,notice:"The shrine will wait. Return when you are ready to learn."};
    if(e.type !== "answer") return s;
    const expected = s.lessonStep === 0 ? "water" : "wind";
    if(e.element !== expected) {
      const next = {...s,lessonStep:0,lessonMistakes:s.lessonMistakes+1};
      if(s.lessonMistakes===0) return {...next,notice:"A safe practice mistake. Water quenches flame; wind feeds it. Try water, then wind."};
      return damage(next,"The trial's warned ember struck after another wrong answer.","burn");
    }
    if(s.lessonStep===0) return {...s,lessonStep:1,notice:"Correct: water quenches fire. Which element would feed a flame instead?"};
    return {...s,phase:"blessing",learned:true,mana:3,waterArmed:false,notice:"Water blessing learned. Knowledge survives a shattered ball."};
  }
  if(s.phase !== "playing") return s;
  switch(e.type) {
    case "shrine": return s.learned ? {...s,mana:3,notice:"The shrine restores your mana to 3. Your learned blessing remains."} : {...s,phase:"lesson",lessonStep:0,notice:`Water quenches flame; wind feeds it. ${s.lessonMistakes === 0 ? "First mistake is safe. Later mistakes cost 1 integrity." : "Practice attempt used. Every further mistake costs 1 integrity."} Which element quenches a fire seal?`};
    case "arm-water":
      if(!s.learned) return {...s,notice:"Learn the water blessing at the shrine first."};
      if(s.waterArmed) return s;
      if(s.mana===0) return {...s,notice:"No mana. Aim for the shrine to refill."};
      return {...s,mana:s.mana-1,waterArmed:true,notice:"Water armed: your next burning seal will be quenched. Ordinary rebounds do not consume it."};
    case "seal": {
      if(s.seals.includes(e.id)) return s;
      if(!s.waterArmed) return damage(s,"A burning seal struck an unprotected ball. Arm Water before contact.","burn");
      const seals = [...s.seals,e.id];
      return {...s,seals,waterArmed:false,phase:seals.length===2 ? "gate-opening" : "playing",notice:seals.length===2 ? "Both fire seals are quenched. The torii opens." : "One seal quenched. Arm Water again for the other seal."};
    }
    case "gate": return s.seals.length===2 ? {...s,phase:"won",notice:"You crossed the torii by learning water and quenching both seals. Chapter complete."} : {...s,notice:"The torii is sealed. Learn Water and quench both fire seals first."};
    case "drain": return damage({...s,waterArmed:false},"The ball fell between the flippers. Hold both as it returns to cradle it.","drain");
    case "ball-search": return {...s,notice:"MAMORU freed a trapped ball. No integrity or mana lost. Choose a target to relaunch."};
    default: return s;
  }
}
export function chapterObjective(s: ChapterState): string {
  if(s.phase === "won") return "Chapter complete";
  if(s.phase === "lost") return "Ball shattered — your learning remains";
  if(!s.learned) return "1 / 3 · Enter the water shrine and learn its blessing";
  if(s.seals.length < 2) return `2 / 3 · Quench the fire seals (${s.seals.length}/2)`;
  return "3 / 3 · Cross the open torii";
}

export function loadLearnedBlessing(): boolean {
  try {
    return getFromStorage(CHAPTER_MEMORY_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveLearnedBlessing(learned: boolean): void {
  try {
    setInStorage(CHAPTER_MEMORY_KEY, learned ? "true" : "false");
  } catch {
    // storage may be denied; the blessing still lives in session state
  }
}
