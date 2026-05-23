import React, { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import styles from "./SettingsModal.module.scss";

import { getFxMuted, getMusicMuted, setFxMuted, setMusicMuted, init as initAudio } from "@/services/audio-service";
import { isFullscreen, toggleFullscreen } from "@/utils/fullscreen-util";
import { setEnabled as setHapticsEnabled } from "@/utils/haptics";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { STORED_HAPTICS_ENABLED, STORED_FULLSCREEN, STORED_WORLD_ID } from "@/definitions/settings";
import { MARBLE_WORLDS } from "@/config/worlds";

type ToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onChange(!checked); }}
        className={`${styles.toggleSwitch} ${checked ? styles.toggleOn : styles.toggleOff}`}
      >
        <div className={`${styles.toggleKnob} ${checked ? styles.toggleKnobOn : styles.toggleKnobOff}`} />
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
      <div className={styles.content}>
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
          <div className={styles.unsupported}>
            Fullscreen is not supported on this device.
          </div>
        )}

        <div className={styles.worldSelector}>
          <span className={styles.worldLabel}>World</span>
          <select
            value={worldId}
            onChange={(e) => { const v = e.target.value; setWorldId(v); setInStorage(STORED_WORLD_ID, v); }}
            className={styles.select}
          >
            {worldOptions.map((world) => (
              <option key={world.id} value={world.id}>{world.name}</option>
            ))}
          </select>
        </div>

        <Button variant="ghost" onClick={props.onClose} className={styles.closeBtn}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
