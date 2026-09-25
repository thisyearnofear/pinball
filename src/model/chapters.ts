// Chapter registry: everything narrative, cosmetic, and table-bound that the
// story engine reads per chapter. The reducer stays one machine; adding a
// chapter means adding a config here, not a code path.

export type ChapterId = "water-shrine" | "wind-ridge";
export type ElementId = "water" | "fire" | "wind";
export type SealId = "west" | "east";

export type ChapterPhase =
  | "playing"
  | "lesson"
  | "blessing"
  | "gate-opening"
  | "won"
  | "lost";

export type ChapterObjectiveParams = {
  phase: ChapterPhase;
  learned: boolean;
  seals: number;
  total: number;
};

export type ChapterCopy = {
  startFresh: string;
  startLearned: string;
  continueBlessing: string;
  continueGate: string;
  leaveLesson: string;
  lessonPrompt: (firstTry: boolean) => string;
  lessonMistakeSafe: string;
  lessonMistakeHit: string;
  lessonCorrectFirst: string;
  lessonDone: string;
  shrineRefill: string;
  armNeedLearn: string;
  armNoMana: string;
  armOk: string;
  sealBurn: string;
  sealOne: string;
  sealBoth: string;
  gateWin: string;
  gateLocked: string;
  drain: string;
  ballSearch: string;
  resumeOne: string;
  resumeFresh: string;
  objective: (p: ChapterObjectiveParams) => string;
  trial: {
    startFresh: string;
    startLearned: string;
    enterFresh: string;
    enterLearned: string;
    refill: string;
    abandoned: string;
    failed: string;
    exhausted: string;
    coaching: string;
    mastered: string;
    continueBlessing: string;
    continueGate: string;
    drain: string;
    ballSearch: string;
  };
};

export type ChapterConfig = {
  id: ChapterId;
  name: string;
  tagline: string;
  glyph: string;
  /** "r,g,b" triple the DOM/HUD tints interpolate from. */
  tintRgb: string;
  /** Light text and dark ink used on tint-filled buttons. */
  tintText: string;
  tintInk: string;
  verb: { name: string; key: string };
  /** Element answers the lesson expects, in order. */
  lessonExpected: ElementId[];
  /** Indices into the table's bumper list — which bumpers are the seals. */
  sealBumpers: [number, number];
  targets: { shrine: string; sealI: string; sealII: string; gate: string };
  /** Playfield marker captions drawn over the physics targets. */
  markers: {
    shrineLabel: string;
    sealDoneGlyph: string;
    sealHotGlyph: string;
    sealWord: string;
    sealPlural: string;
    sealDoneWord: string;
    sealHotWord: string;
    gateOpenLabel: string;
    gateSealedLabel: string;
    gateOpenSub: string;
    gateSealedSub: string;
  };
  /** Shrine-encounter and terminal dialog copy. */
  overlay: {
    shrineHeading: string;
    shrinePractice: string;
    shrineOffer: string;
    trialLearned: string;
    trialFresh: string;
    blessingTitle: string;
    gateTitle: string;
    continueBlessing: string;
    continueGate: string;
    winTitle: string;
    trialName: string;
    trialIntro: string;
    questions: [string, string];
    blessingBody: string;
    gateBody: string;
    wonEmbedded: string;
    wonFull: string;
    carryBack: string;
    practiceTarget: string;
  };
  /** Lobby chapter-card copy. */
  /** Lobby chapter-card progress line (the pitch is `tagline`). */
  lobby: {
    progressLine: (seals: number, total: number) => string;
  };
  /** Aim-card hints under each target label. */
  hints: { shrine: string; seal: string; gate: string };
  /** On-table coach cues — the teaching sentences, chapter-worded. */
  coach: { shrineLine: string; burnLine: string; finishLine: string };
  blessingWord: { armed: string; learned: string; none: string };
  copy: ChapterCopy;
};

