import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

import { colors, spacing, typography, radius } from "@/theme/tokens";

export type SubmissionStep = "validating" | "signing" | "ready" | "error" | "skipped";

const stepMessages: Record<SubmissionStep, string> = {
  validating: "Validating score and preparing submission…",
  signing: "Requesting backend signature…",
  ready: "Approve in your wallet to finalize.",
  skipped: "Your previous high score is higher, so this run won't replace it.",
  error: "",
};

const stepTitles: Record<SubmissionStep, string> = {
  validating: "Validating your score",
  signing: "Securing your score",
  ready: "Ready to submit",
  skipped: "Personal best maintained",
  error: "Score submission failed",
};

const steps = ["validating", "signing", "ready"] as const;

type Props = {
  score: number;
  step: SubmissionStep;
  errorMessage?: string;
  onRetry?: () => void;
  onClose: () => void;
};

export function ScoreSubmissionOverlay(props: Props) {
  const currentIdx = steps.indexOf(props.step as (typeof steps)[number]);

  return (
    <Modal title={stepTitles[props.step]} onClose={props.onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: typography.size["4xl"], fontWeight: typography.weight.bold, color: colors.text.primary }}>
            {props.score.toLocaleString()}
          </div>
          <div style={{ fontSize: typography.size.sm, color: colors.text.muted }}>pts</div>
        </div>

        {props.step !== "error" && (
          <p style={{ margin: 0, fontSize: typography.size.md, color: colors.text.secondary, textAlign: "center" }}>
            {stepMessages[props.step]}
          </p>
        )}

        {props.step === "error" && (
          <div style={{
            padding: spacing.lg,
            background: "rgba(239, 68, 68, 0.1)",
            border: `1px solid rgba(239, 68, 68, 0.3)`,
            borderRadius: radius.lg,
            color: colors.status.error,
            fontSize: typography.size.md,
            textAlign: "center",
          }}>
            {props.errorMessage ?? "An error occurred."}
          </div>
        )}

        {/* Progress Steps */}
        <div style={{ display: "flex", alignItems: "center", gap: spacing.xs, justifyContent: "center" }}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.xs,
              }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: typography.size.xs,
                  fontWeight: typography.weight.bold,
                  background: i < currentIdx ? colors.status.success : i === currentIdx ? colors.accent.primary : colors.border.default,
                  color: i <= currentIdx ? colors.text.primary : colors.text.muted,
                  transition: "all 0.3s ease",
                }}>
                  {i < currentIdx ? "✓" : i + 1}
                </div>
                <span style={{
                  fontSize: typography.size.xs,
                  color: i <= currentIdx ? colors.text.secondary : colors.text.muted,
                  textTransform: "capitalize",
                }}>
                  {s}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  width: 24,
                  height: 2,
                  background: i < currentIdx ? colors.status.success : colors.border.subtle,
                  transition: "background 0.3s ease",
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: "flex", gap: spacing.sm }}>
          <Button variant="ghost" onClick={props.onClose} style={{ flex: 1 }}>
            Close
          </Button>
          {props.step === "error" && props.onRetry && (
            <Button onClick={props.onRetry} style={{ flex: 1 }}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
