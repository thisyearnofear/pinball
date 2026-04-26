import React, { useMemo } from "react";
import Tables, { START_TABLE_INDEX } from "@/definitions/tables";
import { ethers } from "ethers";

type Props = {
  isConnected: boolean;
  playerName: string;
  onPlayerNameChange: (v: string) => void;
  tableIndex: number;
  onTableIndexChange: (idx: number) => void;
  tournamentId: number | null;
  entryFeeWei: bigint;
  totalPotWei: bigint;
  endTime: number | null;
  entered: boolean;
  onStartPractice: () => void;
  onEnterTournament: () => void;
  onStartTournament: () => void;
};

function clampTableIndex(idx: number) {
  const len = Tables.length;
  if (len === 0) return START_TABLE_INDEX;
  return ((idx % len) + len) % len;
}

export function StartMenu(props: Props) {
  const table = useMemo(() => Tables[clampTableIndex(props.tableIndex)] ?? Tables[0], [props.tableIndex]);

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
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 900,
      }}
    >
      <div
        style={{
          width: "min(820px, 100%)",
          background: "#0c0c0c",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>New game</h2>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            Player name{" "}
            <input
              value={props.playerName}
              onChange={(e) => props.onPlayerNameChange(e.target.value.slice(0, 32))}
              placeholder="e.g. Alice"
              style={{ marginLeft: 6 }}
            />
          </label>
          <span style={{ fontSize: 12, opacity: 0.75 }}>(Used for score signing.)</span>
        </div>

        {props.tournamentId ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600 }}>Active Tournament #{props.tournamentId}</div>
              {remainingLabel ? <div style={{ opacity: 0.85 }}>Ends in {remainingLabel}</div> : null}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
              <div>Entry fee: {ethers.formatUnits(props.entryFeeWei, 18)} MUSD</div>
              <div>Current pot: {ethers.formatUnits(props.totalPotWei, 18)} MUSD</div>
              <div>Status: {props.isConnected ? (props.entered ? "entered" : "not entered") : "connect wallet"}</div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, opacity: 0.85, fontSize: 13 }}>
            No active tournament detected (or not configured). Practice mode is still available.
          </div>
        )}

        <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Table</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => props.onTableIndexChange(clampTableIndex(props.tableIndex - 1))}>&lt;</button>
            <div style={{ minWidth: 240 }}>{table?.name ?? "Unknown"}</div>
            <button onClick={() => props.onTableIndexChange(clampTableIndex(props.tableIndex + 1))}>&gt;</button>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={props.onStartPractice}>Start practice</button>
          <button
            onClick={props.onEnterTournament}
            disabled={!props.isConnected || !props.tournamentId}
            title={!props.isConnected ? "Connect wallet first" : !props.tournamentId ? "No active tournament" : ""}
          >
            Enter tournament
          </button>
          <button
            onClick={props.onStartTournament}
            disabled={!props.isConnected || !props.tournamentId || !props.entered}
            title={!props.entered ? "Enter the tournament first" : ""}
          >
            Start tournament run
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Tip: press Esc in-game to pause. You can open settings/help from the top bar.
        </div>
      </div>
    </div>
  );
}