const WATER_SHRINE: ChapterConfig = {
  id: "water-shrine",
  name: "The Water Shrine",
  tagline: "Learn a blessing. Quench two seals. Earn passage through the torii.",
  glyph: "水",
  tintRgb: "103,232,249",
  tintText: "#bff3ff",
  tintInk: "#06202a",
  verb: { name: "Water", key: "W" },
  lessonExpected: ["water", "wind"],
  sealBumpers: [0, 1],
  targets: {
    shrine: "Water Shrine",
    sealI: "Fire Seal I",
    sealII: "Fire Seal II",
    gate: "Torii Gate",
  },
  markers: {
    shrineLabel: "水 SHRINE",
    sealDoneGlyph: "水",
    sealHotGlyph: "火",
    sealWord: "SEAL",
    sealPlural: "Seals",
    sealDoneWord: "quenched",
    sealHotWord: "burning",
    gateOpenLabel: "鳥居 OPEN",
    gateSealedLabel: "鳥居 SEALED",
    gateOpenSub: "cross to finish",
    gateSealedSub: "2 seals",
  },
  overlay: {
    shrineHeading: "The Water Shrine",
    shrinePractice:
      "MAMORU can restore your mana — or you may practice the Water Trial again.",
    shrineOffer:
      "MAMORU offers a contained Water Trial: a short lesson and one practice seal.",
    trialLearned: "Practice the Water Trial",
    trialFresh: "Begin the Water Trial",
    blessingTitle: "The Blessing of Water 水",
    gateTitle: "The Torii Opens 鳥居",
    continueBlessing: "Continue — carry Water to the seals",
    continueGate: "Continue — cross the open torii",
    winTitle: "Chapter Complete — you crossed the torii",
    trialName: "Water Trial",
    trialIntro: "Water quenches flame; wind feeds it.",
    questions: [
      "Which element quenches a fire seal?",
      "And which element would feed a flame instead?",
    ],
    blessingBody:
      "You answered truly. The water blessing is yours — carry it to the two fire seals. " +
      "Arm Water (W) before each strike; each warding costs 1 mana, and the shrine refills it. " +
      "This knowledge survives even a shattered ball.",
    gateBody:
      "Both seals lie quenched and quiet. The vermilion cross-line fades — the way through " +
      "the torii is open. One true shot remains.",
    wonEmbedded:
      "You learned water at the shrine and quenched the practice seal. Carry the blessing " +
      "back to the main table — two fire seals await.",
    wonFull:
      "You crossed the torii because you learned water at the shrine, carried it to both " +
      "fire seals, and earned the gate's opening. Your learning opened the way.",
    carryBack: "Carry Water back",
    practiceTarget: "Practice seal",
  },
  lobby: {
    progressLine: (seals, total) =>
      seals === 1
        ? `1 of ${total} seals quenched — one burning seal remains`
        : "no seals quenched yet",
  },
  hints: {
    shrine: "learn · refill mana",
    seal: "needs armed water",
    gate: "opens after both seals",
  },
  coach: {
    shrineLine: "Aim for the marked water shrine — the trial inside teaches Water.",
    burnLine: "That seal BURNED you. Water must be armed before contact.",
    finishLine: "Torii open — both seals quenched. Cross the marked passage to finish the chapter.",
  },
  blessingWord: { armed: "Water armed", learned: "Water learned", none: "No blessing" },
  copy: {
    startFresh:
      "Aim for the water shrine. Learn its blessing before challenging the fire seals.",
    startLearned:
      "The water blessing is yours. Arm it before striking each fire seal.",
    continueBlessing:
      "Water quenches fire. Arm Water (W), then strike a seal. Each blessing costs 1 mana.",
    continueGate:
      "Both seals are quenched. Aim through the open torii to complete the chapter.",
    leaveLesson: "The shrine will wait. Return when you are ready to learn.",
    lessonPrompt: (firstTry) =>
      `Water quenches flame; wind feeds it. ${
        firstTry
          ? "First mistake is safe. Later mistakes cost 1 integrity."
          : "Practice attempt used. Every further mistake costs 1 integrity."
      } Which element quenches a fire seal?`,
    lessonMistakeSafe:
      "A safe practice mistake. Water quenches flame; wind feeds it. Try water, then wind.",
    lessonMistakeHit: "The trial's warned ember struck after another wrong answer.",
    lessonCorrectFirst:
      "Correct: water quenches fire. Which element would feed a flame instead?",
    lessonDone: "Water blessing learned. Knowledge survives a shattered ball.",
    shrineRefill:
      "The shrine restores your mana to 3. Your learned blessing remains.",
    armNeedLearn: "Learn the water blessing at the shrine first.",
    armNoMana: "No mana. Aim for the shrine to refill.",
    armOk:
      "Water armed: your next burning seal will be quenched. Ordinary rebounds do not consume it.",
    sealBurn:
      "A burning seal struck an unprotected ball. Arm Water before contact.",
    sealOne: "One seal quenched. Arm Water again for the other seal.",
    sealBoth: "Both fire seals are quenched. The torii opens.",
    gateWin:
      "You crossed the torii by learning water and quenching both seals. Chapter complete.",
    gateLocked: "The torii is sealed. Learn Water and quench both fire seals first.",
    drain:
      "The ball fell between the flippers. Hold both as it returns to cradle it.",
    ballSearch:
      "MAMORU freed a trapped ball. No integrity or mana lost. Choose a target to relaunch.",
    resumeOne:
      "Your journey resumes: one seal already quenched. Arm Water and quench the other.",
    resumeFresh:
      "Your journey resumes. Arm Water and quench both fire seals.",
    objective: (p) => {
      if (p.phase === "won") return "Chapter complete";
      if (p.phase === "lost") return "Ball shattered — your learning remains";
      if (!p.learned) return "1 / 3 · Enter the water shrine and learn its blessing";
      if (p.seals < p.total) return `2 / 3 · Quench the fire seals (${p.seals}/${p.total})`;
      return "3 / 3 · Cross the open torii";
    },
    trial: {
      startFresh: "Reach the marked water shrine. MAMORU will teach you Water.",
      startLearned:
        "Water remembered. Arm Water (W), then strike both marked fire seals.",
      enterFresh:
        "MAMORU offers a contained Water Trial. The main ball is safely captured.",
      enterLearned: "Welcome back. Refill mana or practice the Water Trial.",
      refill: "Mana restored. The main table awaits.",
      abandoned: "The shrine will wait. No penalty for stepping away.",
      failed: "The trial ended. Integrity -1; your main-table progress remains.",
      exhausted:
        "The trial exhausted your last integrity. Retry with what you learned.",
      coaching:
        "Wind feeds the flame — water is what quenches it. Water first, then wind.",
      mastered: "Water mastered. Carry the blessing back to the main table.",
      continueBlessing:
        "Water learned. Press W or Arm Water, then hit both main-table seals.",
      continueGate: "The main torii is open. Reach its marked passage to finish.",
      drain: "Ball drained. Integrity -1. Press Space or Launch to try again.",
      ballSearch:
        "MAMORU recovered a trapped ball. No resources lost. Press Launch to continue.",
    },
  },
};

