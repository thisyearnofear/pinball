import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { getAppConfig } from "@/config/app-config";
import { shortenAddress } from "@/utils/address";
import { useWalletState } from "@/hooks/use-wallet-state";
import { useIsSmallScreen } from "@/hooks/use-media-query";
import type { WorldAccent } from "@/hooks/use-world-theme";
import { Button } from "./Button";
import styles from "./AppHeader.module.scss";

// Lazy-load RainbowKit's ConnectButton only on the client to avoid
// SSR bundling of @rainbow-me/rainbowkit → @coinbase/cdp-sdk → @x402/*
const ConnectButton = dynamic(
  () => import("@rainbow-me/rainbowkit").then(m => ({ default: m.ConnectButton })),
  { ssr: false }
);

type View = "lobby" | "game" | "paused";

type Props = {
  view: View;
  gameActive: boolean;
  tournamentName: string | null;
  worldAccent: WorldAccent;
  onOpenMenu: () => void;
  onOpenModal: (modal: "leaderboard" | "settings" | "how" | "about") => void;
};

export function AppHeader({ view, gameActive, tournamentName, worldAccent, onOpenMenu, onOpenModal }: Props) {
  const isSmall = useIsSmallScreen();
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);
  const cfg = getAppConfig();
  const isWagmi = cfg.walletAdapter === "wagmi";
  const { address, isConnected } = useWalletState();

  const mobileMenuItems = useMemo(() => [
    { label: "Leaderboard", action: () => { onOpenModal("leaderboard"); setShowMobileMenu(false); } },
    { label: "Settings", action: () => { onOpenModal("settings"); setShowMobileMenu(false); } },
    { label: "How to play", action: () => { onOpenModal("how"); setShowMobileMenu(false); } },
    { label: "About", action: () => { onOpenModal("about"); setShowMobileMenu(false); } },
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

  // Render the connect button based on wallet adapter
  const renderConnectButton = () => {
    if (isWagmi) return <ConnectButton />;
    // Nimiq: show a simple connected/disconnected badge
    if (isConnected && address) {
      return (
        <span className={styles.liveBadge} style={{ opacity: 0.8 }}>
          {shortenAddress(address)}
        </span>
      );
    }
    return (
      <Button variant="ghost" size="sm" onClick={async () => {
        const provider = (window as any).ethereum;
        if (provider?.request) {
          try { await provider.request({ method: "eth_requestAccounts" }); } catch {}
        }
      }}>
        Connect
      </Button>
    );
  };

  return (
    <>
      <header
        className={`${styles.header} ${isSmall ? styles.headerMobile : styles.headerDesktop}`}
        style={headerStyle}
      >
        <div className={`${styles.brandGroup} ${isSmall ? styles.brandGroupMobile : ''}`}>
          <span className={`${styles.brandName} ${isSmall ? styles.brandNameMobile : ''}`} style={brandStyle}>
            Kamikaze Ball
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
            {renderConnectButton()}
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
            {renderConnectButton()}
          </div>
        </div>
      )}
    </>
  );
}
