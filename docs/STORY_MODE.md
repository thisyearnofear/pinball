# Story Mode: Chapters

Story mode turns the standalone chapter prototype into the game's narrative
spine: guided chapters that teach the game's core mechanic — **arming an
element blessing (W) to clear the chapter's marked targets** — on a real
table, with the same engine, physics, and input as arcade play. It is fully
fenced from ranked systems: story runs never record replays, submit scores,
award XP, or touch ghosts.

Chapters are data, not code paths: `src/model/chapters.ts` is the registry
(`CHAPTERS`, `CHAPTER_ORDER`) carrying every string, label, tint, lesson
answer order, and bumper placement per chapter; one reducer
(`shrine-chapter.ts`) runs them all. Shipped chapters:

1. **The Water Shrine** (`water-shrine`) — learn Water, quench two fire seals,
   cross the torii.
2. **The Wind Ridge** (`wind-ridge`) — learn Wind, ring two storm chimes,
   ride the gust through the mountain pass.

A new chapter means a new config in the registry (plus a lesson answer order
and two bumper indices); the run, HUD, lobby card, trial, and storage all
read from it.

## Where to find it

- **Lobby** — a "Story" chapter link under the tournament cards
  (`ChapterLink` in `ArcadeLobby.tsx`).
- **Route** — `/chapter` renders the same `GameScreen` the arcade uses, with
  `initialStory` set. There is no separate game code path: the story *is* the
  mounted game.
- **Pause menu** — a story summary card shows your integrity, seals, and
  progress while a run is paused.

## The run (one chapter, both share the shape)

1. **Reach the shrine.** The ball is served; a tick-based sensor body at the
   shrine captures it. First run, MAMORU teaches the chapter's element in an
   embedded lesson (the `ShrineChapter` trial component) — pass the trial to
   learn the blessing.
2. **Clear both marks.** Arm the blessing with **W**, then strike the two
   marked targets (ch1: quench the fire seals; ch2: ring the storm chimes).
   Striking an *unarmed* mark costs integrity — the table punishes spraying.
3. **Escape through the gate.** With both marks cleared, the gate sensor
   (torii / mountain pass) flips open; draining through it wins the chapter.
4. **Terminal states.** Win/lose cradles the ball at the plunger so it can
   never drop into the void behind the end dialog, and a `retry` relaunches
   clean rather than inheriting terminal fall velocity.

Integrity starts at 3. Draining before the gate is open costs 1; a failed
trial costs 1. At 0 integrity the chapter is lost.

## Input verb map (identical in arcade and story)

| Input | Ball held | Ball live |
|---|---|---|
| **Space** | Launch | **Charged aimed nudge** (hold to build 1–3×, release to fire) |
| **W** | — | Arm the chapter's blessing (once learned; costs 1 mana) |
| **Tap** | — | Nudge toward the tap point |
| **Swipe up** | — | Arm the blessing (touch equivalent of W) |
| **Swipe down / double-tap** | — | Rejected with a distinct "no" haptic |
| **← →** | — | Flippers |

Holding Space with the ball live can never bump the table — the old tilt
trap is gone; Space only charges. Story touches ride the same gesture
dispatch as kamikaze, so both modes share one vocabulary.

## Coaching and feedback

