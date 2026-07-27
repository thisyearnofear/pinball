"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "pinball_install_dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "0 auto 14px",
        maxWidth: 720,
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid rgba(168, 85, 247, 0.45)",
        background: "rgba(168, 85, 247, 0.12)",
        fontSize: 13,
        color: "#e9d5ff",
      }}
    >
      <span style={{ flex: 1 }}>Install Kamikaze Ball for fullscreen play</span>
      <button
        onClick={async () => {
          try {
            await deferred.prompt();
            await deferred.userChoice;
          } catch { /* noop */ }
          setDeferred(null);
        }}
        style={{
          padding: "5px 14px",
          borderRadius: 8,
          border: "none",
          background: "#a855f7",
          color: "#fff",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Install
      </button>
      <button
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, "1");
          setDeferred(null);
        }}
        aria-label="Dismiss install prompt"
        style={{
          background: "none",
          border: "none",
          color: "#c4b5fd",
          fontSize: 15,
          cursor: "pointer",
          padding: "2px 4px",
        }}
      >
        ✕
      </button>
    </div>
  );
}
