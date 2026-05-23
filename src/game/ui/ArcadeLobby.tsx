import React from "react";
import { getAllTournaments, type TournamentMeta } from "@/config/tournaments";
import { getTournamentWorld } from "@/config/tournaments";

import { useIsSmallScreen } from "@/hooks/use-media-query";
import { Button, Skeleton, NeonTitle, CRTOverlay } from "@/game/ui";
import styles from "./ArcadeLobby.module.scss";

type Props = {
  tournaments: TournamentMeta[];
  activeTournamentId: number | null;
  entered: boolean;
  isConnected: boolean;
  loading?: boolean;
  onSelectTournament: (id: number) => void;
  onEnterTournament: (id: number) => void;
  onStartTournament: (id: number) => void;
  onPractice: () => void;
};

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
          <NeonTitle text="PINBALL ARCADE" size="lg" color="#6366f1" />
          <p className={styles.marqueeSubtitle}>
            Onchain pinball on Mezo — compete for MUSD prizes
          </p>
        </div>

        {!props.isConnected && (
          <div className={styles.connectPrompt}>
            <div className={styles.connectIcon}>🔌</div>
            <div className={styles.connectText}>Connect your wallet to enter tournaments and win MUSD</div>
            <div className={styles.connectChain}>Mezo Testnet · Chain 31611</div>
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
      props.onStart();
    } else if (props.isActive && !props.entered) {
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
        </div>
        <div className={styles.meta}>
          Entry: {props.tournament.entryFee || "1 MUSD"} · Prize: {props.tournament.prizePool || "50 MUSD"}
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