- **Table coach** (`src/config/table-coach.ts`): a story-specific cue
  script teaches by consequence — a standing verb card retires once Water
  is armed; burn/drain cues fire on the tick the mistake costs integrity
  (the reducer records `lastDamage: "burn" \| "drain"` so the coach names
  the actual error); shrine/gate cues mark real milestones. Failed trials
  append *why* copy ("Wind feeds the flame — water is the one that
  quenches it") targeting the actual misconception.
- **Haptics** (`src/utils/haptics.ts`): capture, arm, seal-quench, and
  gate-open patterns, with a rank ordering so important events win
  concurrent collisions. Rejected gestures get a distinct denial shape.
- **Mana pips**: the strip renders the mana count as glowing cyan pips
  (screen-reader labelled), overlayed by the Rive `hud_gauge` artboard
  when the runtime is ready (see
  [RIVE_MOTION.md](./RIVE_MOTION.md)); the DOM pips are the
  reduced-motion / failure fallback.
- **Charge ring**: the kamikaze 3× charge ring and aim-guide line render
  during story saves too — charging reads identically in both modes.

## Continue the Story (the story vault)

Durable progress lives in one vault — `{ version: 1, blessings, completed,
current }` — persisted after every accepted transition (`recordRun` in
`src/model/shrine-chapter.ts`, stored as `pinball_story_vault_v1` inside the
`ps_data` blob):

- **Win** completes the chapter: it moves to `completed`, its blessing is
  kept, and the *next* chapter becomes the active one — the lobby card and
  `/chapter` both open on it.
- **Loss** keeps only knowledge — exactly what a retry keeps, so the lobby
  never offers more than a retry would honour.
- Corrupt or impossible vault data (seals without a blessing, unknown
  chapter ids, a `current` run for a completed chapter) is scrubbed, never
  rescued (TRAPS #7).
- The pre-vault single-chapter keys
  (`pinball_water_shrine_progress_v1` / `…_blessing_v1`) migrate once, on
  first read, under the same rejection rules.
- Mana is never persisted; a resume grants `3 − seals` so the player can
  arm for the remaining marks without a forced shrine detour.

`retry` restores the same saved progress the lobby would, so the two
paths can never disagree. With progress, the lobby card flips from the
chapter's pitch to a real-state summary —
`STORY · THE WIND RIDGE · CHAPTER 2 · CONTINUE — Blessing learned · 1 of 2
chimes rung — **Continue the Story →**`.

## Architecture

The story reuses the arcade engine wholesale. Layering, top-down:

| Layer | File | Role |
|---|---|---|
| Route | `app/chapter/page.tsx` | Renders `GameScreen` with `initialStory` |
| Screen | `src/game/GameScreen.tsx` | Wires story auto-start, pause persistence, ranked guard |
| Mount | `src/game/GameMount.tsx` | Drives `handleEngineUpdate` per tick; routes story events |
| Registry | `src/model/chapters.ts` | Per-chapter config: copy, labels, tints, lesson order, seal bumpers |
| Model | `src/model/game.ts` | Skips replay/score/XP/ghost paths when story mode is active; picks seal bumpers from the chapter config |
| Story table | `src/model/story-table.ts` | Attaches shrine/gate sensor bodies to the live Matter world; capture, re-serve, drain, terminal cradle |
| Story run | `src/model/story-run.ts` | Wraps the pure chapter reducer with `encounterId` for safe async trial results |
| Reducer + vault | `src/model/shrine-chapter.ts` | Pure headless state machine keyed by `chapterId`; story vault persistence (fully unit-testable) |
| Trial UI | `src/game/chapter/ShrineChapter.tsx` | The embedded lesson overlay component — renders whichever `chapterId` is active |

Key invariants, all covered by specs:

- **`encounterId` guards stale trial results** — a resolved trial promise from
  a previous encounter can never mutate the current state.
- **`drainArmed` / tick cooldowns** prevent double sensor fires; `emitOnce` +
  `fired.clear()` on re-serve keeps a run deterministic after re-serves.
- **Physics freeze during dialogs** (`storyFrozen`) — the world is paused
  while the lesson overlay is up; input gating (`shouldHandle` in
  `input-controller.ts`) lets flipper keyups pass through so a held flipper
  never sticks, while swallowing everything else.
- **Terminal cradle** — on `won`/`lost` from any prior phase, the ball is
  held at the plunger and terminal fall velocity is cleared.

## Test coverage

| Spec | Covers |
|---|---|
| `tests/unit/model/shrine-chapter.spec.ts` | Pure reducer for *both* chapters: phases, seals, integrity, `lastDamage` causality; story vault: blessings/completed/current round-trip, win→next-chapter sequencing, corrupt-data scrubbing, legacy-key migration, resume mana grant, retry-equals-continue |
| `tests/unit/model/story-run.spec.ts` | encounterId staleness, trial results, refill, failure coaching copy |
| `tests/unit/model/story-table.spec.ts` | Real-Matter physics rig: capture/release, seal quench, gate flip, drain re-serve, terminal cradle (lost mid-flight / lost from capture / won via gate / retry), `onEvent` hook firing |
| `tests/unit/game/chapter-stranding.spec.ts` | Standalone chapter table stranding guard |
| `tests/unit/game/story-integration.spec.ts` | `GameScreen` wiring: auto-start, pause persistence, ranked fencing (asserts `onRunEnd` never reaches `recordRun`) |
| `tests/unit/config/table-coach.spec.ts` | Story coach script: cue ordering, retirement semantics, per-chapter cue copy, device-correct / emoji-free copy rules |
| `tests/unit/game/arcade-lobby.spec.ts` | Lobby chapter card: fresh-start pitch vs Continue, chapter naming/numbering |
| `tests/unit/seams/continue-the-story.spec.ts` | The binding: real reducer → `recordRun` → vault key (pinned literal) → `loadStoryView` → real ArcadeLobby markup |
| `tests/visual/game.spec.ts` | Browser proof: resumed HUD, bound Rive gauge, legacy save migrates, chapter 2 opens the Wind Ridge |
| `tests/unit/utils/haptics.spec.ts` | Story haptic shapes, rank ordering, denial gaps |

## Screenshots

![Chapter desktop](./chapter-desktop.png)
![Chapter won](./chapter-won.png)

*Mobile:* ![Chapter mobile](./chapter-mobile.png)
