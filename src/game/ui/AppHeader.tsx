import React, { useMemo } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { useIsSmallScreen } from "@/hooks/use-media-query";
import type { WorldAccent } from "@/hooks/use-world-theme";
import { Button } from "./Button";
import styles from "./AppHeader.module.scss";

type View = "lobby" | "game" | "paused";

type Props = {
  view: View;
  gameActive: boolean;
  tournamentName: string | null;
  worldAccent: WorldAccent;
  onOpenMenu: () => void;
  onOpenModal: (modal: "leaderboard" | "settings") => void;
};

export function AppHeader({ view, gameActive, tournamentName, worldAccent, onOpenMenu, onOpenModal }: Props) {
  const isSmall = useIsSmallScreen();
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);

  const mobileMenuItems = useMemo(() => [
    { label: "Leaderboard", action: () => { onOpenModal("leaderboard"); setShowMobileMenu(false); } },
    { label: "Settings", action: () => { onOpenModal("settings"); setShowMobileMenu(false); } },
    { label: "How to play", action: () => { setShowMobileMenu(false); } },
    { label: "About", action: () => { setShowMobileMenu(false); } },
  ], [onOpenModal]);

  const headerStyle: React.CSSProperties = {
    borderBottom: `1px solid ${worldAccent.glow.includes("rgba") ? worldAccent.primary.replace(")", ", 0.2)") : worldAccent.primary}`,
  };

  const brandStyle: React.CSSProperties = {
    background: worldAccent.gradient,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  };

  const tournamentStyle: React.CSSProperties = {
    background: worldAccent.muted,
  };

  return (
    <>
      <header
        className={`${styles.header} ${isSmall ? styles.headerMobile : styles.headerDesktop}`}
        style={headerStyle}
      >
        <div className={`${styles.brandGroup} ${isSmall ? styles.brandGroupMobile : ''}`}>
          <span className={`${styles.brandName} ${isSmall ? styles.brandNameMobile : ''}`} style={brandStyle}>
            Mezo Pinball
          </span>
          {!isSmall && tournamentName && (
            <span className={styles.tournamentTag} style={tournamentStyle}>
              {tournamentName}
            </span>
          )}
          {gameActive && (
            <span className={styles.liveBadge}>
              ● Live
            </span>
          )}
        </div>

        {isSmall ? (
          <div className={styles.actions}>
            {view === "game" && (
              <Button variant="ghost" size="sm" onClick={onOpenMenu} className={styles.mobileMenuBtn}>
                Menu
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label="Open menu"
              className={styles.mobileMenuToggle}
            >
              ☰
            </Button>
          </div>
        ) : (
          <div className={styles.actions}>
            {view === "game" && (
              <Button variant="ghost" size="sm" onClick={onOpenMenu}>
                Menu
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenModal("leaderboard")}>
              Leaderboard
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenModal("settings")}>
              Settings
            </Button>
            <ConnectButton />
          </div>
        )}
      </header>

      {/* Mobile Dropdown Menu */}
      {isSmall && showMobileMenu && (
        <div className={styles.mobileDropdown}>
          {mobileMenuItems.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              fullWidth
              onClick={item.action}
              className={styles.dropdownItem}
            >
              {item.label}
            </Button>
          ))}
          <div className={styles.dropdownDivider} />
          <div className={styles.dropdownConnectWrap}>
            <ConnectButton />
          </div>
        </div>
      )}
    </>
  );
}