const WIND_RIDGE: ChapterConfig = {
  id: "wind-ridge",
  name: "The Wind Ridge",
  tagline: "Answer two storm chimes. Ride the gust through the mountain pass.",
  glyph: "風",
  tintRgb: "134,239,172",
  tintText: "#e2ffe9",
  tintInk: "#0b2412",
  verb: { name: "Wind", key: "W" },
  lessonExpected: ["wind", "water"],
  sealBumpers: [1, 2],
  targets: {
    shrine: "Wind Shrine",
    sealI: "Storm Chime I",
    sealII: "Storm Chime II",
    gate: "Mountain Pass",
  },
  markers: {
    shrineLabel: "風 SHRINE",
    sealDoneGlyph: "風",
    sealHotGlyph: "雷",
    sealWord: "CHIME",
    sealPlural: "Chimes",
    sealDoneWord: "rung",
    sealHotWord: "waiting",
    gateOpenLabel: "峠 OPEN",
    gateSealedLabel: "峠 SEALED",
    gateOpenSub: "ride the gust through",
    gateSealedSub: "2 chimes",
  },
  overlay: {
    shrineHeading: "The Wind Shrine",
    shrinePractice:
      "MAMORU can restore your mana — or you may practice the Wind Trial again.",
    shrineOffer:
      "MAMORU offers a contained Wind Trial: a short lesson and one practice chime.",
    trialLearned: "Practice the Wind Trial",
    trialFresh: "Begin the Wind Trial",
    blessingTitle: "The Blessing of Wind 風",
    gateTitle: "The Pass Opens 峠",
    continueBlessing: "Continue — carry Wind to the chimes",
    continueGate: "Continue — ride the gust through the pass",
    winTitle: "Chapter Complete — you crossed the mountain pass",
    trialName: "Wind Trial",
    trialIntro: "Wind answers the chime; water still quenches flame.",
    questions: [
      "Which element rings a storm chime?",
      "And which element quenches a fire seal?",
    ],
    blessingBody:
      "You answered truly. The wind blessing is yours — carry it to the two storm chimes. " +
      "Arm Wind (W) before each strike; each gust costs 1 mana, and the shrine refills it. " +
      "This knowledge survives even a shattered ball.",
    gateBody:
      "Both chimes ring clear across the ridge. The gust fills the pass — the way through " +
      "the mountain gate is open. One true shot remains.",
    wonEmbedded:
      "You learned wind at the shrine and rang the practice chime. Carry the blessing " +
      "back to the main table — two storm chimes await.",
    wonFull:
      "You crossed the pass because you learned wind at the shrine, carried it to both " +
      "storm chimes, and earned the gate's opening. Your learning opened the way.",
    carryBack: "Carry Wind back",
    practiceTarget: "Practice chime",
  },
  lobby: {
    progressLine: (seals, total) =>
      seals === 1
        ? `1 of ${total} chimes rung — one still waits on the wind`
        : "no chimes rung yet",
  },
  hints: {
    shrine: "learn · refill mana",
    seal: "needs armed wind",
    gate: "opens after both chimes",
  },
  coach: {
    shrineLine: "Aim for the marked wind shrine — the trial inside teaches Wind.",
    burnLine: "That chime STRUCK you unguarded. Wind must be armed before contact.",
    finishLine: "Pass open — both chimes rung. Cross the marked passage to finish the chapter.",
  },
  blessingWord: { armed: "Wind armed", learned: "Wind learned", none: "No blessing" },
  copy: {
    startFresh:
      "Aim for the wind shrine. Learn its blessing before challenging the storm chimes.",
    startLearned:
      "The wind blessing is yours. Arm it before striking each storm chime.",
    continueBlessing:
      "Wind answers the chime. Arm Wind (W), then strike a chime. Each blessing costs 1 mana.",
    continueGate:
      "Both chimes are rung. Aim through the open pass to complete the chapter.",
    leaveLesson: "The shrine will wait. Return when you are ready to learn.",
    lessonPrompt: (firstTry) =>
      `Wind carries what you dare not touch; water still quenches flame. ${
        firstTry
          ? "First mistake is safe. Later mistakes cost 1 integrity."
          : "Practice attempt used. Every further mistake costs 1 integrity."
      } Which element rings a storm chime?`,
    lessonMistakeSafe:
      "A safe practice mistake. Wind rings the chime; water quenches the flame. Try wind, then water.",
    lessonMistakeHit: "The ridge's warned gust struck after another wrong answer.",
    lessonCorrectFirst:
      "Correct: wind answers the chime. Which element quenches a fire seal?",
    lessonDone: "Wind blessing learned. Knowledge survives a shattered ball.",
    shrineRefill:
      "The shrine restores your mana to 3. Your learned blessing remains.",
    armNeedLearn: "Learn the wind blessing at the shrine first.",
    armNoMana: "No mana. Aim for the shrine to refill.",
    armOk:
      "Wind armed: your next storm chime will ring. Ordinary rebounds do not consume it.",
    sealBurn:
      "An untended chime shattered against the ball. Arm Wind before contact.",
    sealOne: "One chime rung. Arm Wind again for the other.",
    sealBoth: "Both storm chimes are rung. The pass opens.",
    gateWin:
      "You crossed the pass by learning wind and ringing both chimes. Chapter complete.",
    gateLocked: "The pass is shut. Learn Wind and ring both storm chimes first.",
    drain:
      "The ball fell between the flippers. Hold both as it returns to cradle it.",
    ballSearch:
      "MAMORU freed a trapped ball. No integrity or mana lost. Choose a target to relaunch.",
    resumeOne:
      "Your journey resumes: one chime already rung. Arm Wind and ring the other.",
    resumeFresh: "Your journey resumes. Arm Wind and ring both storm chimes.",
    objective: (p) => {
      if (p.phase === "won") return "Chapter complete";
      if (p.phase === "lost") return "Ball shattered — your learning remains";
      if (!p.learned) return "1 / 3 · Enter the wind shrine and learn its blessing";
      if (p.seals < p.total) return `2 / 3 · Ring the storm chimes (${p.seals}/${p.total})`;
      return "3 / 3 · Cross the open pass";
    },
    trial: {
      startFresh: "Reach the marked wind shrine. MAMORU will teach you Wind.",
      startLearned:
        "Wind remembered. Arm Wind (W), then strike both marked storm chimes.",
      enterFresh:
        "MAMORU offers a contained Wind Trial. The main ball is safely captured.",
      enterLearned: "Welcome back. Refill mana or practice the Wind Trial.",
      refill: "Mana restored. The main table awaits.",
      abandoned: "The shrine will wait. No penalty for stepping away.",
      failed: "The trial ended. Integrity -1; your main-table progress remains.",
      exhausted:
        "The trial exhausted your last integrity. Retry with what you learned.",
      coaching:
        "Wind rings the chime — water answers the shrine's first fire. Wind first, then water.",
      mastered: "Wind mastered. Carry the blessing back to the main table.",
      continueBlessing:
        "Wind learned. Press W or Arm Wind, then hit both main-table chimes.",
      continueGate: "The mountain pass is open. Reach its marked passage to finish.",
      drain: "Ball drained. Integrity -1. Press Space or Launch to try again.",
      ballSearch:
        "MAMORU recovered a trapped ball. No resources lost. Press Launch to continue.",
    },
  },
};

export const CHAPTER_ORDER: ChapterId[] = ["water-shrine", "wind-ridge"];

export const CHAPTERS: Record<ChapterId, ChapterConfig> = {
  "water-shrine": WATER_SHRINE,
  "wind-ridge": WIND_RIDGE,
};

/** The next unfinished chapter; replaying means the last one once all are won. */
export function activeChapterId(completed: ChapterId[]): ChapterId {
  for (const id of CHAPTER_ORDER) {
    if (!completed.includes(id)) return id;
  }
  return CHAPTER_ORDER[CHAPTER_ORDER.length - 1];
}

/** Everything the lobby needs to render the active chapter's card. */
export type StoryView = {
  chapter: ChapterConfig;
  run: { learned: boolean; seals: SealId[] } | null;
  completed: ChapterId[];
};
