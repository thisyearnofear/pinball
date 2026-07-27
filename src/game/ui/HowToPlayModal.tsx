import React from "react";
import { Modal } from "./Modal";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type ControlGroupProps = {
  title: string;
  icon: string;
  children: React.ReactNode;
};

function ControlGroup({ title, icon, children }: ControlGroupProps) {
  return (
    <div style={{
      padding: spacing.lg,
      background: "rgba(255, 255, 255, 0.03)",
      borderRadius: radius.lg,
      border: `1px solid ${colors.border.subtle}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
        <span style={{ fontSize: typography.size.lg }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
          {title}
        </h3>
      </div>
      <p style={{ margin: 0, fontSize: typography.size.md, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>
        {children}
      </p>
    </div>
  );
}

export function HowToPlayModal(props: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={props.onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
        <ControlGroup title="Kamikaze (flagship)" icon="💥">
          The machine controls the flippers and fights to <strong style={{ color: colors.text.primary }}>save</strong> the ball —
          you want to <strong style={{ color: colors.text.primary }}>drain</strong> it. Fastest drain time wins.
          <br /><br />
          <strong style={{ color: colors.text.primary }}>Tap / click the table</strong> to nudge the ball toward the drain &nbsp;·&nbsp;
          grab <strong style={{ color: colors.text.primary }}>munition crates</strong> for power-ups (some side with the machine) &nbsp;·&nbsp;
          bumpers and targets add <strong style={{ color: colors.text.primary }}>penalty time</strong>, so avoid them.
        </ControlGroup>

        <ControlGroup title="Classic" icon="🕹️">
          Traditional pinball: keep the ball in play and rack up points by hitting bumpers, poppers, and triggers.
          <br /><br />
          <strong style={{ color: colors.text.primary }}>←</strong> / <strong style={{ color: colors.text.primary }}>→</strong> flippers &nbsp;·&nbsp;
          <strong style={{ color: colors.text.primary }}>Space</strong> bump (don't spam it — tilt ends the round).
          On touchscreens, tap <strong style={{ color: colors.text.primary }}>left</strong> / <strong style={{ color: colors.text.primary }}>right</strong> for
          flippers and <strong style={{ color: colors.text.primary }}>swipe up</strong> to bump.
        </ControlGroup>

        <div style={{ fontSize: typography.size.sm, color: colors.text.muted, textAlign: "center", paddingTop: spacing.sm }}>
          Press <strong style={{ color: colors.text.secondary }}>Esc</strong> to pause at any time
        </div>
      </div>
    </Modal>
  );
}
