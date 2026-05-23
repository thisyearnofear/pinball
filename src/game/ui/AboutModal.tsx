import React from "react";
import { Modal } from "./Modal";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type CreditLinkProps = {
  label: string;
  href: string;
  author: string;
};

function CreditLink({ label, href, author }: CreditLinkProps) {
  return (
    <li style={{ marginBottom: spacing.xs }}>
      <span style={{ color: colors.text.secondary }}>{label}:</span>{" "}
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{
          color: colors.accent.primary,
          textDecoration: "none",
          fontWeight: typography.weight.medium,
        }}
      >
        {author}
      </a>
    </li>
  );
}

export function AboutModal(props: { onClose: () => void }) {
  return (
    <Modal title="About" onClose={props.onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
        <p style={{ margin: 0, fontSize: typography.size.md, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>
          Pinball Arcade — retro pinball with onchain tournaments on Mezo. Compete for MUSD prizes (Bitcoin-backed stablecoin). 
          Scores are cryptographically signed and verified onchain via EIP-191. Built for the Mezo Hackathon.
        </p>

        <div>
          <h3 style={{ margin: `0 0 ${spacing.md}px`, fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
            Contracts (Mezo Testnet)
          </h3>
          <div style={{ fontSize: typography.size.sm, color: colors.text.secondary, fontFamily: typography.fontFamilyMono, lineHeight: typography.lineHeight.relaxed }}>
            TournamentManager: 0x3906...cfa0<br />
            MissionPool: 0xC3fb...35B3<br />
            MUSD: 0x1189...c503<br />
            Chain: 31611
          </div>
        </div>

        <div>
          <h3 style={{ margin: `0 0 ${spacing.md}px`, fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text.primary }}>
            Credits
          </h3>
          <ul style={{ margin: 0, paddingLeft: spacing.lg, lineHeight: typography.lineHeight.relaxed, color: colors.text.secondary }}>
            <CreditLink label="Animation" href="https://codepen.io/nikhil8krishnan/pen/rVoXJa" author="Loader by Nikhil Krishnan" />
            <CreditLink label="Animation" href="https://codepen.io/himagna/pen/LYgqJoW" author="CRT lines by himagna" />
            <CreditLink label="Font" href="https://www.dafont.com/neon-overdrive.font" author="Neon Overdrive by Darrell Flood" />
            <CreditLink label="Font" href="https://www.dafont.com/clubland.font" author="Clubland by Joseph Gibson" />
            <CreditLink label="Inspiration" href="https://en.wikipedia.org/wiki/Rollerball_(video_game)" author="Rollerball (HAL Laboratory)" />
            <CreditLink label="Programming" href="https://www.igorski.nl" author="igorski" />
          </ul>
        </div>
      </div>
    </Modal>
  );
}
