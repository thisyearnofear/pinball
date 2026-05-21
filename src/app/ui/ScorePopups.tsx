import React, { useState, useCallback, useRef } from "react";
import { colors, typography } from "@/theme/tokens";

type Popup = {
  id: number;
  x: number;
  y: number;
  value: number;
  isCombo: boolean;
  timestamp: number;
};

type ScorePopupContextType = {
  addScore: (x: number, y: number, value: number, isCombo?: boolean) => void;
};

const ScorePopupContext = React.createContext<ScorePopupContextType>({
  addScore: () => {},
});

let nextId = 0;

export function ScorePopupProvider({ children }: { children: React.ReactNode }) {
  const [popups, setPopups] = useState<Popup[]>([]);
  const cleanupRef = useRef<Map<number, number>>(new Map());

  const addScore = useCallback((x: number, y: number, value: number, isCombo = false) => {
    const id = nextId++;
    const popup: Popup = { id, x, y, value, isCombo, timestamp: Date.now() };

    setPopups((prev) => [...prev.slice(-12), popup]);

    const timer = window.setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== id));
      cleanupRef.current.delete(id);
    }, 1200);

    cleanupRef.current.set(id, timer);
  }, []);

  React.useEffect(() => {
    return () => {
      cleanupRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ScorePopupContext.Provider value={{ addScore }}>
      {children}
      {popups.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 150,
          }}
        >
          {popups.map((p) => (
            <div
              key={p.id}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
                fontSize: p.isCombo ? typography.size["2xl"] : typography.size.xl,
                fontWeight: typography.weight.bold,
                color: p.isCombo ? "#fbbf24" : colors.text.primary,
                textShadow: p.isCombo
                  ? "0 0 12px rgba(251, 191, 36, 0.6)"
                  : "0 0 8px rgba(255, 255, 255, 0.4)",
                animation: "scoreFloat 1.2s ease-out forwards",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              +{p.value.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </ScorePopupContext.Provider>
  );
}

export function useScorePopups() {
  return React.useContext(ScorePopupContext);
}
