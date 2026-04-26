import React from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Modal(props: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 999,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          maxHeight: "85vh",
          overflow: "auto",
          background: "#0c0c0c",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{props.title}</h2>
          <button onClick={props.onClose} style={{ fontSize: 16 }}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 12 }}>{props.children}</div>

        {props.footer ? <div style={{ marginTop: 16 }}>{props.footer}</div> : null}
      </div>
    </div>
  );
}

