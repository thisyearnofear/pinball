import React, { useState, useCallback, useRef, useEffect } from "react";

type FlashType = "hit" | "big" | "combo" | "drain";

type FlashState = {
  type: FlashType;
  intensity: number;
  timestamp: number;
};

type ScreenFxContextType = {
  triggerFlash: (type?: FlashType, intensity?: number) => void;
  triggerShake: (intensity?: number) => void;
};

const ScreenFxContext = React.createContext<ScreenFxContextType>({
  triggerFlash: () => {},
  triggerShake: () => {},
});

export function ScreenFxProvider({ children }: { children: React.ReactNode }) {
  const [flash, setFlash] = useState<FlashState | null>(null);
  const [shake, setShake] = useState(false);
  const shakeTimeoutRef = useRef<number | null>(null);

  const triggerFlash = useCallback((type: FlashType = "hit", intensity = 0.15) => {
    setFlash({ type, intensity, timestamp: Date.now() });
  }, []);

  const triggerShake = useCallback((intensity = 1) => {
    if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
    setShake(true);
    shakeTimeoutRef.current = window.setTimeout(() => setShake(false), 150 * intensity);
  }, []);

  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
    };
  }, []);

  const flashColor = flash
    ? flash.type === "big"
      ? `rgba(251, 191, 36, ${flash.intensity})`
      : flash.type === "combo"
        ? `rgba(168, 85, 247, ${flash.intensity})`
        : flash.type === "drain"
          ? `rgba(239, 68, 68, ${flash.intensity})`
          : `rgba(255, 255, 255, ${flash.intensity})`
    : "transparent";

  return (
    <ScreenFxContext.Provider value={{ triggerFlash, triggerShake }}>
      {children}

      {/* Flash overlay */}
      {flash && (
        <div
          key={flash.timestamp}
          style={{
            position: "fixed",
            inset: 0,
            background: flashColor,
            pointerEvents: "none",
            zIndex: 140,
            animation: "flashFade 200ms ease-out forwards",
          }}
        />
      )}

      {/* Shake wrapper */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          animation: shake ? `screenShake 150ms ease-out` : "none",
        }}
      />
    </ScreenFxContext.Provider>
  );
}

export function useScreenFx() {
  return React.useContext(ScreenFxContext);
}
