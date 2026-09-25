# Progress

One line per cycle. The machine-readable state is git itself — commits,
CI runs, the test suite; this file is the story. When a cycle lands, add a
row: what landed, what the gate said, what's next. The gate is a run, not
a claim (`pnpm ci`, and `pnpm run verify:visual` for anything a player
sees).

| cycle | landed | gate | next |
|---|---|---|---|
| story-mode foundation (19916da→1593e4a) | playable Water Shrine chapter: route, table, pure reducer, specs; Story guide docs | green (unit) | mount the chapter as the narrative spine |
| story unification (5dc11ef, 96f15ab) | story-mode input speaks the arcade verb vocabulary; coach cues + spendable mana meter (UX Tier 2) | green | durable progress |
| continue-the-story (f310603) | chapter progress persists per accepted transition; lobby card flips to Continue; retry ≡ continue | green | — |
| Rive motion pass (02af0b8, d5b2e55) | state-driven HUD artboards (gauge, sigil, kanji, sting) with DOM fallback; RIVE_MOTION pipeline guide | green (unit) — *but the bindings were silently inert* | playtest finds it |
| Rive binding fixes (0d32ac7, de5c27e) | runtime passes `stateMachine` (canvas-lite ignores the deprecated plural); coach card teaches the launch verb | green | proof that green ≠ rendered |
| hardening (prior cycle) | Lattice-inspired: AGENTS.md, docs/TRAPS.md, seam spec (reducer→ps_data→lobby), Playwright visual harness + visual-gate workflow, this file | green (`pnpm test`, `typecheck`, `verify:visual` ×2) | the first harness run found and fixed trap #10 (gauge fallback deadlock); two bug-injections confirmed the gate bites | next story chapter |
| chapter 2: The Wind Ridge (this cycle) | chapter registry (`src/model/chapters.ts`) — all copy/lesson/bumper data per chapter, one reducer; story vault (`pinball_story_vault_v1`) with win→next-chapter sequencing + one-time legacy migration; Wind Ridge shipped on top (storm chimes, mountain pass, wind-then-water lesson, per-chapter coach cues); seam spec pins the storage key as a literal (falsification-checked) | green (`pnpm test` 625, `typecheck`, `verify:visual` 10 pass / 2 skip, `pnpm run ci`) | chapter 3; a vault/campaign view in the lobby |

Convention: append a row when a cycle *lands*, not when it starts; a cycle
that stalls gets its row amended with what it learned. Traps discovered
along the way go to [TRAPS.md](TRAPS.md), not into folklore.
