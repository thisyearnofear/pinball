import React from "react";
import { getAllTournaments, type TournamentMeta, type GameMode } from "@/config/tournaments";
import { getTournamentWorld } from "@/config/tournaments";
import type { AIDifficulty } from "@/model/kamikaze";

import { Button, Skeleton, NeonTitle, CRTOverlay, PlayerCard } from "@/game/ui";
import { burstOnElement } from "@/utils/burst-fx";
import { AttractMode } from "./AttractMode";
import styles from "./ArcadeLobby.module.scss";

type Props = {
  tournaments: TournamentMeta[];
  activeTournamentId: number | null;
  entered: boolean;
  isConnected: boolean;
  loading?: boolean;
  gameMode: GameMode;
  aiDifficulty: AIDifficulty;
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
};

const DIFFICULTIES: AIDifficulty[] = ["easy", "medium", "hard"];

export function ArcadeLobby(props: Props) {
  const tournaments = props.tournaments.length > 0 ? props.tournaments : getAllTournaments();

  if (props.loading) {
    return (
      <div className={styles.loadingContainer}>
        <Skeleton width="60%" height={48} className={styles.loadingTitle} />
        <div className={styles.loadingGrid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.loadingCard} />
          ))}
        </div>
      </div>
    );
  }

  const hasActive = tournaments.some(t => props.activeTournamentId === t.id);

  return (
    <CRTOverlay intensity={0.15}>
      <div className={styles.container}>
        <div className={styles.marquee}>
          <NeonTitle text="KAMIKAZE BALL" size="lg" color="#6366f1" />
          <p className={styles.marqueeSubtitle}>
            Drain-to-win pinball — the machine fights back
          </p>
        </div>

        <AttractMode />

        <div className={styles.modeSelector}>
          <button
            type="button"
            className={`${styles.modeCard} ${styles.modeCardKamikaze} ${props.gameMode === "kamikaze" ? styles.modeCardSelected : ""}`}
            onClick={(e) => { burstOnElement(e.currentTarget, { count: 10, colors: ["#ef4444", "#f87171", "#fbbf24"] }); props.onSelectGameMode("kamikaze"); }}
          >
            <span className={styles.modeBadgeFlagship}>FLAGSHIP</span>
            <span className={styles.modeName}>Kamikaze</span>
            <span className={styles.modeDesc}>Drain the ball. The machine fights back. Fastest drain wins.</span>
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

        {!props.isConnected && (
          <div className={styles.connectPrompt}>
            <div className={styles.connectIcon}>🔌</div>
            <div className={styles.connectText}>Connect your wallet to enter tournaments and win prizes</div>
            <div className={styles.connectChain}>Polygon Amoy · Chain 80002</div>
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
        </div>

        {props.playerAddress && props.playerStats && props.playerStats.gamesPlayed > 0 && (
          <div className={styles.practiceWrap}>
            <PlayerCard address={props.playerAddress} stats={props.playerStats} />
          </div>
        )}

        <div className={styles.practiceWrap}>
          <Button variant="ghost" size="lg" onClick={props.onPractice}>
            Practice Mode
          </Button>
        </div>
      </div>
    </CRTOverlay>
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

  function isDisabled() {
    if (!props.isConnected) return false;
    if (props.isActive && !props.entered) return false;
    if (props.isActive && props.entered) return false;
    return true;
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
            {props.tournament.mode === "kamikaze" ? "KAMIKAZE" : "CLASSIC"}
          </span>
        </div>
        <div className={styles.meta}>
          {props.tournament.entryFee ? `Entry: ${props.tournament.entryFee}` : "Free entry"}
          {props.tournament.prizePool ? ` · ${props.tournament.prizePool}` : ""}
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant={buttonVariant()} disabled={isDisabled()} onClick={handleAction}>
          {buttonLabel()}
        </Button>
      </div>

      {props.isActive && <div className={styles.activeDot} />}
    </div>
  );
}
