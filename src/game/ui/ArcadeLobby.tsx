import React, { useState } from "react";
import Link from "next/link";
import { getAllTournaments, type TournamentMeta, type GameMode } from "@/config/tournaments";
import { getTournamentWorld } from "@/config/tournaments";
import type { AIDifficulty } from "@/model/kamikaze";
import { getDailyChallenge, getDailyBest, type DailyChallenge } from "@/config/daily-challenge";
import { getWorldById } from "@/config/worlds";
import type { PlayerProgress } from "@/config/progression";
import type { ChallengeInvite } from "@/utils/challenge-link";

import { CHAPTERS, type StoryView } from "@/model/chapters";
import { Button, Skeleton, NeonTitle, CRTOverlay, PlayerCard } from "@/game/ui";
import { burstOnElement } from "@/utils/burst-fx";
import { AttractMode } from "./AttractMode";
import { RankStrip } from "./RankStrip";
import { NextSeedBadge } from "./SeedBadge";
import { ChallengeBanner } from "./ChallengeBanner";
import { CommunityFeedPanel } from "./CommunityFeedPanel";
import type { CommunityRun } from "@/services/backend-scores-client";
import styles from "./ArcadeLobby.module.scss";

type Props = {
  tournaments: TournamentMeta[];
  activeTournamentId: number | null;
  entered: boolean;
  isConnected: boolean;
  loading?: boolean;
  gameMode: GameMode;
  aiDifficulty: AIDifficulty;
  controlScheme: "steer" | "feint" | "precision";
  onSelectControlScheme: (s: "steer" | "feint" | "precision") => void;
  playerAddress?: string | null;
  playerStats?: {
    gamesPlayed: number;
    bestScore: number;
    bestDrainMs: number;
    tournamentsEntered: number;
  };
  onSelectGameMode: (mode: GameMode) => void;
  onSelectDifficulty: (d: AIDifficulty) => void;
  onSelectTournament: (id: number) => void;
  onEnterTournament: (id: number) => void;
  onStartTournament: (id: number) => void;
  onPractice: () => void;
  /** Story mode entry: starts the active chapter's run on the same table. */
  onStory?: () => void;
  /** Durable story state: active chapter + its mid-run progress, if any. */
  storyProgress?: StoryView | null;
  onPlayDaily: (challenge: DailyChallenge) => void;
  /** Local meta-progression (rank, level, streak) shown without a wallet. */
  progress?: PlayerProgress;
  /** Inbound friend challenge from a deep link, awaiting accept/dismiss. */
  pendingChallenge?: ChallengeInvite | null;
  onAcceptChallenge?: (invite: ChallengeInvite) => void;
  onDismissChallenge?: () => void;
  /** Challenge a rival's recent community run (persistent socializer loop). */
  onChallengeCommunityRun?: (run: CommunityRun) => void;
};

const DIFFICULTIES: AIDifficulty[] = ["easy", "medium", "hard"];

const CONTROL_LABELS: Record<"steer" | "feint" | "precision", string> = {
  steer: "Steer",
  feint: "守 Feint duel",
  precision: "守 Precision",
};

