import React, { useMemo } from "react";
import Tables, { START_TABLE_INDEX } from "@/definitions/tables";
import { ethers } from "ethers";

import { colors, spacing, typography, radius } from "@/theme/tokens";
import { Button, Card } from "@/app/ui";
import { getWorldById } from "@/config/worlds";

function clampTableIndex(idx: number) {
  const len = Tables.length;
  if (len === 0) return START_TABLE_INDEX;
  return ((idx % len) + len) % len;
}

type Props = {
  isConnected: boolean;
  playerName: string;
  onPlayerNameChange: (v: string) => void;
  tableIndex: number;
  onTableIndexChange: (idx: number) => void;
  selectedWorldId: string;
  onWorldChange: (worldId: string) => void;
  tournamentId: number | null;
  entryFeeWei: bigint;
  totalPotWei: bigint;
  endTime: number | null;
  entered: boolean;
  onStartPractice: () => void;
  onEnterTournament: () => void;
  onStartTournament: () => void;
  onResume?: () => void;
  onQuitToLobby?: () => void;
};

export function StartMenu(props: Props) {
  const table = useMemo(() => Tables[clampTableIndex(props.tableIndex)] ?? Tables[0], [props.tableIndex]);
  const world = useMemo(() => getWorldById(props.selectedWorldId), [props.selectedWorldId]);
  const isPaused = !!props.onResume;

  const nowSec = Math.floor(Date.now() / 1000);
  const remainingSec = props.endTime ? Math.max(0, props.endTime - nowSec) : null;
  const remainingLabel =
    remainingSec === null
      ? ""
      : remainingSec >= 3600
        ? `${Math.floor(remainingSec / 3600)}h ${Math.floor((remainingSec % 3600) / 60)}m`
        : `${Math.floor(remainingSec / 60)}m`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: colors.background.overlay,
        backdropFilter: 'blur(8px)',
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        zIndex: 200,
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          maxHeight: "85vh",
          overflow: 'auto',
          background: colors.background.surface,
          color: colors.text.primary,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius.lg,
          padding: spacing.xl,
          animation: 'slideUp 200ms ease',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: 'center',
          gap: spacing.lg,
          marginBottom: spacing.xl,
        }}>
          <h2 style={{
            margin: 0,
            fontSize: typography.size['2xl'],
            fontWeight: typography.weight.bold,
            background: colors.accent.gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {isPaused ? 'Paused' : 'New Game'}
          </h2>
        </div>

        {!isPaused && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            {/* Player Name */}
            <div>
              <label style={{
                display: 'block',
                fontSize: typography.size.sm,
                color: colors.text.secondary,
                fontWeight: typography.weight.medium,
                marginBottom: spacing.xs,
              }}>
                Player name
              </label>
              <input
                value={props.playerName}
                onChange={(e) => props.onPlayerNameChange(e.target.value.slice(0, 32))}
                placeholder="e.g. Alice"
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.md,
                  color: colors.text.primary,
                  fontSize: typography.size.md,
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: typography.size.xs, color: colors.text.muted, marginTop: spacing.xs, display: 'block' }}>
                Used for score signing
              </span>
            </div>

            {/* Tournament Info */}
            {props.tournamentId ? (
              <Card padding={spacing.lg}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.sm }}>
                  <div style={{ fontWeight: typography.weight.semibold, fontSize: typography.size.md }}>
                    Tournament #{props.tournamentId}
                  </div>
                  {remainingLabel && (
                    <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>
                      Ends in {remainingLabel}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>
                  <div>Entry fee: {ethers.formatUnits(props.entryFeeWei, 18)} MUSD</div>
                  <div>Current pot: {ethers.formatUnits(props.totalPotWei, 18)} MUSD</div>
                  <div style={{ marginTop: spacing.xs }}>
                    Status: {props.isConnected
                      ? (props.entered
                        ? <span style={{ color: colors.status.success }}>Entered</span>
                        : <span style={{ color: colors.status.warning }}>Not entered</span>)
                      : <span style={{ color: colors.text.muted }}>Connect wallet</span>}
                  </div>
                </div>
              </Card>
            ) : (
              <div style={{ fontSize: typography.size.sm, color: colors.text.muted, textAlign: 'center', padding: spacing.md }}>
                No active tournament. Practice mode is available.
              </div>
            )}

            {/* Table Selection */}
            <Card padding={spacing.md}>
              <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium, marginBottom: spacing.sm, color: colors.text.secondary }}>
                Table
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onTableIndexChange(clampTableIndex(props.tableIndex - 1))}
                >
                  ←
                </Button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: typography.size.md }}>
                  {table?.name ?? "Unknown"}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onTableIndexChange(clampTableIndex(props.tableIndex + 1))}
                >
                  →
                </Button>
              </div>
            </Card>

            {/* World Selection */}
            <Card padding={spacing.md}>
              <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.medium, marginBottom: spacing.sm, color: colors.text.secondary }}>
                World
              </div>
              <select
                value={props.selectedWorldId}
                onChange={(e) => props.onWorldChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radius.md,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.border.default}`,
                  color: colors.text.primary,
                  fontSize: typography.size.md,
                  cursor: "pointer",
                  outline: 'none',
                }}
              >
                <option value="hobbiton">Hobbiton</option>
                <option value="spaceship">Cozy Spaceship</option>
                <option value="cottage">Cozy Cottage</option>
                <option value="pirate-ship">Sunken Pirate Ship</option>
                <option value="haunted-house">Haunted House</option>
              </select>
              {world && (
                <div style={{ marginTop: spacing.xs, fontSize: typography.size.xs, color: colors.text.muted }}>
                  {world.description}
                </div>
              )}
            </Card>

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: 'column', gap: spacing.sm, marginTop: spacing.md }}>
              <Button fullWidth onClick={props.onStartPractice}>
                Start Practice
              </Button>
              <Button
                fullWidth
                variant="secondary"
                onClick={props.onEnterTournament}
                disabled={!props.isConnected || !props.tournamentId}
              >
                {!props.isConnected ? 'Connect Wallet' : !props.tournamentId ? 'No Active Tournament' : 'Enter Tournament'}
              </Button>
              <Button
                fullWidth
                onClick={props.onStartTournament}
                disabled={!props.isConnected || !props.tournamentId || !props.entered}
              >
                {props.entered ? 'Start Tournament Run' : 'Enter First'}
              </Button>
            </div>
          </div>
        )}

        {isPaused && (
          <div style={{ display: "flex", flexDirection: 'column', gap: spacing.sm }}>
            <Button fullWidth onClick={props.onResume}>
              Resume Game
            </Button>
            <Button fullWidth variant="secondary" onClick={props.onStartPractice}>
              New Practice Run
            </Button>
            {props.entered && (
              <Button fullWidth variant="secondary" onClick={props.onStartTournament}>
                New Tournament Run
              </Button>
            )}
            <Button fullWidth variant="ghost" onClick={props.onQuitToLobby}>
              Quit to Lobby
            </Button>
          </div>
        )}

        <div style={{ marginTop: spacing.lg, fontSize: typography.size.xs, color: colors.text.muted, textAlign: 'center' }}>
          Press Esc to pause • Settings and help available in the top bar
        </div>
      </div>
    </div>
  );
}
