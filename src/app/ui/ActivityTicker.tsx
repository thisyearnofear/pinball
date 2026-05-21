import React, { useState, useEffect, useCallback } from "react";
import { colors, spacing, typography, radius } from "@/theme/tokens";

type Activity = {
  id: number;
  message: string;
  timestamp: number;
};

const NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack", "Kate", "Leo", "Mia", "Noah", "Olivia"];
const WORLDS = ["Hobbiton", "Cozy Spaceship", "Cozy Cottage", "Sunken Pirate Ship", "Haunted House"];

function generateActivity(): Activity {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const world = WORLDS[Math.floor(Math.random() * WORLDS.length)];
  const score = Math.floor(Math.random() * 500000) + 10000;
  return {
    id: Date.now() + Math.random(),
    message: `${name} scored ${score.toLocaleString()} in ${world}`,
    timestamp: Date.now(),
  };
}

export function ActivityTicker({ active = true }: { active?: boolean }) {
  const [items, setItems] = useState<Activity[]>([]);

  const addActivity = useCallback(() => {
    setItems((prev) => {
      const next = [generateActivity(), ...prev].slice(0, 5);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    addActivity();
    const interval = setInterval(addActivity, 8000 + Math.random() * 7000);
    return () => clearInterval(interval);
  }, [active, addActivity]);

  if (!active || items.length === 0) return null;

  return (
    <div style={{
      marginTop: spacing.lg,
      padding: spacing.md,
      background: "rgba(255, 255, 255, 0.02)",
      borderRadius: radius.lg,
      border: `1px solid ${colors.border.subtle}`,
    }}>
      <div style={{
        fontSize: typography.size.xs,
        color: colors.text.muted,
        fontWeight: typography.weight.medium,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: spacing.sm,
      }}>
        Live Activity
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              fontSize: typography.size.sm,
              color: i === 0 ? colors.text.primary : colors.text.muted,
              opacity: 1 - i * 0.15,
              transition: "all 0.3s ease",
            }}
          >
            {item.message}
          </div>
        ))}
      </div>
    </div>
  );
}
