import React, { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

import { getFxMuted, getMusicMuted, setFxMuted, setMusicMuted, init as initAudio } from "@/services/audio-service";
import { isFullscreen, toggleFullscreen } from "@/utils/fullscreen-util";
import { setEnabled as setHapticsEnabled } from "@/utils/haptics";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { STORED_HAPTICS_ENABLED, STORED_FULLSCREEN, STORED_WORLD_ID } from "@/definitions/settings";
import { MARBLE_WORLDS } from "@/config/worlds";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type ToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.lg,
      padding: `${spacing.sm}px 0`,
      borderBottom: `1px solid ${colors.border.subtle}`,
      cursor: "pointer",
    }}>
      <span style={{ fontSize: typography.size.md, color: colors.text.primary }}>{label}</span>
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onChange(!checked); }}
        style={{
          width: 44,
          height: 24,
          borderRadius: radius.full,
          background: checked ? colors.accent.primary : colors.border.default,
          position: "relative",
          transition: "background 0.2s ease",
          flexShrink: 0,
        }}
      >
        <div style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: colors.text.primary,
          transition: "left 0.2s ease",
        }} />
      </div>
    </label>
  );
}

export function SettingsModal(props: { onClose: () => void }) {
  const [sound, setSound] = useState(() => !getFxMuted());
  const [music, setMusic] = useState(() => !getMusicMuted());
  const [haptics, setHaptics] = useState(() => getFromStorage(STORED_HAPTICS_ENABLED) !== "false");
  const [fullscreen, setFullscreen] = useState(() => getFromStorage(STORED_FULLSCREEN) === "true");
  const [worldId, setWorldId] = useState(() => getFromStorage(STORED_WORLD_ID) || "hobbiton");

  const worldOptions = useMemo(() => Object.values(MARBLE_WORLDS), []);

  const fullscreenSupported = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    return !ua.includes("iphone") && !ua.includes("ipad");
  }, []);

  return (
    <Modal title="Settings" onClose={props.onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
        <ToggleRow label="Sound effects" checked={sound} onChange={(v) => { initAudio(); setSound(v); setFxMuted(!v); }} />
        <ToggleRow label="Music" checked={music} onChange={(v) => { initAudio(); setMusic(v); setMusicMuted(!v); }} />
        <ToggleRow label="Haptics" checked={haptics} onChange={(v) => { setHaptics(v); setHapticsEnabled(v); setInStorage(STORED_HAPTICS_ENABLED, v.toString()); }} />

        {fullscreenSupported ? (
          <ToggleRow label="Fullscreen" checked={fullscreen} onChange={(v) => {
            setFullscreen(v);
            setInStorage(STORED_FULLSCREEN, v.toString());
            if ((v && !isFullscreen()) || (!v && isFullscreen())) toggleFullscreen();
          }} />
        ) : (
          <div style={{ fontSize: typography.size.sm, color: colors.text.muted, padding: `${spacing.xs}px 0` }}>
            Fullscreen is not supported on this device.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs, paddingTop: spacing.sm }}>
          <span style={{ fontSize: typography.size.sm, color: colors.text.secondary, fontWeight: typography.weight.medium }}>World</span>
          <select
            value={worldId}
            onChange={(e) => { const v = e.target.value; setWorldId(v); setInStorage(STORED_WORLD_ID, v); }}
            style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderRadius: radius.md,
              background: "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${colors.border.default}`,
              color: colors.text.primary,
              fontSize: typography.size.md,
              outline: "none",
              cursor: "pointer",
            }}
          >
            {worldOptions.map((world) => (
              <option key={world.id} value={world.id}>{world.name}</option>
            ))}
          </select>
        </div>

        <Button variant="ghost" onClick={props.onClose} style={{ marginTop: spacing.sm }}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
