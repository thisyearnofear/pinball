"use client";

import { useEffect, useState } from "react";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { STORED_INSTALL_DISMISSED } from "@/definitions/settings";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "prompt" | "installed" | "instructions";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>("prompt");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getFromStorage(STORED_INSTALL_DISMISSED) === "1") return;

    // Already running as installed PWA — hide the banner
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setState("installed");

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "installed") {
    return (
      <div
        style={{
          margin: "0 auto 14px",
          maxWidth: 720,
          padding: "8px 14px",
          borderRadius: 10,
          border: "1px solid rgba(34, 197, 94, 0.45)",
          background: "rgba(34, 197, 94, 0.1)",
          fontSize: 13,
          color: "#bbf7d0",
          textAlign: "center",
          animation: "fadeIn 300ms ease",
        }}
      >
        Kamikaze Ball installed! Open it from your home screen for fullscreen play.
      </div>
    );
  }

  if (state === "instructions") {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return (
      <div
        style={{
          margin: "0 auto 14px",
          maxWidth: 720,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(168, 85, 247, 0.45)",
          background: "rgba(168, 85, 247, 0.12)",
          fontSize: 13,
          color: "#e9d5ff",
          lineHeight: 1.5,
        }}
      >
        <strong>Install Kamikaze Ball</strong>
        {isIOS ? (
          <span> — tap the Share button <span style={{ fontSize: 15 }}>⬆</span> then "Add to Home Screen"</span>
        ) : (
          <span> — open your browser menu and select "Install app" or "Add to Home screen"</span>
        )}
        <button
          onClick={() => {
            setInStorage(STORED_INSTALL_DISMISSED, "1");
            setState("prompt");
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
            marginLeft: 6,
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  // No install prompt available and not dismissed — don't nag
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
            const choice = await deferred.userChoice;
            if (choice.outcome === "dismissed") {
              setState("instructions");
            }
          } catch {
            setState("instructions");
          }
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
          setInStorage(STORED_INSTALL_DISMISSED, "1");
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
