import React from "react";
import { Modal } from "./Modal";

export type SubmissionStep = "validating" | "signing" | "ready" | "error" | "skipped";

export function ScoreSubmissionOverlay(props: {
  score: number;
  step: SubmissionStep;
  errorMessage?: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const title =
    props.step === "error"
      ? "Score submission failed"
      : props.step === "skipped"
        ? "Personal best maintained"
        : props.step === "ready"
          ? "Ready to submit"
          : props.step === "signing"
            ? "Securing your score"
            : "Validating your score";

  return (
    <Modal
      title={title}
      onClose={props.onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <button onClick={props.onClose}>Close</button>
          {props.step === "error" && props.onRetry ? <button onClick={props.onRetry}>Try again</button> : null}
        </div>
      }
    >
      <div style={{ lineHeight: 1.6 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{props.score} pts</div>

        {props.step === "validating" ? <p>Validating score and preparing submission…</p> : null}
        {props.step === "signing" ? <p>Requesting backend signature…</p> : null}
        {props.step === "ready" ? <p>Approve in your wallet to finalize.</p> : null}
        {props.step === "skipped" ? <p>Your previous high score is higher, so this run won’t replace it.</p> : null}
        {props.step === "error" ? (
          <p style={{ color: "crimson" }}>{props.errorMessage ?? "An error occurred."}</p>
        ) : null}

        <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
          Steps: validating → signing → wallet confirmation
        </div>
      </div>
    </Modal>
  );
}

