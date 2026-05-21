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
        <p style={{ margin: 0, fontSize: typography.size.md, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>
          Keep the ball in play and rack up points by hitting bumpers, poppers, and triggers.
        </p>

        <ControlGroup title="Keyboard" icon="⌨️">
          <strong style={{ color: colors.text.primary }}>←</strong> Left flipper &nbsp;·&nbsp;
          <strong style={{ color: colors.text.primary }}>→</strong> Right flipper &nbsp;·&nbsp;
          <strong style={{ color: colors.text.primary }}>Space</strong> Bump
        </ControlGroup>

        <ControlGroup title="Touchscreen" icon="👆">
          Tap <strong style={{ color: colors.text.primary }}>left</strong> / <strong style={{ color: colors.text.primary }}>right</strong> side for flippers &nbsp;·&nbsp;
          <strong style={{ color: colors.text.primary }}>Swipe up</strong> to bump
        </ControlGroup>

        <div style={{ fontSize: typography.size.sm, color: colors.text.muted, textAlign: "center", paddingTop: spacing.sm }}>
          Press <strong style={{ color: colors.text.secondary }}>Esc</strong> to pause at any time
        </div>
      </div>
    </Modal>
  );
}
