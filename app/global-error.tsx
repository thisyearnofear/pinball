"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0a0a0f",
          color: "rgba(255,255,255,0.85)",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: 32 }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Something went wrong
          </div>
          <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 24 }}>
            The error has been logged. Please refresh to try again.
          </div>
          <button
            onClick={() => reset()}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.85)",
              padding: "10px 24px",
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              borderRadius: 6,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
