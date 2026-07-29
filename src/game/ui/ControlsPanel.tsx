import React from "react";
import { Button } from "./Button";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  touchscreen: boolean;
  onConsultKami: () => void;
};

type Verb = {
  key: string;
  touch: string;
  label: string;
  desc: string;
  color: string;
};

const VERBS: Verb[] = [
  { key: "Click", touch: "Tap", label: "Nudge", desc: "Push the ball toward your cursor", color: "#60a5fa" },
  { key: "Hold", touch: "Hold", label: "Power Nudge", desc: "Charge up, aim with the guide line", color: "#4ade80" },
  { key: "↓", touch: "Swipe down", label: "Dive", desc: "Force a drain the machine can't save", color: "#fbbf24" },
  { key: "Shift", touch: "Swipe up", label: "Tilt-Lock", desc: "Freeze the machine's flippers briefly", color: "#f0abfc" },
  { key: "D", touch: "Double-tap", label: "Deploy", desc: "Fire a banked munition", color: "#f87171" },
];

/**
 * Desktop side panel that fills the empty space beside the portrait table.
 * Serves double duty: persistent controls discoverability (the top user
 * feedback) and the entry point to the pause-time Kami Trials.
 */
export function ControlsPanel(props: Props) {
  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: spacing.lg,
      padding: spacing.lg,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: radius.lg,
      alignSelf: "flex-start",
    }}>
      <div>
        <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          操作方法 · Controls
        </div>
        <div style={{ fontSize: typography.size.xs, color: colors.text.muted, marginTop: 2 }}>
          {props.touchscreen ? "Touch gestures" : "Keyboard & mouse"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
        {VERBS.map((v) => (
          <div key={v.label} style={{ display: "flex", gap: spacing.sm, alignItems: "flex-start" }}>
            <div style={{
              minWidth: 46,
              padding: "3px 0",
              textAlign: "center",
              fontSize: typography.size.xs,
              fontWeight: typography.weight.bold,
              color: v.color,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${v.color}44`,
              borderRadius: radius.sm,
            }}>
              {props.touchscreen ? v.touch : v.key}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.primary, lineHeight: 1.2 }}>
                {v.label}
              </div>
              <div style={{ fontSize: typography.size.xs, color: colors.text.muted, lineHeight: 1.3 }}>
                {v.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: spacing.md,
        background: "rgba(212,160,23,0.06)",
        border: "1px solid rgba(212,160,23,0.2)",
        borderRadius: radius.md,
        display: "flex",
        flexDirection: "column",
        gap: spacing.sm,
      }}>
        <div style={{ fontSize: typography.size.xs, color: colors.text.muted, lineHeight: 1.4 }}>
          Pause anytime and commune with the kami for a boon that tips the table in your favor.
        </div>
        <Button variant="secondary" size="sm" onClick={props.onConsultKami}>
          🎋 Pause → Consult the Kami
        </Button>
      </div>
    </div>
  );
}