export function ArcadeLobby(props: Props) {
  const tournaments = props.tournaments.length > 0 ? props.tournaments : getAllTournaments();
  // The lobby's one job is to start a run. Mode, machine difficulty and control
  // scheme are three choices a newcomer cannot evaluate before playing, so they
  // share a single disclosure that defaults closed for everyone. The summary on
  // the toggle states the current setup, so it never has to be opened to check
  // what you are about to play.
  const [showSetup, setShowSetup] = useState(false);

  if (props.loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton width="60%" height={48} className={styles.loadingTitle} />
        <div className={styles.loadingGrid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.loadingCard} />
          ))}
        </div>
        <ChapterLink onStory={props.onStory} view={null} />
      </div>
    );
  }

  const hasActive = tournaments.some(t => props.activeTournamentId === t.id);
  const setupSummary = [
    props.gameMode === "kamikaze" ? "Kamikaze 神風" : "Classic",
    ...(props.gameMode === "kamikaze"
      ? [ `machine: ${props.aiDifficulty}`, `control: ${CONTROL_LABELS[props.controlScheme]}` ]
      : []),
  ].join(" · ");

  return (
    <CRTOverlay intensity={0.15}>
      <div className={styles.container}>
        <div className={styles.marquee}>
          <NeonTitle text="KAMIKAZE BALL" size="lg" color="#6366f1" />
          <div style={{
            textAlign: "center",
            marginTop: -2,
            marginBottom: 6,
            fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
            fontSize: 15,
            letterSpacing: "0.6em",
            color: "rgba(212, 160, 23, 0.75)",
          }} aria-hidden="true">神風</div>
          <p className={styles.marqueeSubtitle}>
            Shrine story & drain-to-win duels — the machine fights back
          </p>
          {/* Proof-of-provenance: where the NEXT run's RNG seed comes from. */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <NextSeedBadge caption="next run seed" />
          </div>
        </div>

        <AttractMode />

        {/* Primary, wallet-free path — feel the machine before any money is
            mentioned, and before being asked to choose anything. The pickers sit
            behind the disclosure below: three control schemes you have never
            played is not a question a lobby can ask, so it asks for nothing and
            lets the summary line keep the current setup legible. */}
        <div className={styles.instantPlay}>
          <button
            type="button"
            className={styles.instantPlayCta}
            onClick={(e) => { burstOnElement(e.currentTarget, { count: 16, colors: ["#e34234", "#c026d3", "#fbbf24"] }); props.onPractice(); }}
          >
            {props.gameMode === "kamikaze" ? "PLAY NOW — 神風" : "PLAY NOW"}
          </button>
          <div className={styles.instantPlayHint}>
            No wallet needed · {props.gameMode === "kamikaze" ? "best of 3 · fastest drain wins" : "classic practice"} · free
          </div>
          <button
            type="button"
            className={styles.setupToggle}
            aria-expanded={showSetup}
            aria-controls="run-setup"
            onClick={(e) => { if (!showSetup) burstOnElement(e.currentTarget, { count: 6, colors: ["#6366f1", "#818cf8"], distance: [12, 30], size: 3 }); setShowSetup((v) => !v); }}
          >
            <span aria-hidden="true">{showSetup ? "▾" : "▸"}</span> Change setup · {setupSummary}
          </button>
        </div>

        <ChapterLink onStory={props.onStory} view={props.storyProgress ?? null} />

        {showSetup && (
          <div id="run-setup" className={styles.setupPanel}>
            <div className={styles.modeSelector}>
              <button
                type="button"
                className={`${styles.modeCard} ${styles.modeCardKamikaze} ${props.gameMode === "kamikaze" ? styles.modeCardSelected : ""}`}
                onClick={(e) => { burstOnElement(e.currentTarget, { count: 10, colors: ["#ef4444", "#f87171", "#fbbf24"] }); props.onSelectGameMode("kamikaze"); }}
              >
                <span className={styles.modeBadgeFlagship}>FLAGSHIP</span>
                <span className={styles.modeName}>
                  Kamikaze <span style={{ fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif", color: "#e34234", fontSize: "1.1em" }} aria-hidden="true">神風</span>
                </span>
                <span className={styles.modeDesc}>Drain the ball. The machine fights back. Best of 3 — fastest drain wins.</span>
              </button>
              <button
                type="button"
                className={`${styles.modeCard} ${props.gameMode === "classic" ? styles.modeCardSelected : ""}`}
                onClick={(e) => { burstOnElement(e.currentTarget, { count: 10, colors: ["#6366f1", "#818cf8", "#a78bfa"] }); props.onSelectGameMode("classic"); }}
              >
                <span className={styles.modeName}>Classic</span>
                <span className={styles.modeDesc}>Traditional pinball. Rack up the highest score.</span>
              </button>
            </div>

            {props.gameMode === "kamikaze" && (
              <div className={styles.difficultyRow}>
                <span className={styles.difficultyLabel}>Machine difficulty</span>
                <div className={styles.difficultyPills}>
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`${styles.difficultyPill} ${props.aiDifficulty === d ? styles.difficultyPillActive : ""}`}
                      onClick={(e) => { if (props.aiDifficulty !== d) burstOnElement(e.currentTarget, { count: 8, colors: ["#ef4444", "#fbbf24"], distance: [20, 50], size: 4 }); props.onSelectDifficulty(d); }}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All three schemes are equal citizens here: the whole block is
                already opt-in, so a second nested disclosure would just be
                another layer to open. */}
            {props.gameMode === "kamikaze" && (
              <div className={styles.difficultyRow}>
                <span className={styles.difficultyLabel}>Control</span>
                <div className={styles.difficultyPills}>
                  {(["steer", "feint", "precision"] as const).map((scheme) => (
                    <button
                      key={scheme}
                      type="button"
                      className={`${styles.difficultyPill} ${props.controlScheme === scheme ? styles.difficultyPillActive : ""}`}
                      onClick={() => props.onSelectControlScheme(scheme)}
                    >
                      {CONTROL_LABELS[scheme]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Only worth saying once a prototype is actually selected. */}
            {props.gameMode === "kamikaze" && props.controlScheme !== "steer" && (
              <p className={styles.advancedHint}>
                Shot-calling prototypes: call a lane, then release on the meter. <strong>Steer stays the ranked default</strong> —
                these change how the serve works, so expect a rougher feel.
              </p>
            )}
          </div>
        )}

        {props.progress && props.progress.totalRuns > 0 && (
          <RankStrip progress={props.progress} />
        )}

        {props.pendingChallenge && props.onAcceptChallenge && props.onDismissChallenge && (
          <ChallengeBanner
            invite={props.pendingChallenge}
            onAccept={props.onAcceptChallenge}
            onDismiss={props.onDismissChallenge}
          />
        )}

        <DailyBanner onPlayDaily={props.onPlayDaily} />

        {/* Contextual, not a gate — the wallet only matters for tournaments. */}
        {!props.isConnected && (
          <div className={styles.connectPrompt}>
            <div className={styles.connectText}>Connect a wallet to enter a tournament and win prizes</div>
            <div className={styles.connectChain}>NIM · USDT on Polygon · Nimiq Pay</div>
          </div>
        )}

        <div className={styles.tournamentList}>
          {tournaments.map((t) => (
            <ArcadeCard
              key={t.id}
              tournament={t}
              isActive={props.activeTournamentId === t.id}
              entered={props.activeTournamentId === t.id && props.entered}
              isConnected={props.isConnected}
              onSelect={() => props.onSelectTournament(t.id)}
              onEnter={() => props.onEnterTournament(t.id)}
              onStart={() => props.onStartTournament(t.id)}
            />
          ))}
          {/* The socializer loop sits after the competitive ladder, not above it. */}
          <CommunityFeedPanel
            playerAddress={props.playerAddress}
            onChallengeRun={props.onChallengeCommunityRun}
          />
        </div>

        {props.playerAddress && props.playerStats && props.playerStats.gamesPlayed > 0 && (
          <div className={styles.practiceWrap}>
            <PlayerCard address={props.playerAddress} stats={props.playerStats} />
          </div>
        )}
      </div>
    </CRTOverlay>
  );
}

function ChapterLink({ onStory, view }: { onStory?: () => void; view: StoryView | null }) {
  const chapter = view?.chapter ?? CHAPTERS["water-shrine"];
  const completed = view?.completed.length ?? 0;
  const chapterNo = completed > 0 ? ` · CHAPTER ${completed + 1}` : "";
  // Continue reads as the chapter you were playing; a fresh start reads as the
  // pitch. Progress always shows the run's real state, never marketing copy.
  const resuming = Boolean(view?.run?.learned);
  const seals = view?.run?.seals.length ?? 0;
  const inner = resuming ? (
    <>
      <span>STORY · {chapter.name.toUpperCase()}{chapterNo} · CONTINUE</span>
      <strong>{chapter.name}</strong>
      <span>
        Blessing learned · {chapter.lobby.progressLine(seals, 2)}
      </span>
      <b>Continue the Story →</b>
    </>
  ) : (
    <>
      <span>STORY · {chapter.name.toUpperCase()}{chapterNo}</span>
      <strong>{chapter.name}</strong>
      <span>{chapter.tagline}</span>
      <b>Play Story →</b>
    </>
  );
  if (onStory) {
    return (
      <button type="button" className={styles.chapterLink} onClick={onStory}>
        {inner}
      </button>
    );
  }
  return (
    <Link href="/chapter" className={styles.chapterLink}>
      {inner}
    </Link>
  );
}

type CardProps = {
  tournament: TournamentMeta;
  isActive: boolean;
  entered: boolean;
  isConnected: boolean;
  onSelect: () => void;
  onEnter: () => void;
  onStart: () => void;
};

function formatDailyBest(score: number, kamikaze: boolean): string {
  if (!score) return "—";
  return kamikaze ? `${(score / 1000).toFixed(1)}s` : score.toLocaleString();
}

function DailyBanner(props: { onPlayDaily: (c: DailyChallenge) => void }) {
  const challenge = React.useMemo(() => getDailyChallenge(), []);
  const best = getDailyBest(challenge.dayKey);
  const world = getWorldById(challenge.worldId);
  const kamikaze = challenge.mode === "kamikaze";

  return (
    <div className={styles.daily}>
      <div className={styles.dailyIcon} aria-hidden="true">毎日</div>
      <div className={styles.dailyBody}>
        <div className={styles.dailyLabel}>Daily Challenge · {challenge.dayKey}</div>
        <div className={styles.dailyDesc}>
          {kamikaze ? "神風 Kamikaze" : "Classic"} · {world?.name ?? challenge.worldId} · Machine {challenge.aiDifficulty}
        </div>
        <div className={styles.dailyBest}>
          Your best today: {formatDailyBest(best, kamikaze)}{best ? "" : " — no run yet"}
        </div>
      </div>
      <div className={styles.dailyAction}>
        <Button
          variant="secondary"
          onClick={(e) => { burstOnElement(e.currentTarget as HTMLElement, { count: 12, colors: ["#d4a017", "#e34234", "#fbbf24"] }); props.onPlayDaily(challenge); }}
        >
          Play Daily
        </Button>
      </div>
    </div>
  );
}


function ArcadeCard(props: CardProps) {
  const world = getTournamentWorld(props.tournament.id);
  const gradient = world?.gradient || "linear-gradient(135deg, #1a0a2e, #0f0f23)";
  const cardClass = `${styles.card} ${props.isActive ? styles.cardActive : ""}`;

  function buttonLabel() {
    if (!props.isConnected) return "Connect Wallet";
    if (props.isActive && props.entered) return "Play Now";
    if (props.isActive && !props.entered) return "Enter";
    return "Select";
  }

  function buttonVariant() {
    if (props.isActive && props.entered) return "primary" as const;
    if (props.isActive && !props.entered) return "secondary" as const;
    return "ghost" as const;
  }

  function handleAction(e: React.MouseEvent) {
    e.stopPropagation();
    if (!props.isConnected) {
      props.onSelect();
      return;
    }
    if (props.isActive && props.entered) {
      burstOnElement(e.currentTarget as HTMLElement, { count: 14, colors: ["#22c55e", "#6366f1", "#fbbf24"] });
      props.onStart();
    } else if (props.isActive && !props.entered) {
      burstOnElement(e.currentTarget as HTMLElement, { count: 14, colors: ["#6366f1", "#818cf8", "#a78bfa"] });
      props.onEnter();
    } else {
      props.onSelect();
    }
  }

  return (
    <div onClick={props.onSelect} className={cardClass}>
      <div className={styles.thumbnail} style={{ background: gradient }}>
        {world?.name.charAt(0)}
      </div>

      <div className={styles.info}>
        <div className={`${styles.name} ${props.isActive ? styles.nameActive : styles.nameInactive}`}>
          {props.tournament.name}
          <span className={`${styles.modeBadge} ${props.tournament.mode === "kamikaze" ? styles.modeBadgeKamikaze : styles.modeBadgeClassic}`}>
            {props.tournament.mode === "kamikaze" ? "神風 KAMIKAZE" : "CLASSIC"}
          </span>
        </div>
        {/* A4: the world IS the ruleset — surface its physics modifier so
            tournament choice reads as physics choice. */}
        <div style={{ fontSize: 11, letterSpacing: "0.04em", marginTop: 2, color: world?.physicsLabel ? "#67e8f9" : "rgba(255,255,255,0.4)" }}>
          ⚖ {world?.physicsLabel ?? "still table"}
        </div>
        <div className={styles.meta}>
          {props.tournament.entryFee ? `Entry: ${props.tournament.entryFee}` : "Free entry"}
          {props.tournament.prizePool ? ` · ${props.tournament.prizePool}` : ""}
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant={buttonVariant()} onClick={handleAction}>
          {buttonLabel()}
        </Button>
      </div>

      {props.isActive && <div className={styles.activeDot} />}
    </div>
  );
}
