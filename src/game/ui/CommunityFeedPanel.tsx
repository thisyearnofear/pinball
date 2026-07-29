import React, { useEffect, useRef, useState } from "react";
import { colors, typography, radius, spacing } from "@/theme/tokens";
import { fetchCommunityFeed, type CommunityRun } from "@/services/backend-scores-client";

/**
 * Community Feed — the persistent Socializer loop.
 *
 * Polls the backend for recent finished runs from ALL players and shows them
 * in the lobby, so the arena always feels shared and alive. Each row is a
 * rival to race: tapping a run opens a "beat this" friend-challenge flow.
 *
 * Unlike the session-scoped ActivityFeed, this is cross-player and
 * server-backed, giving returning players a living leaderboard of moments.
 */

const POLL_MS = 15_000;
const KAMI_KAZE = "kamikaze";

function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return "匿名 · anon";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatRun(run: CommunityRun): { score: string; verb: string } {
  if (run.mode === KAMI_KAZE) {
    return { score: `${(run.score / 1000).toFixed(1)}s`, verb: "drained in" };
  }
  return { score: run.score.toLocaleString(), verb: "scored" };
}

function timeAgo(at: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

type Props = {
  /** The local player's address, to hide their own runs (and mark rivals). */
  playerAddress?: string | null;
  /** Fired when the player taps a rival run to challenge it. */
  onChallengeRun?: (run: CommunityRun) => void;
};

export function CommunityFeedPanel(props: Props) {
  const [runs, setRuns] = useState<CommunityRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer: number | undefined;

    async function load() {
      const data = await fetchCommunityFeed(8);
      if (mounted.current) {
        setRuns(data);
        setLoaded(true);
      }
    }

    load();
    timer = window.setInterval(() => {
      load();
      setNow(Date.now());
    }, POLL_MS);

    return () => {
      mounted.current = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  const selfAddr = props.playerAddress?.toLowerCase();
  const rivalRuns = selfAddr ? runs.filter((r) => r.address.toLowerCase() !== selfAddr) : runs;

  return (
    <div
      style={{
        background: "rgba(10, 10, 20, 0.6)",
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.lg,
        overflow: "hidden",
        backdropFilter: "blur(4px)",
        marginBottom: spacing.lg,
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
            color: "#e34234",
            letterSpacing: "0.1em",
            fontFamily: typography.fontFamilyMono,
          }}
        >
          ▸ 道場 · THE DOJO IS OPEN
        </span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#e34234",
            boxShadow: "0 0 6px #e34234",
            animation: "communityPulse 1.6s ease-in-out infinite",
          }}
        />
      </div>

      <div
        style={{
          padding: spacing.sm,
          fontFamily: typography.fontFamilyMono,
          fontSize: typography.size.xs,
          lineHeight: 1.7,
        }}
      >
        {!loaded && (
          <div style={{ color: colors.text.muted, padding: `${spacing.xs}px 0` }}>
            Listening for rival warriors…
          </div>
        )}

        {loaded && rivalRuns.length === 0 && (
          <div style={{ color: colors.text.muted, padding: `${spacing.xs}px 0` }}>
            The dojo is quiet. Be the first to leave a mark.
          </div>
        )}

        {rivalRuns.map((run, i) => {
          const { score, verb } = formatRun(run);
          const isKamikaze = run.mode === KAMI_KAZE;
          return (
            <div
              key={`${run.address}-${run.at}-${i}`}
              onClick={() => props.onChallengeRun?.(run)}
              role={props.onChallengeRun ? "button" : undefined}
              tabIndex={props.onChallengeRun ? 0 : undefined}
              onKeyDown={(e) => { if (props.onChallengeRun && (e.key === "Enter" || e.key === " ")) props.onChallengeRun?.(run); }}
              style={{
                display: "flex",
                gap: spacing.sm,
                alignItems: "baseline",
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: radius.sm,
                cursor: props.onChallengeRun ? "pointer" : "default",
                animation: "communityLineIn 200ms ease",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(227,66,52,0.08)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ color: isKamikaze ? "#e34234" : colors.accent.primary, flexShrink: 0 }}>
                {isKamikaze ? "◈" : "▲"}
              </span>
              <span style={{ color: colors.accent.primary, flexShrink: 0 }}>
                {shortAddress(run.address)}
              </span>
              <span style={{ color: colors.text.secondary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {verb} <strong style={{ color: colors.text.primary }}>{score}</strong>
                {props.onChallengeRun && (
                  <span style={{ color: colors.text.muted }}> · tap to challenge</span>
                )}
              </span>
              <span style={{ color: colors.text.disabled, flexShrink: 0, fontSize: 10 }}>
                {timeAgo(run.at, now)}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes communityLineIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes communityPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
