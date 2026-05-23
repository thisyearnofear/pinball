import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import styles from "./ScoreSubmissionOverlay.module.scss";

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
      <div className={styles.content}>
        <div className={styles.scoreDisplay}>
          <div className={styles.scoreValue}>
            {props.score.toLocaleString()}
          </div>
          <div className={styles.scoreUnit}>pts</div>
        </div>

        {props.step !== "error" && (
          <p className={styles.stepMessage}>
            {stepMessages[props.step]}
          </p>
        )}

        {props.step === "error" && (
          <div className={styles.errorBox}>
            {props.errorMessage ?? "An error occurred."}
          </div>
        )}

        <div className={styles.progressSteps}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={styles.stepWrapper}>
                <div className={`${styles.stepCircle} ${
                  i < currentIdx ? styles.stepCircleDone : i === currentIdx ? styles.stepCircleCurrent : styles.stepCircleFuture
                }`}>
                  {i < currentIdx ? "✓" : i + 1}
                </div>
                <span className={`${styles.stepLabel} ${i <= currentIdx ? styles.stepLabelActive : styles.stepLabelInactive}`}>
                  {s}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`${styles.stepDivider} ${i < currentIdx ? styles.stepDividerDone : styles.stepDividerPending}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className={styles.actions}>
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
