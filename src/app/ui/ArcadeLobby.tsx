import React from "react";
import { getAllTournaments, type TournamentMeta } from "@/config/tournaments";
import { getTournamentWorld } from "@/config/tournaments";

import { colors, spacing, typography, radius } from "@/theme/tokens";
import { useIsSmallScreen } from "@/hooks/use-media-query";
import { Button, Skeleton, NeonTitle, CRTOverlay } from "@/app/ui";

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
  const isSmall = useIsSmallScreen();

  if (props.loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: spacing["2xl"] }}>
        <Skeleton width="60%" height={48} style={{ margin: "0 auto 32px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 80,
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: radius.lg,
                border: `1px solid ${colors.border.subtle}`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <CRTOverlay intensity={0.3}>
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: `${spacing["2xl"]}px ${spacing.lg}px`,
        }}
      >
        {/* Neon marquee */}
        <div style={{ marginBottom: spacing["3xl"] }}>
          <NeonTitle text="MEZO PINBALL" size="lg" color="#6366f1" />
          <p
            style={{
              textAlign: "center",
              margin: `${spacing.sm}px 0 0`,
              fontSize: typography.size.md,
              color: colors.text.muted,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Insert coin to play
          </p>
        </div>

        {/* Tournament list */}
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.md, marginBottom: spacing["2xl"] }}>
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

        {/* Practice button */}
        <div style={{ textAlign: "center" }}>
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

  return (
    <div
      onClick={props.onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.lg,
        padding: spacing.lg,
        background: props.isActive
          ? "linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0.3) 100%)"
          : "rgba(0, 0, 0, 0.3)",
        borderRadius: radius.lg,
        border: props.isActive
          ? `2px solid var(--world-primary, #6366f1)`
          : `1px solid ${colors.border.subtle}`,
        cursor: "pointer",
        transition: "all 0.2s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* World thumbnail */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.md,
          background: gradient,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: typography.size["2xl"],
          opacity: 0.6,
        }}
      >
        {world?.name.charAt(0)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: typography.size.lg,
            fontWeight: typography.weight.semibold,
            color: props.isActive ? colors.text.primary : colors.text.secondary,
            marginBottom: spacing.xs,
          }}
        >
          {props.tournament.name}
        </div>
        <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>
          Entry: {props.tournament.entryFee || "10 MUSD"} · Prize: {props.tournament.prizePool || "50 MUSD"}
        </div>
      </div>

      {/* Action */}
      <div style={{ flexShrink: 0 }}>
        {props.isActive && props.entered ? (
          <Button onClick={(e) => { e.stopPropagation(); props.onStart(); }}>Play</Button>
        ) : props.isActive && !props.entered ? (
          <Button variant="secondary" disabled={!props.isConnected} onClick={(e) => { e.stopPropagation(); props.onEnter(); }}>
            {props.isConnected ? "Enter" : "Connect"}
          </Button>
        ) : (
          <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>Select</div>
        )}
      </div>

      {/* Active indicator */}
      {props.isActive && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 8px #22c55e",
          }}
        />
      )}
    </div>
  );
}
