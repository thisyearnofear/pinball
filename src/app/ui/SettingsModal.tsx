import React, { useMemo, useState } from "react";
import { Modal } from "./Modal";

import { getFxMuted, getMusicMuted, setFxMuted, setMusicMuted, init as initAudio } from "@/services/audio-service";
import { isFullscreen, toggleFullscreen } from "@/utils/fullscreen-util";
import { setEnabled as setHapticsEnabled } from "@/utils/haptics";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { STORED_HAPTICS_ENABLED, STORED_FULLSCREEN, STORED_WORLD_ID } from "@/definitions/settings";
import { MARBLE_WORLDS } from "@/config/worlds";

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
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>Sound effects</span>
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              initAudio();
              const v = e.target.checked;
              setSound(v);
              setFxMuted(!v);
            }}
          />
        </label>

        <label style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>Music</span>
          <input
            type="checkbox"
            checked={music}
            onChange={(e) => {
              initAudio();
              const v = e.target.checked;
              setMusic(v);
              setMusicMuted(!v);
            }}
          />
        </label>

        <label style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>Haptics</span>
          <input
            type="checkbox"
            checked={haptics}
            onChange={(e) => {
              const v = e.target.checked;
              setHaptics(v);
              setHapticsEnabled(v);
              setInStorage(STORED_HAPTICS_ENABLED, v.toString());
            }}
          />
        </label>

        {fullscreenSupported ? (
          <label style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Fullscreen</span>
            <input
              type="checkbox"
              checked={fullscreen}
              onChange={(e) => {
                const v = e.target.checked;
                setFullscreen(v);
                setInStorage(STORED_FULLSCREEN, v.toString());
                const current = isFullscreen();
                if ((v && !current) || (!v && current)) toggleFullscreen();
              }}
            />
          </label>
        ) : (
          <div style={{ opacity: 0.75, fontSize: 12 }}>Fullscreen is not supported on this device.</div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span>World</span>
          <select
            value={worldId}
            onChange={(e) => {
              const v = e.target.value;
              setWorldId(v);
              setInStorage(STORED_WORLD_ID, v);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              fontSize: 14,
            }}
          >
            {worldOptions.map((world) => (
              <option key={world.id} value={world.id}>
                {world.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}

