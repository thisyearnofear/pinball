import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { colors, typography, radius, spacing } from "@/theme/tokens";

/**
 * Activity Feed — a rolling, flavored event log shown in the lobby.
 *
 * Inspired by the "terminal panel" pattern from arcade UIs: every notable
 * game/tournament event is logged with a themed prefix so the lobby feels
 * alive and watched, even when nothing is actively happening.
 *
 * Core Principles:
 * - CLEAN: self-contained context + provider; no external state deps.
 * - PERFORMANT: entries are capped; auto-expire after a TTL.
 * - DRY: single source for event phrasing.
 */

export type ActivityKind =
  | "entry"
  | "score"
  | "drain"
  | "tournament"
  | "system"
  | "powerup";

export type ActivityEvent = {
  id: number;
  kind: ActivityKind;
  text: string;
  at: number; // timestamp
};

type ActivityContextType = {
  log: (kind: ActivityKind, text: string) => void;
  events: ActivityEvent[];
};

const ActivityContext = createContext<ActivityContextType>({
  log: () => {},
  events: [],
});

const MAX_EVENTS = 8;
const EVENT_TTL_MS = 45_000;

const KIND_META: Record<ActivityKind, { prefix: string; color: string; icon: string }> = {
  entry: { prefix: "ENTRY", color: colors.status.info, icon: "→" },
  score: { prefix: "SCORE", color: colors.accent.primary, icon: "▲" },
  drain: { prefix: "DRAIN", color: colors.status.error, icon: "◈" },
  tournament: { prefix: "ARENA", color: colors.status.warning, icon: "◆" },
  system: { prefix: "SYSTEM", color: colors.text.muted, icon: "•" },
  powerup: { prefix: "POWERUP", color: colors.status.success, icon: "✦" },
};

let nextEventId = 1;

export function ActivityFeedProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const pruneTimer = useRef<number | null>(null);

  const log = useCallback((kind: ActivityKind, text: string) => {
    const event: ActivityEvent = { id: nextEventId++, kind, text, at: Date.now() };
    setEvents((prev) => [...prev.slice(-(MAX_EVENTS - 1)), event]);
  }, []);

  // Prune expired events periodically.
  useEffect(() => {
    pruneTimer.current = window.setInterval(() => {
      const cutoff = Date.now() - EVENT_TTL_MS;
      setEvents((prev) => {
        const fresh = prev.filter((e) => e.at > cutoff);
        return fresh.length !== prev.length ? fresh : prev;
      });
    }, 10_000);
    return () => {
      if (pruneTimer.current) window.clearInterval(pruneTimer.current);
    };
  }, []);

  return (
    <ActivityContext.Provider value={{ log, events }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivityFeed() {
  return useContext(ActivityContext);
}

/**
 * The visual feed panel. Shows the most recent events with a blinking cursor
 * at the bottom, styled like a retro terminal readout.
 */
export function ActivityFeedPanel() {
  const { events } = useActivityFeed();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const now = Date.now();

  return (
    <div
      style={{
        background: "rgba(10, 10, 20, 0.6)",
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.lg,
        overflow: "hidden",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderBottom: `1px solid ${colors.border.subtle}`,
          background: "rgba(0, 0, 0, 0.25)",
        }}
      >
        <span
          style={{
            fontSize: typography.size.xs,
            fontWeight: typography.weight.bold,
            color: colors.accent.primary,
            letterSpacing: "0.1em",
            fontFamily: typography.fontFamilyMono,
          }}
        >
          ▸ LIVE FEED
        </span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: colors.status.success,
            boxShadow: `0 0 6px ${colors.status.success}`,
            animation: "feedPulse 1.6s ease-in-out infinite",
          }}
        />
      </div>
      <div
        ref={scrollRef}
        style={{
          padding: spacing.sm,
          maxHeight: 168,
          overflowY: "auto",
          scrollbarWidth: "none",
          fontFamily: typography.fontFamilyMono,
          fontSize: typography.size.xs,
          lineHeight: 1.7,
        }}
      >
        {events.length === 0 ? (
          <div style={{ color: colors.text.muted, padding: `${spacing.xs}px 0` }}>
            Awaiting arena activity…
          </div>
        ) : (
          events.map((e) => {
            const meta = KIND_META[e.kind];
            const ageSec = Math.floor((now - e.at) / 1000);
            return (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  gap: spacing.sm,
                  alignItems: "baseline",
                  animation: "feedLineIn 200ms ease",
                  opacity: Math.max(0.4, 1 - (now - e.at) / EVENT_TTL_MS),
                }}
              >
                <span style={{ color: meta.color, flexShrink: 0 }}>{meta.icon}</span>
                <span style={{ color: colors.text.muted, flexShrink: 0 }}>
                  [{meta.prefix}]
                </span>
                <span style={{ color: colors.text.secondary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.text}
                </span>
                <span style={{ color: colors.text.disabled, flexShrink: 0, fontSize: 10 }}>
                  {ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`}
                </span>
              </div>
            );
          })
        )}
        <div style={{ color: colors.accent.primary, marginTop: 2 }}>
          <span style={{ animation: "feedBlink 1s step-end infinite" }}>▊</span>
        </div>
      </div>
      <style>{`
        @keyframes feedLineIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes feedBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes feedPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
